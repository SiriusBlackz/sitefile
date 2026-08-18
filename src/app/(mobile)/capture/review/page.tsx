"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  Loader2,
  AlertCircle,
  Trash2,
  Camera,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  addToQueue as addOffline,
  getStashedCapture,
  clearStashedCapture,
  type OfflineCapture,
} from "@/lib/offline-queue";
import { usePWA } from "@/lib/use-pwa";
import { pointInPolygon } from "@/lib/geo";
import {
  beginForegroundUpload,
  endForegroundUpload,
} from "@/lib/upload-coordinator";
import { MapPin, SkipForward } from "lucide-react";

// Image types accepted by evidence.getUploadUrl (kept in sync with the
// server's ALLOWED_MIME_TYPES — importing the router here would pull server
// code into the client bundle).
const UPLOADABLE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

interface ReviewPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  taskId: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  progress: number;
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const sessionId = searchParams.get("session") ?? "";

  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { isOnline } = usePWA();

  // Hydrate from IndexedDB staging store on mount.
  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setHydrated(true);
      return;
    }
    getStashedCapture(sessionId)
      .then((stash) => {
        if (cancelled || !stash) {
          setHydrated(true);
          return;
        }
        setPhotos(
          stash.photos.map((p) => ({
            id: p.id,
            blob: p.blob,
            previewUrl: URL.createObjectURL(p.blob),
            timestamp: p.timestamp,
            latitude: p.latitude,
            longitude: p.longitude,
            note: "",
            taskId: "",
            status: "pending" as const,
            progress: 0,
          }))
        );
        setHydrated(true);
      })
      .catch((err) => {
        console.error("[review] hydrate failed:", err);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Revoke object URLs on unmount to free blob memory.
  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: capture URLs at unmount
  }, []);

  const { data: tasks = [], isLoading: tasksLoading } = trpc.task.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );
  // Zones power the at-the-shutter tag suggestion: a photo inside a zone
  // with a default task gets a one-tap tag while the person who knows
  // the answer is still standing in front of the work.
  const { data: zones = [] } = trpc.zone.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  function suggestFor(photo: ReviewPhoto) {
    if (photo.latitude == null || photo.longitude == null) return null;
    for (const zone of zones) {
      const polygon = zone.polygon as { coordinates: number[][][] };
      if (
        zone.defaultTaskId &&
        pointInPolygon([photo.longitude, photo.latitude], polygon.coordinates)
      ) {
        const task = tasks.find((t) => t.id === zone.defaultTaskId);
        if (task) return { taskId: task.id, taskName: task.name, zoneName: zone.name };
      }
    }
    return null;
  }

  function advanceToNextPending(fromIdx: number) {
    const next = photos.findIndex(
      (p, i) => i > fromIdx && p.status === "pending" && !p.taskId
    );
    if (next >= 0) setSelectedIdx(next);
  }

  const getUploadUrl = trpc.evidence.getUploadUrl.useMutation();
  const confirmUpload = trpc.evidence.confirm.useMutation();
  const linkEvidence = trpc.evidence.link.useMutation();

  // Redirect if no photos (after hydration completes — otherwise the empty
  // initial state would bounce us straight back to capture).
  useEffect(() => {
    if (hydrated && photos.length === 0) {
      router.replace(`/capture?projectId=${projectId}`);
    }
  }, [hydrated, photos.length, projectId, router]);

  const selected = photos[selectedIdx];

  function updatePhoto(id: string, update: Partial<ReviewPhoto>) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...update } : p))
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      if (selectedIdx >= next.length) setSelectedIdx(Math.max(0, next.length - 1));
      return next;
    });
  }

  // Upload a single photo
  async function uploadOne(photo: ReviewPhoto) {
    beginForegroundUpload();
    try {
      await uploadOneInner(photo);
    } finally {
      endForegroundUpload();
    }
  }

  async function uploadOneInner(photo: ReviewPhoto) {
    const blob = photo.blob;
    // Library-picked photos may not be JPEG — honour the blob's real type,
    // narrowed to the types the upload endpoint accepts.
    const rawType = UPLOADABLE_IMAGE_TYPES.find((t) => t === blob.type);
    const mimeType = rawType ?? "image/jpeg";
    const ext =
      mimeType === "image/png" ? "png"
      : mimeType === "image/webp" ? "webp"
      : mimeType === "image/heic" ? "heic"
      : mimeType === "image/heif" ? "heif"
      : "jpg";
    const filename = `capture-${Date.now()}.${ext}`;

    updatePhoto(photo.id, { status: "uploading", progress: 0 });

    try {
      // 1. Get upload URL
      const { uploadUrl, storageKey, isLocal } =
        await getUploadUrl.mutateAsync({
          projectId,
          filename,
          contentType: mimeType,
          fileSizeBytes: blob.size,
        });

      // 2. Upload via XHR for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            updatePhoto(photo.id, {
              progress: Math.round((e.loaded / e.total) * 100),
            });
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        if (isLocal) {
          xhr.open("POST", uploadUrl);
          xhr.setRequestHeader("Content-Type", mimeType);
          xhr.send(blob);
        } else {
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", mimeType);
          xhr.send(blob);
        }
      });

      // 3. Confirm
      const evidence = await confirmUpload.mutateAsync({
        projectId,
        storageKey,
        originalFilename: filename,
        fileSizeBytes: blob.size,
        mimeType,
        capturedAt: photo.timestamp,
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        note: photo.note || undefined,
      });

      // 4. Link to task if selected
      if (photo.taskId && evidence) {
        const suggested = suggestFor(photo);
        await linkEvidence.mutateAsync({
          evidenceId: evidence.id,
          taskId: photo.taskId,
          linkMethod:
            suggested && suggested.taskId === photo.taskId
              ? "ai_suggested"
              : "manual",
        });
      }

      updatePhoto(photo.id, { status: "done", progress: 100 });
    } catch (err) {
      updatePhoto(photo.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  // Upload all photos
  async function uploadAll() {
    if (!isOnline) {
      // Queue for offline upload — blobs go straight to IndexedDB, no
      // data-URL round-trip required.
      for (const photo of photos) {
        const mimeType = photo.blob.type || "image/jpeg";
        const item: OfflineCapture = {
          id: photo.id,
          projectId,
          blob: photo.blob,
          filename: `capture-${Date.now()}.jpg`,
          mimeType,
          capturedAt: photo.timestamp,
          latitude: photo.latitude,
          longitude: photo.longitude,
          altitude: null,
          note: photo.note,
          taskId: photo.taskId || null,
          status: "pending",
          createdAt: Date.now(),
        };
        await addOffline(item);
      }
      toast.success(
        `${photos.length} photo${photos.length !== 1 ? "s" : ""} queued for upload when back online`
      );
      if (sessionId) await clearStashedCapture(sessionId);
      router.push("/");
      return;
    }

    setUploading(true);
    beginForegroundUpload();
    let failures = 0;
    try {
      // Failed photos are retryable — a partial batch must never dead-end.
      const targets = photos.filter(
        (p) => p.status === "pending" || p.status === "error"
      );
      for (const photo of targets) {
        await uploadOneInner(photo);
      }
    } finally {
      endForegroundUpload();
      setUploading(false);
    }
    setPhotos((prev) => {
      failures = prev.filter((p) => p.status === "error").length;
      if (failures > 0) {
        toast.error(
          `${failures} photo${failures === 1 ? "" : "s"} failed to upload — tap Retry to try again.`
        );
      }
      return prev;
    });
  }

  const doneCount = photos.filter((p) => p.status === "done").length;
  const allDone = doneCount === photos.length && photos.length > 0;

  if (photos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 bg-zinc-900 px-4 py-3">
        <button
          onClick={async () => {
            const remaining = photos.filter((p) => p.status !== "done").length;
            if (remaining > 0) {
              const ok = window.confirm(
                `Discard ${remaining} photo${remaining !== 1 ? "s" : ""}?`
              );
              if (!ok) return;
              if (sessionId) await clearStashedCapture(sessionId);
            }
            router.back();
          }}
          aria-label="Back to capture"
          className="rounded-full p-1.5 active:bg-zinc-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">
            Review {photos.length} Photo{photos.length !== 1 ? "s" : ""}
          </h1>
          {doneCount > 0 && (
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-zinc-400"
            >
              {doneCount} of {photos.length} uploaded
            </p>
          )}
        </div>
      </div>

      {/* Selected photo preview */}
      {selected && (
        <div className="relative flex-shrink-0 bg-black" style={{ height: "40dvh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- camera blob URL */}
          <img
            src={selected.previewUrl}
            alt=""
            className="h-full w-full object-contain"
          />
          {selected.status === "done" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <CheckCircle className="h-12 w-12 text-green-400" />
            </div>
          )}
          {selected.status === "uploading" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${selected.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Photo strip */}
      <div className="flex gap-1.5 overflow-x-auto bg-zinc-900 px-3 py-2">
        {photos.map((photo, idx) => (
          <button
            key={photo.id}
            onClick={() => setSelectedIdx(idx)}
            className={`relative h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden border-2 ${
              idx === selectedIdx
                ? "border-primary"
                : "border-transparent"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- camera data URL */}
            <img
              src={photo.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {photo.status === "done" && (
              <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-400" />
              </div>
            )}
            {photo.status === "error" && (
              <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
            )}
            {photo.status === "uploading" && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Edit panel for selected photo */}
      {selected &&
        (selected.status === "pending" || selected.status === "error") && (
        <div className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-3 space-y-3">
          {selected.status === "error" && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2"
            >
              <p className="text-xs text-red-400">
                Upload failed{selected.error ? ` — ${selected.error}` : ""}.
                Your photo is safe on this phone.
              </p>
              <button
                onClick={() => uploadOne(selected)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:brightness-95"
              >
                Retry this photo
              </button>
            </div>
          )}
          {(() => {
            const suggestion = suggestFor(selected);
            if (selected.taskId) return null;
            return (
              <div className="space-y-2">
                {suggestion ? (
                  <button
                    onClick={() => {
                      updatePhoto(selected.id, { taskId: suggestion.taskId });
                      advanceToNextPending(selectedIdx);
                    }}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-left active:brightness-95"
                  >
                    <MapPin className="h-6 w-6 shrink-0 text-primary-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold leading-tight text-primary-foreground">
                        Tag: {suggestion.taskName}
                      </span>
                      <span className="block text-xs text-primary-foreground/80">
                        You&apos;re in {suggestion.zoneName}
                      </span>
                    </span>
                  </button>
                ) : selected.latitude == null ? (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    No GPS on this photo — pick its task below, or sort it in
                    the gallery later.
                  </p>
                ) : null}
                <button
                  onClick={() => advanceToNextPending(selectedIdx)}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 active:bg-zinc-800"
                >
                  <SkipForward className="h-4 w-4" />
                  Sort it later
                </button>
              </div>
            );
          })()}

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">
              Link to Task
            </label>
            <Select
              value={selected.taskId}
              disabled={tasksLoading}
              onValueChange={(val) =>
                updatePhoto(selected.id, {
                  taskId: val === "__none__" ? "" : (val ?? ""),
                })
              }
            >
              <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-white">
                {tasksLoading ? (
                  <span className="flex flex-1 text-left text-zinc-500">
                    Loading tasks…
                  </span>
                ) : (
                  <SelectValue placeholder="Select a task..." />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {tasks.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    // Long task names must stay distinguishable at 390px: the
                    // item text wrapper is nowrap + shrink-0 by default, which
                    // hard-clips mid-letter inside the popup.
                    className="[&>div]:min-w-0 [&>div]:shrink [&>div]:whitespace-normal"
                  >
                    {"—".repeat(t.depth)} {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">
              Note (optional)
            </label>
            <Textarea
              value={selected.note}
              onChange={(e) =>
                updatePhoto(selected.id, { note: e.target.value })
              }
              placeholder="Add a note about this photo..."
              rows={2}
              className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {new Date(selected.timestamp).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {selected.latitude != null ? (
              <span>
                GPS: {selected.latitude.toFixed(4)},{" "}
                {selected.longitude?.toFixed(4)}
              </span>
            ) : (
              <span className="text-amber-400">No GPS</span>
            )}
          </div>

          <button
            onClick={() => removePhoto(selected.id)}
            className="flex items-center gap-1.5 text-xs text-red-400 active:text-red-300"
          >
            <Trash2 className="h-3 w-3" />
            Remove this photo
          </button>
        </div>
      )}

      {/* All done state */}
      {allDone && (
        <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 px-6 text-center gap-3">
          <CheckCircle className="h-16 w-16 text-green-400" />
          <h2 className="text-lg font-semibold">All Photos Uploaded</h2>
          <p className="text-sm text-zinc-400">
            {photos.length} photo{photos.length !== 1 ? "s" : ""} successfully
            uploaded to your project.
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="border-zinc-700 text-white"
              onClick={async () => {
                if (sessionId) await clearStashedCapture(sessionId);
                router.push(`/capture?projectId=${projectId}`);
              }}
            >
              <Camera className="mr-1 h-4 w-4" />
              Take More
            </Button>
            <Button
              onClick={async () => {
                if (sessionId) await clearStashedCapture(sessionId);
                router.push(`/projects/${projectId}/evidence`);
              }}
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              View Gallery
            </Button>
          </div>
          {/* Forward pointer — without it the flow dead-ends here and
              zones (which power AI linking) never get drawn. */}
          <button
            className="mt-1 text-sm text-amber-400 active:text-amber-300"
            onClick={async () => {
              if (sessionId) await clearStashedCapture(sessionId);
              router.push(`/projects/${projectId}/zones`);
            }}
          >
            Next step: GPS zones →
          </button>
        </div>
      )}

      {/* Upload button */}
      {!allDone && (
        <button
          onClick={uploadAll}
          disabled={
            uploading ||
            photos.every(
              (p) => p.status !== "pending" && p.status !== "error"
            )
          }
          className="flex items-center justify-center gap-2 bg-primary py-4 text-sm font-semibold text-primary-foreground active:brightness-95 disabled:bg-zinc-800 disabled:text-zinc-500 safe-bottom"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : !isOnline ? (
            <>
              <Upload className="h-4 w-4" />
              Save Offline ({photos.filter((p) => p.status === "pending").length})
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {photos.some((p) => p.status === "pending")
                ? `Upload ${photos.filter((p) => p.status === "pending" || p.status === "error").length} Photo${photos.filter((p) => p.status === "pending" || p.status === "error").length !== 1 ? "s" : ""}`
                : `Retry ${photos.filter((p) => p.status === "error").length} failed`}
            </>
          )}
        </button>
      )}
    </>
  );
}
