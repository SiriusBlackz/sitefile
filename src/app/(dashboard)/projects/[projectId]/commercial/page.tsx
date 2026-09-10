"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { formatDate, formatDateTime } from "@/lib/format";
import { fmtGbp } from "@/server/services/commercial-import";
import { ImportRegisterDialog } from "@/components/commercial/import-register-dialog";
import { FileUp } from "lucide-react";

/**
 * Commercial register — the EW and CE registers as imported from CEMAR.
 * Read-only tables plus the counts the report section prints; the CSV is
 * the source of truth so there is no row editing here.
 */
export default function CommercialPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<"ew" | "ce">("ew");
  const { data: s } = trpc.commercial.summary.useQuery({ projectId });
  const { data: rows = [], isLoading } = trpc.commercial.list.useQuery({ projectId, kind: tab });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ProjectBreadcrumb items={[{ label: "Commercial" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Commercial register</h1>
          <p className="text-muted-foreground">Early warnings and compensation events from the CEMAR registers. Import replaces the register; nothing is edited by hand.</p>
        </div>
        <Button onClick={() => setImportOpen(true)}><FileUp className="mr-1.5 h-4 w-4" /> Import CEMAR CSV</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Early warnings</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {s ? (
              <>
                <p><b>{s.ew.total}</b> on register · <b>{s.ew.open}</b> open · {s.ew.avoided} avoided / passed</p>
                <p>Replies: {s.ew.repliedOnTime} on time · <span className={cn(s.ew.repliedLate && "text-red-700")}>{s.ew.repliedLate} late</span> · {s.ew.awaitingReply} awaiting · <span className={cn(s.ew.replyOverdue && "text-red-700 font-medium")}>{s.ew.replyOverdue} overdue</span>{s.ew.avgReplyDays != null ? ` · avg ${s.ew.avgReplyDays} days` : ""}</p>
                <p className="text-xs text-muted-foreground">{s.lastImport.ew ? `Imported ${formatDateTime(s.lastImport.ew.at!)}${s.lastImport.ew.by ? ` by ${s.lastImport.ew.by}` : ""} · ${s.lastImport.ew.rows} rows${s.lastImport.ew.filename ? ` · ${s.lastImport.ew.filename}` : ""}` : "Not imported yet."}</p>
              </>
            ) : "…"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Compensation events</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {s ? (
              <>
                <p><b>{s.ce.total}</b> on register · <b>{s.ce.implemented}</b> implemented · {s.ce.outstanding} outstanding · {s.ce.draft} draft</p>
                <p>Implemented value <b>{fmtGbp(s.ce.implementedValue)}</b> · {s.ce.implementedDays} days · outstanding {fmtGbp(s.ce.outstandingValue)}{s.ce.quotationOverdue ? <span className="text-red-700"> · {s.ce.quotationOverdue} quotation{s.ce.quotationOverdue === 1 ? "" : "s"} overdue</span> : null}</p>
                <p className="text-xs text-muted-foreground">{s.lastImport.ce ? `Imported ${formatDateTime(s.lastImport.ce.at!)}${s.lastImport.ce.by ? ` by ${s.lastImport.ce.by}` : ""} · ${s.lastImport.ce.rows} rows${s.lastImport.ce.filename ? ` · ${s.lastImport.ce.filename}` : ""}` : "Not imported yet."}</p>
              </>
            ) : "…"}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1.5">
        {(["ew", "ce"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", tab === k && "bg-foreground text-background")}>
            {k === "ew" ? "Early warnings" : "Compensation events"}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {tab === "ew" ? (
                <tr><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Raised</th><th className="px-3 py-2">Reply due</th><th className="px-3 py-2">Replied</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Status</th></tr>
              ) : (
                <tr><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Notified</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2">Implemented</th><th className="px-3 py-2">Status</th></tr>
              )}
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nothing imported yet — export the register from CEMAR as CSV and import it above.</td></tr>}
              {rows.map((r) => {
                const late = tab === "ew" && ((r.replyDate && r.replyDue && r.replyDate > r.replyDue) || (!r.replyDate && !r.avoidedOn && r.replyDue && r.replyDue < today));
                return (
                  <tr key={r.id} className="border-t align-top hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs font-bold">{r.ref}{r.crossRef ? <span className="block font-normal text-muted-foreground">{r.crossRef}</span> : null}</td>
                    <td className="max-w-[26rem] px-3 py-2">{r.title}{r.decision && r.decision !== "Content unavailable" ? <span className="line-clamp-2 block text-xs text-muted-foreground">{r.decision}</span> : null}</td>
                    <td className="px-3 py-2 text-xs">{r.fromParty ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.notifiedOn ? formatDate(r.notifiedOn) : "—"}</td>
                    {tab === "ew" ? (
                      <>
                        <td className={cn("px-3 py-2 text-xs", late && "text-red-700")}>{r.replyDue ? formatDate(r.replyDue) : "—"}</td>
                        <td className="px-3 py-2 text-xs">{r.replyDate ? formatDate(r.replyDate) : r.avoidedOn ? "—" : <span className="text-amber-700">awaiting</span>}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{r.score ?? "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtGbp(r.price)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{r.days ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{r.implementedOn ? formatDate(r.implementedOn) : "—"}</td>
                      </>
                    )}
                    <td className="px-3 py-2"><Badge variant="secondary" className={cn("text-xs", (r.status === "IMPLEMENTED" || r.status?.includes("AVOIDED")) && "bg-green-100 text-green-800")}>{(r.status ?? "—").toLowerCase().replace(/_/g, " ")}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ImportRegisterDialog projectId={projectId} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
