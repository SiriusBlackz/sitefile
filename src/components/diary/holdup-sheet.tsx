"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePWA } from "@/lib/use-pwa";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Check, CloudOff, Loader2 } from "lucide-react";
import { HOLDUP_CAUSES, type HoldupCause } from "@/server/db/enums";

export const HOLDUP_CAUSE_LABELS: Record<HoldupCause, string> = {
  weather: "Weather",
  awaiting_information: "Awaiting info",
  no_access: "No access",
  labour_shortage: "Labour short",
  materials_delay: "Materials late",
  plant_breakdown: "Plant down",
  design_change: "Design change",
  rework: "Rework",
  other: "Other",
};

/**
 * The all-day 10-second hold-up log: cause, hours, task, optional note +
 * photo. Timestamped the moment it's logged; shows up pre-filled in the
 * evening ritual. Photo attach: pick from today's uploads (always works)
 * or take one now (online-only — the hold-up itself never waits for it).
 */
export function HoldupSheet({
  projectId,
  localDate,
  open,
  onOpenChange,
  onLogged,
}: {
  projectId: string;
  localDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged?: () => void;
}) {
  const { isOnline: online } = usePWA();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cause, setCause] = useState<HoldupCause | null>(null);
  const [hours, setHours] = useState(1);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ongoing, setOngoing] = useState(false);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const { data: taskList = [] } = trpc.task.list.useQuery(
    { projectId },
    { enabled: open }
  );
  const { data: photosPage } = trpc.evidence.list.useInfiniteQuery(
    { projectId, limit: 12, type: "photo" },
    {
      enabled: open && showPhotos,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  );
  const todaysPhotos = photosPage?.pages[0]?.items ?? [];

  const logHoldup = trpc.diary.logHoldup.useMutation({
    onSuccess: () => {
      toast.success("Hold-up logged — it'll be in tonight's diary");
      utils.diary.getDay.invalidate({ projectId, localDate });
      reset();
      onOpenChange(false);
      onLogged?.();
    },
    onError: (err) => toast.error(err.message),
  });
  const getUploadUrl = trpc.evidence.getUploadUrl.useMutation();
  const confirmUpload = trpc.evidence.confirm.useMutation();
  const linkEvidence = trpc.evidence.link.useMutation();

  function reset() {
    setCause(null);
    setHours(1);
    setTaskId(null);
    setNote("");
    setOngoing(false);
    setEvidenceId(null);
    setShowPhotos(false);
  }

  async function takePhoto(file: File) {
    setUploading(true);
    try {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
      const contentType = (allowed as readonly string[]).includes(file.type)
        ? (file.type as (typeof allowed)[number])
        : "image/jpeg";
      const intent = await getUploadUrl.mutateAsync({
        projectId,
        filename: file.name || `holdup-${Date.now()}.jpg`,
        contentType,
        fileSizeBytes: file.size,
      });
      const put = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");
      const row = await confirmUpload.mutateAsync({
        projectId,
        storageKey: intent.storageKey,
        originalFilename: file.name || "holdup.jpg",
        fileSizeBytes: file.size,
        mimeType: file.type || "image/jpeg",
        note: note.trim() ? `Hold-up: ${note.trim()}` : "Hold-up photo",
      });
      const newId = (row as { id?: string })?.id ?? null;
      if (newId) {
        setEvidenceId(newId);
        // Keep the photo out of the unlinked Yard when a task is chosen.
        if (taskId) {
          linkEvidence.mutate({ evidenceId: newId, taskId });
        }
        toast.success("Photo attached");
      }
    } catch {
      toast.error("Photo upload failed — you can attach one from Capture later.");
    } finally {
      setUploading(false);
    }
  }

  const canLog = cause !== null && hours >= 0.5 && !logHoldup.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-4 pb-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-lg font-extrabold">Log a hold-up</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Cause grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {HOLDUP_CAUSES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCause(c)}
                className={cn(
                  "min-h-12 rounded-xl border px-2 py-2 text-xs font-semibold leading-tight active:bg-muted",
                  cause === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background"
                )}
              >
                {HOLDUP_CAUSE_LABELS[c]}
              </button>
            ))}
          </div>

          <Stepper label="Hours lost" value={hours} onChange={setHours} min={0.5} max={24} step={0.5} />

          <Select value={taskId} onValueChange={(v) => setTaskId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Which task is held up? (optional)">
                {(val: string | null) =>
                  val
                    ? (taskList.find((t) => t.id === val)?.name ?? "Task")
                    : "Which task is held up? (optional)"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {taskList.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? Tap the mic on your keyboard and just say it."
            rows={2}
            enterKeyHint="done"
            className="w-full rounded-xl border bg-background p-3 text-base"
          />

          {/* Photo attach: picker (always) + take-now (online only) */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => setShowPhotos((s) => !s)}
              >
                {evidenceId ? (
                  <>
                    <Check className="mr-1 h-4 w-4 text-green-600" /> Photo attached
                  </>
                ) : (
                  "Attach today's photo"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                disabled={!online || uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : online ? (
                  <Camera className="mr-1 h-4 w-4" />
                ) : (
                  <CloudOff className="mr-1 h-4 w-4" />
                )}
                {online ? "Take photo" : "No signal"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void takePhoto(f);
                  e.target.value = "";
                }}
              />
            </div>
            {!online && (
              <p className="text-xs text-muted-foreground">
                No signal — take it with Capture and attach after. The
                hold-up itself logs fine offline.
              </p>
            )}
            {showPhotos && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {todaysPhotos.length === 0 && (
                  <p className="text-xs text-muted-foreground">No photos yet today.</p>
                )}
                {todaysPhotos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEvidenceId(evidenceId === p.id ? null : p.id)}
                    className={cn(
                      "h-14 w-20 shrink-0 overflow-hidden rounded-md border",
                      evidenceId === p.id && "ring-2 ring-primary ring-offset-1"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails */}
                    <img
                      src={p.thumbnailUrl ?? p.publicUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ongoing toggle */}
          <button
            type="button"
            onClick={() => setOngoing((o) => !o)}
            className={cn(
              "flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-medium active:bg-muted",
              ongoing && "border-primary bg-accent"
            )}
          >
            <span>Still ongoing at the end of the day?</span>
            <span className="font-mono text-xs">{ongoing ? "YES — keep it open" : "No"}</span>
          </button>

          <Button
            className="min-h-14 w-full text-base font-bold"
            disabled={!canLog}
            onClick={() =>
              cause &&
              logHoldup.mutate({
                projectId,
                localDate,
                cause,
                hoursLost: hours,
                taskId: taskId ?? undefined,
                note: note.trim() || undefined,
                evidenceId: evidenceId ?? undefined,
                ongoing,
                loggedAt: new Date(),
              })
            }
          >
            {logHoldup.isPending ? "Logging..." : "Log it — takes effect now"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
