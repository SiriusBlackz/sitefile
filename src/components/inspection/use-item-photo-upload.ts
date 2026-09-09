"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { addToQueue } from "@/lib/offline-queue";

/**
 * Upload photos for a register item through the ordinary evidence path
 * (presign → PUT → confirm) and tag them on the item with a role. A photo
 * that cannot be uploaded (no signal, transient failure) is queued in the
 * existing offline store with the item id, and the drain attaches it later.
 */
export function useItemPhotoUpload() {
  const getUploadUrl = trpc.evidence.getUploadUrl.useMutation();
  const confirmUpload = trpc.evidence.confirm.useMutation();
  const attachPhoto = trpc.inspection.attachPhoto.useMutation();

  const upload = useCallback(
    async (args: {
      projectId: string;
      itemId: string;
      file: File;
      role?: "defect" | "during" | "rectified" | "verified";
      position?: { latitude: number; longitude: number } | null;
      capturedAt?: string;
    }): Promise<"uploaded" | "queued"> => {
      const { projectId, itemId, file, role = "defect", position, capturedAt } = args;
      const mimeType = (file.type || "image/jpeg") as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/heic";
      const filename = file.name || `item-${Date.now()}.jpg`;
      const capturedIso =
        capturedAt ?? (file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString());

      const queue = async () => {
        await addToQueue({
          id: crypto.randomUUID(),
          projectId,
          blob: file,
          filename,
          mimeType,
          capturedAt: capturedIso,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          altitude: null,
          note: "",
          taskId: null,
          inspectionItemId: itemId,
          photoRole: role,
          status: "pending",
          createdAt: Date.now(),
        });
        return "queued" as const;
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) return queue();

      try {
        const { uploadUrl, storageKey, isLocal } = await getUploadUrl.mutateAsync({
          projectId,
          filename,
          contentType: mimeType,
          fileSizeBytes: file.size,
        });
        const res = await fetch(uploadUrl, {
          method: isLocal ? "POST" : "PUT",
          headers: { "Content-Type": mimeType },
          body: file,
          credentials: isLocal ? "include" : "omit",
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const ev = await confirmUpload.mutateAsync({
          projectId,
          storageKey,
          originalFilename: filename,
          fileSizeBytes: file.size,
          mimeType,
          capturedAt: capturedIso,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        });
        await attachPhoto.mutateAsync({ itemId, evidenceId: ev.id, role });
        return "uploaded";
      } catch {
        return queue();
      }
    },
    [getUploadUrl, confirmUpload, attachPhoto]
  );

  return { upload };
}
