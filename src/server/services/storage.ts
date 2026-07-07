import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { join, dirname } from "path";

export const isR2Configured = Boolean(
  process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_ACCESS_KEY_ID !== "PLACEHOLDER" &&
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCOUNT_ID !== "PLACEHOLDER"
);

function getLocalUploadDir(): string {
  if (process.env.VERCEL) return "/tmp/uploads";
  return join(process.cwd(), ".local-uploads");
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export interface UploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  isLocal: boolean;
}

export async function getUploadUrl(
  storageKey: string,
  contentType: string
): Promise<UploadUrlResult> {
  if (isR2Configured) {
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: storageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    return { uploadUrl, storageKey, isLocal: false };
  }

  // Local/demo fallback — upload goes through /api/upload (uses /tmp on Vercel)
  return {
    uploadUrl: `/api/upload?key=${encodeURIComponent(storageKey)}`,
    storageKey,
    isLocal: true,
  };
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function getPublicUrl(storageKey: string): string {
  // Sanitize storage key to prevent path traversal
  const safeKey = storageKey.replace(/\.\./g, "").replace(/\/\//g, "/");

  // Always go through the auth'd /api/uploads/ route, regardless of whether
  // R2 is configured. The route streams from R2 via fetchFromStorage when
  // configured, or from local disk otherwise. This guarantees every evidence
  // request re-checks org membership + project access before returning bytes.
  // R2_PUBLIC_URL is no longer used as a direct CDN endpoint for evidence —
  // serving evidence via a public bucket bypassed all auth and is a leak.
  return `/api/uploads/${safeKey.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Verify the storage object exists and return its size. Used by
 * evidence.confirm so a client cannot confirm an upload that never landed,
 * or claim a size different from what's actually stored.
 *
 * Returns `{ exists: false }` when the object is missing rather than
 * throwing, so callers can produce friendly error messages.
 */
export async function statStoredObject(
  storageKey: string
): Promise<{ exists: boolean; size?: number }> {
  if (isR2Configured) {
    const client = getS3Client();
    try {
      const res = await client.send(
        new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: storageKey,
        })
      );
      return { exists: true, size: res.ContentLength };
    } catch (err) {
      const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })
        ?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (code === "NotFound" || code === "NoSuchKey" || status === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  const { stat } = await import("fs/promises");
  try {
    const s = await stat(join(getLocalUploadDir(), storageKey));
    return { exists: true, size: s.size };
  } catch {
    return { exists: false };
  }
}

/**
 * Server-only. Returns a `data:` URL with the object's bytes inlined as
 * base64. Used by the report generator to embed evidence images in HTML
 * before Puppeteer rasterises it — Puppeteer has no Clerk session, so it
 * cannot fetch from /api/uploads/. Returns null if the object is missing.
 */
export async function getInlineDataUrl(
  storageKey: string
): Promise<string | null> {
  const bytes = await fetchFromStorage(storageKey);
  if (!bytes) return null;
  const ext = storageKey.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Server-only. Returns a short-lived presigned GET URL for the object so
 * Puppeteer can stream images over HTTP instead of carrying base64 data
 * URLs through report HTML (which multiplies memory and, when returned
 * from an Inngest step, blows the ~4MB step-output cap).
 * Local fallback (no R2): inline data URL — dev-only volumes are small.
 */
export async function getReadUrl(
  storageKey: string,
  expiresInSeconds = 900
): Promise<string | null> {
  if (isR2Configured) {
    const client = getS3Client();
    const exists = await statStoredObject(storageKey);
    if (!exists.exists) return null;
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: storageKey,
      }),
      { expiresIn: expiresInSeconds }
    );
  }
  return getInlineDataUrl(storageKey);
}

/**
 * Server-side upload. Used for artifacts the server produces (report PDFs,
 * thumbnails) rather than direct browser → R2 uploads.
 * - R2 configured: PutObject to the configured bucket
 * - Local fallback: write to /tmp/uploads or .local-uploads/
 */
export async function uploadToStorage(
  storageKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (isR2Configured) {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: storageKey,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const filePath = join(getLocalUploadDir(), storageKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
}

/**
 * Server-side fetch. Used by the PDF route to stream report bytes through
 * the auth+password-aware handler without ever exposing a public R2 URL.
 * Returns null if the object does not exist.
 */
export async function fetchFromStorage(
  storageKey: string
): Promise<Buffer | null> {
  if (isR2Configured) {
    const client = getS3Client();
    try {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: storageKey,
        })
      );
      if (!res.Body) return null;
      // AWS SDK v3 returns a readable stream — collect into a buffer
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      const code = (err as { name?: string })?.name;
      if (code === "NoSuchKey" || code === "NotFound") return null;
      throw err;
    }
  }

  const { readFile } = await import("fs/promises");
  try {
    return await readFile(join(getLocalUploadDir(), storageKey));
  } catch {
    return null;
  }
}
