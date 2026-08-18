"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  beginForegroundUpload,
  endForegroundUpload,
} from "@/lib/upload-coordinator";
import { RotateCcw } from "lucide-react";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

type AllowedMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif" | "video/mp4" | "video/quicktime" | "video/webm";

interface QueueItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "confirming" | "done" | "error";
  progress: number;
  error?: string;
  previewUrl?: string;
}

interface UploadQueueProps {
  projectId: string;
  /** Fires once when the whole batch has finished. */
  onUploadComplete?: () => void;
  /** Fires after each file is confirmed, so callers can refresh the grid
      as photos land instead of waiting for the slowest file. */
  onFileUploaded?: () => void;
}

async function extractExif(
  file: File
): Promise<{
  capturedAt?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  exifData?: Record<string, unknown>;
}> {
  try {
    const exifr = await import("exifr");
    const data = await exifr.parse(file, {
      gps: true,
      exif: true,
      iptc: false,
      xmp: false,
    });
    if (!data) return {};

    return {
      capturedAt: data.DateTimeOriginal
        ? new Date(data.DateTimeOriginal).toISOString()
        : undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      altitude: data.GPSAltitude ?? undefined,
      exifData: data,
    };
  } catch {
    return {};
  }
}

function uploadFile(
  url: string,
  file: File,
  isLocal: boolean,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));

    if (isLocal) {
      // Local fallback: POST raw body with key in URL
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    } else {
      // R2 presigned URL: PUT
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    }
  });
}

export function UploadQueue({ projectId, onUploadComplete, onFileUploaded }: UploadQueueProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getUploadUrl = trpc.evidence.getUploadUrl.useMutation();
  const confirm = trpc.evidence.confirm.useMutation();

  const updateItem = useCallback(
    (id: string, update: Partial<QueueItem>) => {
      setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...update } : item)));
    },
    []
  );

  const processFile = useCallback(
    async (item: QueueItem) => {
      try {
        // 1. Get upload URL
        updateItem(item.id, { status: "uploading", progress: 0 });
        const { uploadUrl, storageKey, isLocal } = await getUploadUrl.mutateAsync({
          projectId,
          filename: item.file.name,
          contentType: item.file.type as AllowedMimeType,
          fileSizeBytes: item.file.size,
        });

        // 2. Extract EXIF
        const exif = await extractExif(item.file);

        // 3. Upload file
        await uploadFile(uploadUrl, item.file, isLocal, (pct) =>
          updateItem(item.id, { progress: pct })
        );

        // 4. Confirm
        updateItem(item.id, { status: "confirming", progress: 100 });
        await confirm.mutateAsync({
          projectId,
          storageKey,
          originalFilename: item.file.name,
          fileSizeBytes: item.file.size,
          mimeType: item.file.type,
          capturedAt: exif.capturedAt ?? null,
          latitude: exif.latitude ?? null,
          longitude: exif.longitude ?? null,
          altitude: exif.altitude ?? null,
          exifData: exif.exifData ?? null,
        });

        updateItem(item.id, { status: "done" });
        onFileUploaded?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        updateItem(item.id, { status: "error", error: message });
      }
    },
    [projectId, getUploadUrl, confirm, updateItem, onFileUploaded]
  );

  async function runPool(items: QueueItem[]) {
    beginForegroundUpload();
    try {
      const work = [...items];
      const workers = Array.from(
        { length: Math.min(3, work.length) },
        async () => {
          for (let item = work.shift(); item; item = work.shift()) {
            await processFile(item);
          }
        }
      );
      await Promise.all(workers);
    } finally {
      endForegroundUpload();
    }
    onUploadComplete?.();
    setQueue((prev) => {
      const failed = prev.filter((i) => i.status === "error").length;
      if (failed > 0) {
        toast.error(
          `${failed} file${failed === 1 ? "" : "s"} failed to upload — use Retry on each row.`
        );
      }
      return prev;
    });
  }

  async function retryItem(item: QueueItem) {
    beginForegroundUpload();
    try {
      updateItem(item.id, { status: "pending", error: undefined, progress: 0 });
      await processFile({ ...item, status: "pending", error: undefined });
    } finally {
      endForegroundUpload();
    }
    onUploadComplete?.();
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (ALLOWED_MIME_TYPES.has(file.type)) {
        accepted.push(file);
      } else {
        rejected.push(file.name);
      }
    }
    if (rejected.length > 0) {
      toast.error(`Unsupported file type: ${rejected.join(", ")}. Accepted: JPEG, PNG, WebP, HEIC, MP4, MOV, WebM`);
    }
    if (accepted.length === 0) return;

    const newItems: QueueItem[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as const,
      progress: 0,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));

    setQueue((q) => [...q, ...newItems]);

    // Bounded concurrency: 3 uploads at a time. Firing the whole batch at
    // once hammered the rate budget and made big drops fail unpredictably.
    void runPool(newItems);
  }

  function removeItem(id: string) {
    setQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return q.filter((i) => i.id !== id);
    });
  }

  const doneCount = queue.filter((i) => i.status === "done").length;
  const totalCount = queue.length;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("border-primary");
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove("border-primary");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-primary");
            handleFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop photos/videos here or click to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {queue.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {doneCount} of {totalCount} uploaded
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border p-2"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob preview URL
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-10 w-10 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-muted shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{item.file.name}</p>
                {item.status === "uploading" && (
                  <div className="h-1.5 w-full rounded-full bg-muted mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.error && (
                  <p className="text-xs text-destructive mt-0.5">{item.error}</p>
                )}
              </div>

              <div className="shrink-0">
                {item.status === "done" && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {item.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                {(item.status === "uploading" || item.status === "confirming") && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {item.status === "error" && (
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Retry ${item.file.name}`}
                    onClick={() => retryItem(item)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                {(item.status === "done" || item.status === "error") && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeItem(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
