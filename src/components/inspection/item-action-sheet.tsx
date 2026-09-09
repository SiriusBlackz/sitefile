"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { usePWA } from "@/lib/use-pwa";
import { useItemPhotoUpload } from "@/components/inspection/use-item-photo-upload";
import { Camera, X } from "lucide-react";

type Target = "in_progress" | "ready_for_review" | "verified_closed" | "reopened";
const COPY: Record<Target, { title: string; body: string; photoLabel: string; photoRequired: boolean; noteRequired: boolean; button: string }> = {
  in_progress: { title: "Mark in progress", body: "Work on this item has started.", photoLabel: "Progress photo (optional)", photoRequired: false, noteRequired: false, button: "Mark in progress" },
  ready_for_review: { title: "Ready for review", body: "The correction is complete and ready for someone else to verify. A photo of the finished work helps the verifier.", photoLabel: "Photo of the completed work", photoRequired: false, noteRequired: false, button: "Mark ready" },
  verified_closed: { title: "Verify and close", body: "You are recording a visual re-inspection. A verification photo is required and this closes the item against today's visit.", photoLabel: "Verification photo (required)", photoRequired: true, noteRequired: false, button: "Verify closed" },
  reopened: { title: "Reopen item", body: "The correction has failed or the defect has recurred. Give the reason — it prints on the record.", photoLabel: "Photo (optional)", photoRequired: false, noteRequired: true, button: "Reopen" },
};

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Bottom sheet for one status change. The verify path ensures today's
 * visit first, uploads the photo, then transitions with the evidence id
 * so the server can enforce "verified photo present" in one transaction.
 * Status changes need signal; photos that fail queue as usual.
 */
export function ItemActionSheet({
  projectId,
  itemId,
  target,
  stage,
  onClose,
  onDone,
}: {
  projectId: string;
  itemId: string;
  target: Target;
  stage: "initial_walkthrough" | "interim_reinspection" | "end_of_defects_period";
  onClose: () => void;
  onDone: () => void;
}) {
  const { isOnline } = usePWA();
  const copy = COPY[target];
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const visitEnsure = trpc.inspection.visitEnsure.useMutation();
  const transition = trpc.inspection.transition.useMutation();
  const { upload } = useItemPhotoUpload();

  const canSubmit = isOnline && !busy && (!copy.photoRequired || !!file) && (!copy.noteRequired || note.trim().length >= 5);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      let visitId: string | undefined;
      if (target === "verified_closed") {
        setBusy("Recording visit…");
        visitId = (await visitEnsure.mutateAsync({ projectId, visitDate: todayLocal(), stage })).id;
      }
      const evidenceIds: string[] = [];
      if (file) {
        setBusy("Uploading photo…");
        const pos = await new Promise<{ latitude: number; longitude: number } | null>((resolve) =>
          navigator.geolocation?.getCurrentPosition(
            (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => resolve(null),
            { timeout: 6000 }
          ) ?? resolve(null)
        );
        const r = await uploadReturningId({ projectId, itemId, file, role: target === "verified_closed" ? "verified" : target === "ready_for_review" ? "rectified" : "during", position: pos, upload });
        if (r.status === "queued") {
          if (copy.photoRequired) {
            toast.error("The verification photo could not be uploaded. Try again with signal.");
            setBusy(null);
            return;
          }
        } else if (r.evidenceId) {
          evidenceIds.push(r.evidenceId);
        }
      }
      setBusy("Saving…");
      await transition.mutateAsync({ itemId, to: target, note: note.trim() || undefined, evidenceIds: evidenceIds.length ? evidenceIds : undefined, visitId, clientAt: new Date().toISOString() });
      toast.success(copy.button);
      onDone();
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof Error ? err.message : "Could not update the item");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4 pb-8 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-bold">{copy.title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{copy.body}</p>
        {!isOnline && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Status changes need signal.</p>}
        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <button type="button" onClick={() => fileInput.current?.click()} className="mb-3 flex w-full items-center gap-2 rounded-lg border px-3 py-3 text-sm">
          <Camera className="h-4 w-4" /> {file ? file.name : copy.photoLabel}
        </button>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={copy.noteRequired ? "Reason (required)" : "Note (optional)"} className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        <button type="button" disabled={!canSubmit} onClick={submit} className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ?? copy.button}
        </button>
      </div>
    </div>
  );
}

async function uploadReturningId(args: {
  projectId: string;
  itemId: string;
  file: File;
  role: "defect" | "during" | "rectified" | "verified";
  position: { latitude: number; longitude: number } | null;
  upload: ReturnType<typeof useItemPhotoUpload>["upload"];
}): Promise<{ status: "uploaded" | "queued"; evidenceId?: string }> {
  return args.upload({ ...args, wantEvidenceId: true });
}
