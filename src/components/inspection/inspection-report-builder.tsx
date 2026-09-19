"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { A4Preview } from "@/components/reports/a4-preview";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/inspection-location";
import { INSPECTION_VISIT_STAGES, INSPECTION_REPORT_KINDS } from "@/server/db/enums";
import {
  buildInspectionRows,
  effectiveFacts,
  inspectionReadinessPct,
  type InspectionDraftPayload,
  type InspectionReadinessRow,
} from "@/lib/inspection-readiness";
import { AlertTriangle, Check, ChevronRight, FileText } from "lucide-react";

export const INSPECTION_KIND_LABELS: Record<string, string> = {
  inspection_record: "Inspection record (this visit)",
  register_status: "Register status (all items)",
  closeout: "Closeout",
};

/** "name, organisation, role, authority" per line. */
export function parseAttendees(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, org, role, authority] = l.split(",").map((x) => x.trim());
      return { name, org: org || undefined, role: role || undefined, authority: authority || undefined };
    })
    .filter((a) => a.name);
}
export function attendeesToText(rows: InspectionDraftPayload["attendees"]) {
  return (rows ?? []).map((a) => [a.name, a.org, a.role, a.authority].filter(Boolean).join(", ")).join("\n");
}
/** "area — reason" per line. */
export function parseNotInspected(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [area, reason] = l.split("—").map((x) => x.trim());
      return { area, reason: reason || undefined };
    })
    .filter((n) => n.area);
}
export function notInspectedToText(rows: InspectionDraftPayload["notInspected"]) {
  return (rows ?? []).map((n) => [n.area, n.reason].filter(Boolean).join(" — ")).join("\n");
}

/**
 * The inspection report builder — the desk counterpart of the monthly
 * Report Builder. The next issue is a standing draft: visit, stage and
 * kind chosen once; readiness rows from the register and the visit facts;
 * inline editors that persist to the server draft; and a live A4 preview
 * at readable size. "Review & issue" hands over to the generate dialog.
 */
export function InspectionReportBuilderPanel({
  projectId,
  onReviewAndIssue,
}: {
  projectId: string;
  onReviewAndIssue: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: visits = [] } = trpc.inspection.visitList.useQuery({ projectId });
  const { data: draftRow } = trpc.inspection.draftGet.useQuery({ projectId });
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  const { data: reports = [] } = trpc.report.list.useQuery({ projectId });
  const hasApprovalChain = Boolean((project?.approvalChain as { steps?: unknown[] } | null)?.steps?.length);

  const draft = (draftRow?.payload ?? {}) as InspectionDraftPayload;
  const visit = useMemo(
    () => visits.find((v) => v.id === draft.visitId) ?? visits[0] ?? null,
    [visits, draft.visitId]
  );
  const kind = draft.kind ?? "inspection_record";
  // The this-visit-only kind counts this visit's items; the others the whole register.
  const { data: summary } = trpc.inspection.summary.useQuery({
    projectId,
    visitId: kind === "inspection_record" && visit ? visit.id : undefined,
  });
  const stage = draft.stage ?? ((visit?.stage as InspectionDraftPayload["stage"]) ?? "end_of_defects_period");
  const facts = effectiveFacts({ visit, draft });
  const rows = buildInspectionRows({ visit, draft, summary: summary ?? null, project: project ?? null, kind });
  const pct = inspectionReadinessPct(rows);
  const openCount = rows.filter((r) => r.state === "todo" || r.state === "danger").length;
  const nextNumber = reports.length
    ? Math.max(...reports.map((r) => r.reportNumber)) + 1
    : (project?.firstReportNumber ?? 1);

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [signName, setSignName] = useState("");
  const [signTitle, setSignTitle] = useState("");

  const saveDraft = trpc.inspection.draftSave.useMutation({
    onSuccess: () => utils.inspection.draftGet.invalidate({ projectId }),
    onError: (e) => toast.error(e.message),
  });
  const patch = (p: Partial<InspectionDraftPayload>) => saveDraft.mutate({ projectId, patch: p as Record<string, unknown> });

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const preview = trpc.inspection.previewHtml.useMutation({
    onSuccess: (r) => setPreviewHtml(r.html),
    onError: (e) => toast.error(e.message),
  });
  function refreshPreview() {
    if (!visit) return;
    preview.mutate({
      projectId,
      visitId: visit.id,
      stage,
      kind,
      sections: draft.sections as Record<"toc", boolean> | undefined,
      scopeNote: facts.scopeNote || undefined,
      methodLine: facts.methodLine || undefined,
      weather: facts.weather || undefined,
      urgentConcerns: facts.urgentConcerns || undefined,
      distribution: facts.distribution,
      attendees: facts.attendees,
      notInspected: facts.notInspected,
      supersedesReportId: draft.supersedesReportId ?? undefined,
      signatures: draft.signature?.name ? [{ role: "contractor", name: draft.signature.name, title: draft.signature.title, date: new Date().toLocaleDateString("en-GB") }] : undefined,
    });
  }

  const inline = new Set(["scope", "method", "attendees", "notInspected", "urgent", "distribution", "signoff"]);
  function rowAction(row: InspectionReadinessRow) {
    if (!inline.has(row.key)) return;
    const next = openRow === row.key ? null : row.key;
    setOpenRow(next);
    if (!next) return;
    // Seed the editor from the effective facts the first time it opens.
    setText((t) => ({
      ...t,
      scope: t.scope ?? facts.scopeNote,
      method: t.method ?? facts.methodLine,
      weather: t.weather ?? facts.weather,
      attendees: t.attendees ?? attendeesToText(facts.attendees),
      notInspected: t.notInspected ?? notInspectedToText(facts.notInspected),
      urgent: t.urgent ?? facts.urgentConcerns,
      distribution: t.distribution ?? facts.distribution.join("\n"),
    }));
    if (next === "signoff" && draft.signature?.name) {
      setSignName(draft.signature.name);
      setSignTitle(draft.signature.title ?? "");
    }
  }
  const T = (k: string) => text[k] ?? "";
  const setT = (k: string, v: string) => setText((t) => ({ ...t, [k]: v }));
  const saveAndClose = (p: Partial<InspectionDraftPayload>, msg: string) => {
    patch(p);
    setOpenRow(null);
    toast.success(msg);
  };

  const R = 26;
  const C = 2 * Math.PI * R;
  const selectCls = "h-9 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <div className="flex gap-4">
      <Card className="min-w-0 flex-1 lg:max-w-xl lg:flex-none">
        <CardContent className="p-4 sm:p-5">
          {/* Readiness header */}
          <div className="flex flex-wrap items-center gap-4">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
              <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 32 32)" />
              <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[13px] font-bold">{pct}%</text>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--accent-ink)">
                {draft.supersedesReportId ? "Re-issue" : `Report № ${nextNumber}`} · {INSPECTION_KIND_LABELS[kind]}
              </p>
              <h2 className="text-lg font-extrabold tracking-tight">
                {!visit ? "No visit recorded yet" : openCount === 0 ? "Ready to issue" : `${openCount} thing${openCount === 1 ? "" : "s"} before issue`}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Counts are at the issue date; only Verified closed counts as closed. The client block prints blank for wet ink.
              </p>
            </div>
            <Button onClick={onReviewAndIssue} size="lg" disabled={!visit}>
              <FileText className="mr-1.5 h-4 w-4" />
              {openCount === 0
                ? hasApprovalChain ? "Review & submit for sign-off →" : "Review & issue →"
                : `Resolve ${openCount} → ${hasApprovalChain ? "submit for sign-off" : "Review & issue"}`}
            </Button>
          </div>

          {/* What this issue is */}
          <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ib-visit">Visit</Label>
              <select id="ib-visit" value={visit?.id ?? ""} onChange={(e) => patch({ visitId: e.target.value, scopeNote: undefined, methodLine: undefined, weather: undefined, urgentConcerns: undefined, urgentDecidedAt: undefined, attendees: undefined, notInspected: undefined, notInspectedNone: undefined, signature: undefined, signedAt: undefined })} className={selectCls}>
                {visits.length === 0 && <option value="">No visits yet</option>}
                {visits.map((v) => (
                  <option key={v.id} value={v.id}>{v.visitDate} · {STAGE_LABELS[v.stage]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ib-stage">Stage</Label>
              <select id="ib-stage" value={stage} onChange={(e) => patch({ stage: e.target.value as InspectionDraftPayload["stage"] })} className={selectCls}>
                {INSPECTION_VISIT_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ib-kind">Report kind</Label>
              <select id="ib-kind" value={kind} onChange={(e) => patch({ kind: e.target.value as InspectionDraftPayload["kind"] })} className={selectCls}>
                {INSPECTION_REPORT_KINDS.map((k) => <option key={k} value={k}>{INSPECTION_KIND_LABELS[k]}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {kind === "inspection_record" ? "This visit only — items first recorded or acted on at it." : kind === "closeout" ? "Whole register; each item shows as-found beside verified." : "Whole register at the issue date."}
          </p>

          {/* Readiness rows */}
          <ul className="mt-4 space-y-0.5 border-t pt-3">
            {rows.map((row) => {
              const isOpen = openRow === row.key;
              const tappable = inline.has(row.key);
              return (
                <li key={row.key}>
                  <div
                    role={tappable ? "button" : undefined}
                    tabIndex={tappable ? 0 : undefined}
                    onClick={() => rowAction(row)}
                    onKeyDown={(e) => { if (tappable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); rowAction(row); } }}
                    className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm", tappable && "cursor-pointer hover:bg-muted/60", isOpen && "bg-muted/60")}
                  >
                    {row.state === "done" ? (
                      <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    ) : row.state === "danger" ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    ) : row.state === "waiting" ? (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-primary/60" />
                    )}
                    <span className={cn("min-w-0 flex-1", row.state === "done" ? "text-muted-foreground" : "font-medium")}>
                      {row.label}
                      <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">{row.detail}</span>
                    </span>
                    {row.href && row.state !== "done" && (
                      <Link href={`/projects/${projectId}/${row.href}`} onClick={(e) => e.stopPropagation()} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 shrink-0 gap-1 text-xs text-(--accent-ink)")}>
                        Fix <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  {isOpen && row.key === "scope" && (
                    <Editor hint="Areas walked, by location — prints under Scope, method and limitations.">
                      <Textarea rows={3} value={T("scope")} onChange={(e) => setT("scope", e.target.value)} placeholder="e.g. Access road ch 0+000 to 0+520 both sides; car park; drainage chambers MH-01 to MH-09" />
                      <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ scopeNote: T("scope").trim() }, "Areas inspected saved")}>Save</Button>
                    </Editor>
                  )}
                  {isOpen && row.key === "method" && (
                    <Editor hint="How the inspection was done, and the weather on the day.">
                      <Textarea rows={2} value={T("method")} onChange={(e) => setT("method", e.target.value)} placeholder="Visual walkover from ground level; no opening up" />
                      <Input value={T("weather")} onChange={(e) => setT("weather", e.target.value)} placeholder="Weather — e.g. Dry, overcast, 14°C" />
                      <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ methodLine: T("method").trim(), weather: T("weather").trim() }, "Method saved")}>Save</Button>
                    </Editor>
                  )}
                  {isOpen && row.key === "attendees" && (
                    <Editor hint="One per line: name, organisation, role, decision authority.">
                      <Textarea rows={3} value={T("attendees")} onChange={(e) => setT("attendees", e.target.value)} placeholder={"A Inspector, Contractor, Site manager\nJ Smith, Client, Supervisor, NEC4 Supervisor"} />
                      <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ attendees: parseAttendees(T("attendees")) }, "Attendees saved")}>Save</Button>
                    </Editor>
                  )}
                  {isOpen && row.key === "notInspected" && (
                    <Editor hint="One per line: area — reason. The report states nothing about parts not reached.">
                      <Textarea rows={3} value={T("notInspected")} onChange={(e) => setT("notInspected", e.target.value)} placeholder="Attenuation tank interior — confined space, no entry" />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ notInspected: parseNotInspected(T("notInspected")), notInspectedNone: false }, "Not-inspected areas saved")}>Save</Button>
                        <Button size="sm" variant="outline" disabled={saveDraft.isPending} onClick={() => { setT("notInspected", ""); saveAndClose({ notInspected: [], notInspectedNone: true }, "Confirmed: everything in scope was reached"); }}>None to declare</Button>
                      </div>
                    </Editor>
                  )}
                  {isOpen && row.key === "urgent" && (
                    <Editor hint={'Anything needing action before the next visit. Blank + confirm prints "none observed within scope".'}>
                      <Input value={T("urgent")} onChange={(e) => setT("urgent", e.target.value)} placeholder="e.g. Exposed rebar at ch 0+120 — barrier off by 17:00" />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ urgentConcerns: T("urgent").trim(), urgentDecidedAt: new Date().toISOString() }, "Urgent concerns saved")}>Save</Button>
                        <Button size="sm" variant="outline" disabled={saveDraft.isPending} onClick={() => { setT("urgent", ""); saveAndClose({ urgentConcerns: "", urgentDecidedAt: new Date().toISOString() }, "Confirmed: none observed within scope"); }}>None observed</Button>
                      </div>
                    </Editor>
                  )}
                  {isOpen && row.key === "distribution" && (
                    <Editor hint="One recipient per line — prints on the cover.">
                      <Textarea rows={3} value={T("distribution")} onChange={(e) => setT("distribution", e.target.value)} placeholder={"A Client, Demo Client Ltd\nSite file"} />
                      <Button size="sm" disabled={saveDraft.isPending} onClick={() => saveAndClose({ distribution: T("distribution").split("\n").map((l) => l.trim()).filter(Boolean) }, "Distribution saved")}>Save</Button>
                    </Editor>
                  )}
                  {isOpen && row.key === "signoff" && (
                    <Editor hint="Your name against this issue as inspector / contractor. A drawn signature can be added at Review & issue.">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Name" />
                        <Input value={signTitle} onChange={(e) => setSignTitle(e.target.value)} placeholder="Title (e.g. Site Manager)" />
                      </div>
                      <Button size="sm" disabled={!signName.trim() || saveDraft.isPending} onClick={() => saveAndClose({ signature: { name: signName.trim(), title: signTitle.trim() || undefined }, signedAt: new Date().toISOString() }, `Signed as ${signName.trim()}`)}>
                        Sign as {signName.trim() || "…"}
                      </Button>
                    </Editor>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Live A4 preview — desk only, at readable size. */}
      <div className="hidden min-w-0 flex-1 lg:block">
        <Card className="h-full">
          <CardContent className="flex h-full flex-col space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Live preview — as the client sees it</p>
              <Button variant="outline" size="sm" disabled={!visit || preview.isPending} onClick={refreshPreview}>
                {preview.isPending ? "Rendering…" : previewHtml ? "Refresh" : "Render preview"}
              </Button>
            </div>
            {previewHtml ? (
              <A4Preview html={previewHtml} />
            ) : (
              <div className="flex min-h-[70vh] flex-1 items-center justify-center rounded border border-dashed text-center text-xs text-muted-foreground">
                The Defects Inspection and Closeout Report as the client will see it —<br />
                contractor branding, every declared gap included.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Editor({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 ml-6 space-y-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
