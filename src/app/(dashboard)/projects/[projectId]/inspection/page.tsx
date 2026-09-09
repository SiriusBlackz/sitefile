"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { formatDate } from "@/lib/format";
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS, locationLine } from "@/lib/inspection-location";
import { INSPECTION_ITEM_STATUSES } from "@/server/db/enums";
import { ItemDetailSheet } from "@/components/inspection/item-detail-sheet";

export default function InspectionRegisterPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl" />}>
      <InspectionRegister />
    </Suspense>
  );
}

/** Desk register: every item, sortable by location, filter by status.
 *  `?item=` opens the read-view sheet (search hits deep-link here). */
function InspectionRegister() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const search = useSearchParams();
  const openItem = search.get("item");
  const setOpenItem = (id: string | null) =>
    router.replace(`/projects/${projectId}/inspection${id ? `?item=${id}` : ""}`, { scroll: false });
  const [status, setStatus] = useState<string>("");
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  const { data: summary } = trpc.inspection.summary.useQuery({ projectId });
  const { data: items = [], isLoading } = trpc.inspection.list.useQuery({ projectId });
  const shown = status ? items.filter((i) => i.status === status) : items;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ProjectBreadcrumb items={[{ label: "Defects register" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Defects register</h1>
          <p className="text-muted-foreground">
            {summary ? `${summary.total} items · ${summary.open} open · ${summary.readyForReview} ready for review · ${summary.verifiedClosed} verified closed` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStatus("")} className={cn("rounded-full border px-3 py-1 text-xs", !status && "bg-foreground text-background")}>All</button>
          {INSPECTION_ITEM_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(status === s ? "" : s)}
              className={cn("rounded-full border px-3 py-1 text-xs", status === s && "bg-foreground text-background")}
            >
              {ITEM_STATUS_LABELS[s]} {summary?.byStatus?.[s] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Finding</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && shown.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No items{status ? " with this status" : " yet — record the first one on the phone"}.</td></tr>
              )}
              {shown.map((it) => (
                <tr key={it.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs font-bold">
                    <button type="button" onClick={() => setOpenItem(it.id)} className="hover:underline">{it.ref}</button>
                  </td>
                  <td className="max-w-[16rem] px-3 py-2">{locationLine(project?.locationScheme, it.location as never)}</td>
                  <td className="px-3 py-2 text-xs">{ITEM_TYPE_LABELS[it.type]}</td>
                  <td className="max-w-[24rem] px-3 py-2">
                    <span className="font-medium">{it.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{it.finding}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className={cn("text-xs", it.status === "verified_closed" && "bg-green-100 text-green-800")}>
                      {ITEM_STATUS_LABELS[it.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{it.photoCount}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{it.createdAt ? formatDate(it.createdAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ItemDetailSheet itemId={openItem} projectId={projectId} locationScheme={project?.locationScheme} onClose={() => setOpenItem(null)} />
    </div>
  );
}
