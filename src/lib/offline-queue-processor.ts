/**
 * Drains the IndexedDB offline capture queue. Was the gap behind the
 * "photos queue but never upload" bug — the SW sync handler was wired but
 * nothing ever called the upload pipeline against the stored blobs.
 *
 * The processor is single-flight (a module-level mutex) so the various
 * triggers (online event, SW background sync, visibility change, manual
 * retry) don't race. Errors are split into:
 *   - permanent (4xx tRPC errors): mark the item `error` so the user can
 *     see and retry/delete it
 *   - transient (network, 5xx): leave the item `pending` so the next
 *     trigger picks it up. No exponential backoff — the triggers are sparse
 *     enough (online flip, visibility change, ~30s indicator polling) that
 *     a tight retry loop isn't a concern.
 */
"use client";

import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/routers/_app";
import {
  getPendingQueue,
  updateQueueItem,
  removeFromQueue,
  type OfflineCapture,
} from "./offline-queue";

type Client = ReturnType<typeof createTRPCProxyClient<AppRouter>>;

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

let processing = false;
let cachedClient: Client | null = null;

function getClient(): Client {
  if (!cachedClient) {
    cachedClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          fetch: (url, opts) =>
            fetch(url, { ...opts, credentials: "include" }),
        }),
      ],
    });
  }
  return cachedClient;
}

export interface ProcessQueueResult {
  attempted: number;
  succeeded: number;
  failed: number;
  remaining: number;
  skipped: boolean;
}

export async function processOfflineQueue(): Promise<ProcessQueueResult> {
  if (typeof window === "undefined") {
    return { attempted: 0, succeeded: 0, failed: 0, remaining: 0, skipped: true };
  }
  if (processing) {
    return { attempted: 0, succeeded: 0, failed: 0, remaining: 0, skipped: true };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const remaining = (await getPendingQueue()).length;
    return { attempted: 0, succeeded: 0, failed: 0, remaining, skipped: true };
  }

  processing = true;
  window.dispatchEvent(new CustomEvent("queue-sync-start"));

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const client = getClient();
    const items = await getPendingQueue();

    for (const item of items) {
      attempted++;
      try {
        await updateQueueItem(item.id, { status: "uploading" });
        await uploadOne(client, item);
        await removeFromQueue(item.id);
        succeeded++;
      } catch (err) {
        const permanent = isPermanentError(err);
        if (permanent) {
          await updateQueueItem(item.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed",
          });
          failed++;
        } else {
          // Reset back to pending so the next trigger retries.
          await updateQueueItem(item.id, {
            status: "pending",
            error:
              err instanceof Error
                ? err.message
                : "Upload failed (will retry)",
          });
        }
      }
    }
    return {
      attempted,
      succeeded,
      failed,
      remaining: (await getPendingQueue()).length,
      skipped: false,
    };
  } finally {
    processing = false;
    const remaining = await getPendingQueue()
      .then((q) => q.length)
      .catch(() => 0);
    window.dispatchEvent(
      new CustomEvent("queue-sync-end", {
        detail: { attempted, succeeded, failed, remaining },
      })
    );
  }
}

async function uploadOne(client: Client, item: OfflineCapture): Promise<void> {
  if (!SUPPORTED_MIME_TYPES.includes(item.mimeType as SupportedMimeType)) {
    throw new Error(`Unsupported mime type: ${item.mimeType}`);
  }
  const contentType = item.mimeType as SupportedMimeType;

  // 1. Mint upload URL (records an upload intent server-side)
  const { uploadUrl, storageKey, isLocal } =
    await client.evidence.getUploadUrl.mutate({
      projectId: item.projectId,
      filename: item.filename,
      contentType,
      fileSizeBytes: item.blob.size,
    });

  // 2. Push the blob — XHR for symmetry with the existing upload paths.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    if (isLocal) {
      xhr.open("POST", uploadUrl);
    } else {
      xhr.open("PUT", uploadUrl);
    }
    xhr.setRequestHeader("Content-Type", item.mimeType);
    xhr.send(item.blob);
  });

  // 3. Confirm — server HEAD-checks R2 + consumes the upload intent
  const evidence = await client.evidence.confirm.mutate({
    projectId: item.projectId,
    storageKey,
    originalFilename: item.filename,
    fileSizeBytes: item.blob.size,
    mimeType: item.mimeType,
    capturedAt: item.capturedAt,
    latitude: item.latitude,
    longitude: item.longitude,
    altitude: item.altitude,
    note: item.note || undefined,
  });

  // 4. Link to task if requested at capture time
  if (item.taskId && evidence) {
    await client.evidence.link.mutate({
      evidenceId: evidence.id,
      taskId: item.taskId,
      linkMethod: "manual",
    });
  }
}

function isPermanentError(err: unknown): boolean {
  if (err instanceof TRPCClientError) {
    const status = (err.data as { httpStatus?: number } | null)?.httpStatus;
    // 4xx = client error: stale auth, missing intent, validation. Won't
    // self-heal by retrying. 5xx + network errors = transient.
    if (typeof status === "number" && status >= 400 && status < 500) {
      // 401 is special — auth might come back if user re-signs-in. Treat
      // as transient so a re-login picks the queue back up automatically.
      if (status === 401) return false;
      return true;
    }
  }
  // Plain HTTP errors from XHR (e.g. R2 PUT 403) — extract status.
  if (err instanceof Error) {
    const match = /HTTP (\d{3})/.exec(err.message);
    if (match) {
      const status = parseInt(match[1], 10);
      if (status === 401) return false;
      return status >= 400 && status < 500;
    }
  }
  return false;
}
