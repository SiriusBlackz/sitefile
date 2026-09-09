"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDate, formatDateTime } from "@/lib/format";
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS, locationLine } from "@/lib/inspection-location";
import { Smartphone } from "lucide-react";

const ROLE_LABEL: Record<string, string> = { defect: "As found", during: "During", rectified: "Rectified", verified: "Verified" };

/**
 * Desk read-view of one register item, opened from the register table or
 * a search hit (`?item=`). Actions stay on the phone view, which is one
 * link away — the desk is for reading the record, not changing it.
 */
export function ItemDetailSheet({
  itemId,
  projectId,
  locationScheme,
  onClose,
}: {
  itemId: string | null;
  projectId: string;
  locationScheme: string | null | undefined;
  onClose: () => void;
}) {
  const { data: item, isLoading } = trpc.inspection.get.useQuery({ itemId: itemId ?? "" }, { enabled: !!itemId });
  return (
    <Sheet open={!!itemId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {isLoading || !item ? (
          <SheetHeader>
            <SheetTitle>{isLoading ? "Loading…" : "Item not found"}</SheetTitle>
            <SheetDescription>{isLoading ? "" : "It may have been deleted or belongs to another project."}</SheetDescription>
          </SheetHeader>
        ) : (
          <div className="space-y-5 pb-8">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{item.ref}</span>
                <Badge variant="secondary" className={cn("text-xs", item.status === "verified_closed" && "bg-green-100 text-green-800")}>
                  {ITEM_STATUS_LABELS[item.status]}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {ITEM_TYPE_LABELS[item.type]} · {locationLine(locationScheme, item.location as never)}
              </SheetDescription>
            </SheetHeader>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="text-sm whitespace-pre-wrap">{item.finding}</p>
              {item.suspectedCause && <p className="text-xs text-muted-foreground"><b>Suspected cause (not verified):</b> {item.suspectedCause}</p>}
            </section>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row k="Recorded" v={item.createdAt ? `${formatDateTime(item.createdAt)}${item.creator ? ` · ${item.creator.name}` : ""}` : "—"} />
              <Row k="Priority" v={item.priority ?? "—"} />
              <Row k="Responsible" v={item.responsibleOrg ?? item.responsibleUser?.name ?? "—"} />
              <Row k="Acceptance basis" v={item.acceptanceBasis ?? "unconfirmed"} />
              <Row k="Repair target" v={item.repairTarget ? formatDate(item.repairTarget) : "—"} />
              <Row k="Contractual deadline" v={item.correctionDue ? `${formatDate(item.correctionDue)} (computed)` : "not confirmed"} />
              {item.notifiedAt && <Row k="Notified" v={`${formatDate(item.notifiedAt)}${item.notificationRef ? ` (${item.notificationRef})` : ""}`} />}
              {item.verifiedAt && <Row k="Verified" v={`${formatDateTime(item.verifiedAt)}${item.verifier ? ` · ${item.verifier.name}` : ""}`} />}
              {item.interimAction && <Row k="Interim action" v={item.interimAction} />}
              {item.accessNote && <Row k="Access" v={item.accessNote} />}
              {item.dispositionRef && <Row k="Disposition ref" v={item.dispositionRef} />}
            </dl>

            {item.photos.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</h3>
                <div className="grid grid-cols-2 gap-2">
                  {item.photos.map((p) => (
                    <a key={p.evidenceId} href={p.url ?? undefined} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumbUrl ?? p.url ?? ""} alt="" className="aspect-[4/3] w-full rounded-md border object-cover" />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{ROLE_LABEL[p.role] ?? p.role}</span>
                        {" · "}{p.capturedAt ? formatDateTime(p.capturedAt) : "capture time not recorded"}
                        {p.latitude != null ? " · GPS" : ""}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {item.events.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trail</h3>
                <ul className="space-y-1 text-xs">
                  {item.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-muted-foreground">{e.createdAt ? formatDateTime(e.createdAt) : ""}</span>
                      <span>
                        {e.kind.replace(/_/g, " ")}
                        {e.toStatus ? ` ${e.fromStatus ? `${ITEM_STATUS_LABELS[e.fromStatus as keyof typeof ITEM_STATUS_LABELS] ?? e.fromStatus} → ` : ""}${ITEM_STATUS_LABELS[e.toStatus as keyof typeof ITEM_STATUS_LABELS] ?? e.toStatus}` : ""}
                        {e.actor ? ` · ${e.actor.name}` : ""}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Link href={`/inspect/${item.id}?projectId=${projectId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Smartphone className="mr-1.5 h-4 w-4" /> Open in phone view to act on it
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words">{v}</dd>
    </>
  );
}
