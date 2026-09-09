"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/format";
import { useItemPhotoUpload } from "@/components/inspection/use-item-photo-upload";
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS, locationLine } from "@/lib/inspection-location";
import { ItemActionSheet } from "@/components/inspection/item-action-sheet";
import { FlagSheet } from "@/components/inspection/flag-sheet";
import { DispositionSheet } from "@/components/inspection/disposition-sheet";
import { readStage } from "@/lib/inspection-local";
import { ArrowLeft, Camera, Flag } from "lucide-react";

export default function InspectItemPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-background" />}>
      <ItemDetail />
    </Suspense>
  );
}

/** Read-only item view with an "add photo" action. Status actions arrive in Phase B. */
function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const params = useSearchParams();
  const projectId = params.get("projectId") ?? "";
  const utils = trpc.useUtils();
  const { data: item, isLoading } = trpc.inspection.get.useQuery({ itemId });
  const { data: project } = trpc.project.get.useQuery({ id: projectId }, { enabled: !!projectId });
  const { upload } = useItemPhotoUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  type Target = "in_progress" | "ready_for_review" | "verified_closed" | "reopened";
  const [sheet, setSheet] = useState<null | { kind: "transition"; target: Target } | { kind: "flags" } | { kind: "disposition" } | { kind: "reject" }>(null);
  const [rejectReason, setRejectReason] = useState("");
  const reject = trpc.inspection.reject.useMutation({
    onSuccess: () => { toast.success("Sent back to open"); setSheet(null); utils.inspection.get.invalidate({ itemId }); utils.inspection.list.invalidate(); utils.inspection.summary.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  // ?verify=1 from the reinspection list opens the verify sheet directly.
  useEffect(() => {
    if (params.get("verify") === "1") setSheet({ kind: "transition", target: "verified_closed" });
  }, [params]);
  const refresh = () => { utils.inspection.get.invalidate({ itemId }); utils.inspection.list.invalidate(); utils.inspection.summary.invalidate(); setSheet(null); };

  const addPhotos = async (files: File[]) => {
    if (!item) return;
    setBusy(true);
    let queued = 0;
    for (const f of files) {
      const r = await upload({ projectId: item.projectId, itemId: item.id, file: f, role: "defect" });
      if (r.status === "queued") queued++;
    }
    setBusy(false);
    utils.inspection.get.invalidate({ itemId });
    toast.success(queued ? `${files.length} added · ${queued} queued for upload` : `${files.length} photo${files.length === 1 ? "" : "s"} added`);
  };

  const loc = item?.location as { description: string } | undefined;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center gap-2 border-b px-3 py-3">
        <Link href={`/inspect?projectId=${projectId || item?.projectId || ""}`} aria-label="Back" className="rounded-full p-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-base font-bold">{item?.ref ?? "…"}</h1>
          <p className="truncate text-xs text-muted-foreground">{project?.name}</p>
        </div>
        {item && (
          <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] text-(--accent-ink)">
            {ITEM_STATUS_LABELS[item.status]}
          </span>
        )}
      </header>

      {isLoading && <div className="m-3 h-40 animate-pulse rounded-xl bg-muted" />}

      {item && loc && (
        <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {ITEM_TYPE_LABELS[item.type]} · recorded {item.createdAt ? formatDate(item.createdAt) : ""}
            </p>
            <h2 className="text-lg font-bold">{item.title}</h2>
            <p className="text-sm text-muted-foreground">{locationLine(project?.locationScheme ?? item.locationScheme, item.location as never)}</p>
          </div>

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Finding</h3>
            <p className="whitespace-pre-wrap text-sm">{item.finding}</p>
            {item.suspectedCause && (
              <p className="mt-1 text-xs text-muted-foreground">Suspected cause (not verified): {item.suspectedCause}</p>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Photos</h3>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (picked.length) void addPhotos(picked);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Add photo"}
              </button>
            </div>
            {item.photos.length === 0 ? (
              <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">No photos yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {item.photos.map((p) => (
                  <figure key={p.evidenceId} className="space-y-1">
                    {p.thumbUrl || p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbUrl ?? p.url ?? ""} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div className="aspect-square w-full rounded-lg bg-muted" />
                    )}
                    <figcaption className="font-mono text-[10px] text-muted-foreground">
                      {p.role} · {p.capturedAt ? formatDateTime(p.capturedAt) : "capture time not recorded"}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          {(() => {
            const perms = item.permissions;
            const flags = (item.flags ?? {}) as Record<string, { reason?: string }>;
            const flagKeys = Object.keys(flags);
            const buttons: { label: string; onClick: () => void; primary?: boolean }[] = [];
            if (perms.progress) buttons.push({ label: "Mark in progress", onClick: () => setSheet({ kind: "transition", target: "in_progress" }) });
            if (perms.ready) buttons.push({ label: "Ready for review", onClick: () => setSheet({ kind: "transition", target: "ready_for_review" }), primary: true });
            if (perms.verify) buttons.push({ label: "Verify closed", onClick: () => setSheet({ kind: "transition", target: "verified_closed" }), primary: true });
            if (perms.reject) buttons.push({ label: "Send back", onClick: () => setSheet({ kind: "reject" }) });
            if (perms.reopen) buttons.push({ label: "Reopen", onClick: () => setSheet({ kind: "transition", target: "reopened" }) });
            return (
              <section className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Actions</h3>
                {flagKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {flagKeys.map((k) => (
                      <span key={k} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">{k.replace(/_/g, " ")}{flags[k]?.reason ? ` · ${flags[k].reason}` : ""}</span>
                    ))}
                  </div>
                )}
                {perms.verifyBlockedReason && (
                  <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{perms.verifyBlockedReason}</p>
                )}
                {buttons.length === 0 && !perms.flag && (
                  <p className="text-xs text-muted-foreground">No actions available to you on this item.</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {buttons.map((b) => (
                    <button key={b.label} type="button" onClick={b.onClick} className={`h-11 rounded-xl text-sm font-semibold ${b.primary ? "bg-primary text-primary-foreground" : "border"}`}>{b.label}</button>
                  ))}
                  {perms.flag && (
                    <button type="button" onClick={() => setSheet({ kind: "flags" })} className="flex h-11 items-center justify-center gap-1 rounded-xl border text-sm font-semibold"><Flag className="h-4 w-4" /> Flags</button>
                  )}
                  {perms.dispose && (
                    <button type="button" onClick={() => setSheet({ kind: "disposition" })} className="h-11 rounded-xl border text-sm font-semibold text-muted-foreground">Final disposition…</button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Only project members can change status. Subcontractors outside your organisation act through the PM.</p>
              </section>
            );
          })()}

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">History</h3>
            <ul className="mt-1 space-y-1">
              {item.events.map((e) => (
                <li key={e.id} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-mono text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  <span className="min-w-0">
                    {e.kind.replace(/_/g, " ")}
                    {e.fromStatus && e.toStatus ? ` · ${ITEM_STATUS_LABELS[e.fromStatus] ?? e.fromStatus} → ${ITEM_STATUS_LABELS[e.toStatus] ?? e.toStatus}` : e.toStatus ? ` → ${ITEM_STATUS_LABELS[e.toStatus] ?? e.toStatus}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.actor ? ` · ${e.actor.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {item && sheet?.kind === "transition" && (
        <ItemActionSheet projectId={item.projectId} itemId={item.id} target={sheet.target} stage={readStage(item.projectId)} onClose={() => setSheet(null)} onDone={refresh} />
      )}
      {item && sheet?.kind === "flags" && (
        <FlagSheet itemId={item.id} flags={(item.flags ?? {}) as Record<string, unknown>} onClose={() => setSheet(null)} onDone={refresh} />
      )}
      {item && sheet?.kind === "disposition" && (
        <DispositionSheet itemId={item.id} onClose={() => setSheet(null)} onDone={refresh} />
      )}
      {item && sheet?.kind === "reject" && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true" onClick={() => setSheet(null)}>
          <div className="w-full rounded-t-2xl bg-background p-4 pb-8 text-foreground" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold">Send back to open</h2>
            <p className="mb-3 text-sm text-muted-foreground">The correction is not accepted. The reason prints on the record and the item returns to Open.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Reason (required)" className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            <button type="button" disabled={reject.isPending || rejectReason.trim().length < 5} onClick={() => reject.mutate({ itemId: item.id, reason: rejectReason.trim() })} className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{reject.isPending ? "Saving…" : "Send back"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
