"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useItemPhotoUpload } from "@/components/inspection/use-item-photo-upload";
import { TRANSITION_COPY, type TransitionTarget } from "@/components/inspection/item-action-sheet";
import { FlagForm } from "@/components/inspection/flag-sheet";
import { DispositionForm } from "@/components/inspection/disposition-sheet";
import { ItemEditDialog } from "@/components/inspection/item-edit-dialog";
import { ItemNotifyDialog } from "@/components/inspection/item-notify-dialog";
import { STAGE_LABELS } from "@/lib/inspection-location";
import { INSPECTION_VISIT_STAGES, type InspectionVisitStage } from "@/server/db/enums";
import { Bell, Flag, ImagePlus, Pencil, Smartphone } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";

type Permissions = {
  progress: boolean;
  ready: boolean;
  verify: boolean;
  reject: boolean;
  reopen: boolean;
  flag: boolean;
  dispose: boolean;
  notify: boolean;
  edit: boolean;
  verifyBlockedReason: string | null;
};

type DeskItem = {
  id: string;
  projectId: string;
  ref: string;
  status: string;
  flags: unknown;
  permissions: Permissions;
};

type Open =
  | null
  | { kind: "transition"; target: TransitionTarget }
  | { kind: "reject" }
  | { kind: "flags" }
  | { kind: "disposition" }
  | { kind: "notify" }
  | { kind: "edit" }
  | { kind: "photos" };

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const PHOTO_ROLES: { key: "defect" | "during" | "rectified"; label: string }[] = [
  { key: "defect", label: "As found" },
  { key: "during", label: "During correction" },
  { key: "rectified", label: "Rectified (before verification)" },
];

/**
 * Desk action bar for one register item. Same status rules as the phone
 * (`item.permissions` from the server; the server re-checks everything),
 * plus the desk-only jobs: editing the record's management fields,
 * recording a formal notification, and adding photos from files.
 * Every status change is a dialog, never a one-click button.
 */
export function ItemDeskActions({ item, onChanged }: { item: DeskItem; onChanged: () => void }) {
  const [open, setOpen] = useState<Open>(null);
  const perms = item.permissions;
  const done = () => { setOpen(null); onChanged(); };

  const status: { label: string; onClick: () => void; primary?: boolean }[] = [];
  if (perms.progress) status.push({ label: "Mark in progress", onClick: () => setOpen({ kind: "transition", target: "in_progress" }) });
  if (perms.ready) status.push({ label: "Ready for review", onClick: () => setOpen({ kind: "transition", target: "ready_for_review" }), primary: true });
  if (perms.verify) status.push({ label: "Verify closed", onClick: () => setOpen({ kind: "transition", target: "verified_closed" }), primary: true });
  if (perms.reject) status.push({ label: "Send back", onClick: () => setOpen({ kind: "reject" }) });
  if (perms.reopen) status.push({ label: "Reopen", onClick: () => setOpen({ kind: "transition", target: "reopened" }) });

  const nothing = status.length === 0 && !perms.flag && !perms.dispose && !perms.notify && !perms.edit;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</h3>
      {perms.verifyBlockedReason && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{perms.verifyBlockedReason}</p>
      )}
      {nothing ? (
        <p className="text-xs text-muted-foreground">No actions available to you on this item.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status.map((b) => (
            <Button key={b.label} size="sm" variant={b.primary ? "default" : "outline"} onClick={b.onClick}>{b.label}</Button>
          ))}
          {perms.flag && (
            <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "flags" })}><Flag className="mr-1.5 h-3.5 w-3.5" />Flags</Button>
          )}
          {perms.notify && (
            <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "notify" })}><Bell className="mr-1.5 h-3.5 w-3.5" />Record notification</Button>
          )}
          {perms.edit && (
            <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "edit" })}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit details</Button>
          )}
          {perms.flag && (
            <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "photos" })}><ImagePlus className="mr-1.5 h-3.5 w-3.5" />Add photos</Button>
          )}
          {perms.dispose && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen({ kind: "disposition" })}>Final disposition…</Button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <p className="text-[11px] text-muted-foreground">Only project members can change status. Subcontractors outside your organisation act through the PM.</p>
        <Link href={`/inspect/${item.id}?projectId=${item.projectId}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 text-xs")}>
          <Smartphone className="mr-1 h-3.5 w-3.5" /> Phone view
        </Link>
      </div>

      {open?.kind === "transition" && (
        <TransitionDialog projectId={item.projectId} itemId={item.id} target={open.target} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === "reject" && <RejectDialog itemId={item.id} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === "flags" && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Flags · {item.ref}</DialogTitle></DialogHeader>
            <FlagForm itemId={item.id} flags={(item.flags ?? {}) as Record<string, unknown>} onDone={done} />
          </DialogContent>
        </Dialog>
      )}
      {open?.kind === "disposition" && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Final disposition · {item.ref}</DialogTitle></DialogHeader>
            <DispositionForm itemId={item.id} onDone={done} />
          </DialogContent>
        </Dialog>
      )}
      {open?.kind === "notify" && <ItemNotifyDialog itemId={item.id} itemRef={item.ref} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === "edit" && <ItemEditDialog itemId={item.id} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === "photos" && <AddPhotosDialog projectId={item.projectId} itemId={item.id} itemRef={item.ref} onClose={() => setOpen(null)} onDone={done} />}
    </section>
  );
}

/**
 * One status change from the desk. Verify needs a visit: the desk user
 * picks the stage and date explicitly (the phone remembers a stage per
 * project; the desk must not guess). Photo comes from a file picker —
 * no camera, no GPS — and the capture time is the file's own timestamp.
 */
function TransitionDialog({ projectId, itemId, target, onClose, onDone }: { projectId: string; itemId: string; target: TransitionTarget; onClose: () => void; onDone: () => void }) {
  const copy = TRANSITION_COPY[target];
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<InspectionVisitStage>("end_of_defects_period");
  const [visitDate, setVisitDate] = useState(todayLocal());
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const visitEnsure = trpc.inspection.visitEnsure.useMutation();
  const transition = trpc.inspection.transition.useMutation();
  const { upload } = useItemPhotoUpload();
  const isVerify = target === "verified_closed";
  const canSubmit = !busy && (!copy.photoRequired || !!file) && (!copy.noteRequired || note.trim().length >= 5) && (!isVerify || /^\d{4}-\d{2}-\d{2}$/.test(visitDate));

  const submit = async () => {
    if (!canSubmit) return;
    try {
      let visitId: string | undefined;
      if (isVerify) {
        setBusy("Recording visit…");
        visitId = (await visitEnsure.mutateAsync({ projectId, visitDate, stage })).id;
      }
      const evidenceIds: string[] = [];
      if (file) {
        setBusy("Uploading photo…");
        const r = await upload({ projectId, itemId, file, role: isVerify ? "verified" : target === "ready_for_review" ? "rectified" : "during", position: null, wantEvidenceId: true });
        if (r.status === "queued") {
          toast.error("The photo could not be uploaded. Check your connection and try again.");
          setBusy(null);
          return;
        }
        if (r.evidenceId) evidenceIds.push(r.evidenceId);
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
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isVerify && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="desk-visit-stage">Visit stage</Label>
                <select id="desk-visit-stage" value={stage} onChange={(e) => setStage(e.target.value as InspectionVisitStage)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                  {INSPECTION_VISIT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desk-visit-date">Visit date</Label>
                <Input id="desk-visit-date" type="date" value={visitDate} max={todayLocal()} onChange={(e) => setVisitDate(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{copy.photoLabel}</Label>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><ImagePlus className="mr-1.5 h-3.5 w-3.5" />{file ? "Change photo" : "Choose photo"}</Button>
              <span className="truncate text-xs text-muted-foreground">{file ? file.name : "No file chosen"}</span>
            </div>
            {isVerify && <p className="text-[11px] text-muted-foreground">A verification photo taken on site is required. A photo chosen here keeps the file&apos;s own capture time; it will not carry GPS.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desk-transition-note">{copy.noteRequired ? "Reason (required)" : "Note (optional)"}</Label>
            <Textarea id="desk-transition-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!!busy} onClick={onClose}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={submit}>{busy ?? copy.button}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ready for review → Open with a mandatory reason. */
function RejectDialog({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const reject = trpc.inspection.reject.useMutation({ onSuccess: () => { toast.success("Sent back to open"); onDone(); }, onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send back to open</DialogTitle>
          <DialogDescription>The correction is not accepted. The reason prints on the record and the item returns to Open.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={reject.isPending || reason.trim().length < 5} onClick={() => reject.mutate({ itemId, reason: reason.trim() })}>{reject.isPending ? "Saving…" : "Send back"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Add photos from files with an explicit role. Verification photos are
 * deliberately not offered here — they only enter through Verify closed,
 * so a "verified" photo always sits against a visit and a status change.
 */
function AddPhotosDialog({ projectId, itemId, itemRef, onClose, onDone }: { projectId: string; itemId: string; itemRef: string; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<"defect" | "during" | "rectified">("defect");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload } = useItemPhotoUpload();

  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    let queued = 0;
    for (const f of files) {
      const r = await upload({ projectId, itemId, file: f, role, position: null });
      if (r.status === "queued") queued++;
    }
    setBusy(false);
    if (queued) toast.error(`${queued} of ${files.length} could not be uploaded. Check your connection and try again.`);
    else toast.success(`${files.length} photo${files.length === 1 ? "" : "s"} added`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add photos · {itemRef}</DialogTitle>
          <DialogDescription>Photos keep their file capture time. Say what they show so the report groups them honestly.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="desk-photo-role">These photos show</Label>
            <select id="desk-photo-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
              {PHOTO_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><ImagePlus className="mr-1.5 h-3.5 w-3.5" />Choose files</Button>
            <span className="truncate text-xs text-muted-foreground">{files.length ? `${files.length} selected` : "No files chosen"}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button disabled={busy || files.length === 0} onClick={submit}>{busy ? "Uploading…" : "Add photos"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
