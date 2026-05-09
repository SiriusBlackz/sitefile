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

  const { data: tasks = [] } = trpc.task.list.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

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
    const blob = photo.blob;
    const filename = `capture-${Date.now()}.jpg`;

    updatePhoto(photo.id, { status: "uploading", progress: 0 });

    try {
      // 1. Get upload URL
      const { uploadUrl, storageKey, isLocal } =
        await getUploadUrl.mutateAsync({
          projectId,
          filename,
          contentType: "image/jpeg",
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
          xhr.setRequestHeader("Content-Type", "image/jpeg");
          xhr.send(blob);
        } else {
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", "image/jpeg");
          xhr.send(blob);
        }
      });

      // 3. Confirm
      const evidence = await confirmUpload.mutateAsync({
        projectId,
        storageKey,
        originalFilename: filename,
        fileSizeBytes: blob.size,
        mimeType: "image/jpeg",
        capturedAt: photo.timestamp,
        latitude: photo.latitude ?? null,
        longitude: photo.longitude ?? null,
        note: photo.note || undefined,
      });

      // 4. Link to task if selected
      if (photo.taskId && evidence) {
        await linkEvidence.mutateAsync({
          evidenceId: evidence.id,
          taskId: photo.taskId,
          linkMethod: "manual",
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
        const item: OfflineCapture = {
          id: photo.id,
          projectId,
          blob: photo.blob,
          filename: `capture-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
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
    const pending = photos.filter((p) => p.status === "pending");
    for (const photo of pending) {
      await uploadOne(photo);
    }
    setUploading(false);
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
          onClick={() => router.back()}
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
                className="h-full bg-blue-500 transition-all"
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
                ? "border-blue-500"
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
      {selected && selected.status === "pending" && (
        <div className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">
              Link to Task
            </label>
            <Select
              value={selected.taskId}
              onValueChange={(val) =>
                updatePhoto(selected.id, {
                  taskId: val === "__none__" ? "" : (val ?? ""),
                })
              }
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                <SelectValue placeholder="Select a task..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
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
            {selected.latitude != null && (
              <span>
                GPS: {selected.latitude.toFixed(4)},{" "}
                {selected.longitude?.toFixed(4)}
              </span>
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
        </div>
      )}

      {/* Upload button */}
      {!allDone && (
        <button
          onClick={uploadAll}
          disabled={uploading || photos.every((p) => p.status !== "pending")}
          className="flex items-center justify-center gap-2 bg-blue-600 py-4 text-sm font-semibold active:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 safe-bottom"
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
              Upload {photos.filter((p) => p.status === "pending").length} Photo
              {photos.filter((p) => p.status === "pending").length !== 1 ? "s" : ""}
            </>
          )}
        </button>
      )}
    </>
  );
}
