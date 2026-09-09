"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatDate, formatDateTime } from "@/lib/format";
import { useItemPhotoUpload } from "@/components/inspection/use-item-photo-upload";
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS, locationLine } from "@/lib/inspection-location";
import { ArrowLeft, Camera } from "lucide-react";

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

  const addPhotos = async (files: File[]) => {
    if (!item) return;
    setBusy(true);
    let queued = 0;
    for (const f of files) {
      const r = await upload({ projectId: item.projectId, itemId: item.id, file: f, role: "defect" });
      if (r === "queued") queued++;
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

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">History</h3>
            <ul className="mt-1 space-y-1">
              {item.events.map((e) => (
                <li key={e.id} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-mono text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  <span className="min-w-0">
                    {e.kind.replace(/_/g, " ")}
                    {e.toStatus ? ` → ${ITEM_STATUS_LABELS[e.toStatus] ?? e.toStatus}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.actor ? ` · ${e.actor.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
