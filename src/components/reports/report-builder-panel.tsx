"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/reporting-cadence";
import { formatDate } from "@/lib/format";
import {
  buildRecipeRows,
  readinessPct,
  type GapSnapshot,
  type ReadinessRow,
} from "@/lib/readiness";
import type { ReportDraftPayload } from "@/lib/report-draft";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  FileText,
  Sparkles,
} from "lucide-react";

/**
 * The Report Builder — Friday Report's centrepiece at full parity. The
 * next report is a standing draft: an 11-row section recipe whose
 * states come from the shared readiness engine, three rows carrying
 * in-place approvals (narrative, key issues, sign-off) persisted to the
 * server draft so the phone home agrees, an honesty box that names the
 * gap that will otherwise print, and a live A4 preview.
 */
export function ReportBuilderPanel({
  projectId,
  onReviewAndSend,
}: {
  projectId: string;
  onReviewAndSend: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: gaps } = trpc.project.gapList.useQuery({ id: projectId });
  const { data: draft } = trpc.report.getDraft.useQuery({ projectId });
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Local editors (seeded from the server draft when opened).
  const [narrative, setNarrative] = useState<string | null>(null);
  const [issuesText, setIssuesText] = useState<string | null>(null);
  const [signName, setSignName] = useState("");
  const [signTitle, setSignTitle] = useState("");

  const saveDraft = trpc.report.saveDraft.useMutation({
    onSuccess: () => {
      utils.report.getDraft.invalidate({ projectId });
      utils.project.gapList.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });
  const draftNarrative = trpc.report.draftNarrative.useMutation({
    onSuccess: (data) => setNarrative(data.paragraphs.join("\n\n")),
    onError: (err) => toast.error(err.message),
  });
  const suggestIssues = trpc.report.keyIssueSuggestions.useMutation({
    onSuccess: (data) =>
      setIssuesText((prev) =>
        [prev?.trim() ?? "", ...data.suggestions].filter(Boolean).join("\n")
      ),
    onError: (err) => toast.error(err.message),
  });

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const previewMutation = trpc.report.previewHtml.useMutation({
    onSuccess: (d) => setPreviewHtml(d.html),
    onError: (err) => toast.error(err.message),
  });

  if (!gaps) return null;
  const snapshot = gaps as GapSnapshot;
  const rows = buildRecipeRows(snapshot);
  const pct = readinessPct(snapshot);
  const openCount = rows.filter((r) => r.state !== "done").length;
  const nextNumber = (gaps.lastReportNumber ?? 0) + 1;
  const days = gaps.nextReportDue ? daysUntil(gaps.nextReportDue) : null;
  const payload = (draft?.payload ?? {}) as ReportDraftPayload;

  function patch(p: Partial<ReportDraftPayload>) {
    saveDraft.mutate({
      projectId,
      periodStart: gaps!.periodStart,
      patch: p as Record<string, unknown>,
    });
  }

  function refreshPreview() {
    const today = new Date().toISOString().slice(0, 10);
    previewMutation.mutate({
      projectId,
      periodStart: gaps!.periodStart,
      periodEnd: gaps!.nextReportDue && gaps!.nextReportDue > today ? today : (gaps!.nextReportDue ?? today),
      narrative: payload.narrative?.length ? payload.narrative : undefined,
      keyIssues: payload.keyIssues?.length ? payload.keyIssues : undefined,
    });
  }

  const interactive = new Set(["narrative", "issues", "signoff"]);

  function rowAction(row: ReadinessRow) {
    if (!interactive.has(row.key)) return;
    const next = openRow === row.key ? null : row.key;
    setOpenRow(next);
    if (next === "narrative" && narrative === null) {
      setNarrative(payload.narrative?.join("\n\n") ?? "");
    }
    if (next === "issues" && issuesText === null) {
      setIssuesText(payload.keyIssues?.join("\n") ?? "");
    }
    if (next === "signoff" && payload.signature?.name) {
      setSignName(payload.signature.name);
      setSignTitle(payload.signature.title ?? "");
    }
  }

  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex gap-4">
      <Card className="min-w-0 flex-1">
        <CardContent className="p-4 sm:p-5">
          {/* Readiness header */}
          <div className="flex flex-wrap items-center gap-4">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className="stroke-primary"
                strokeDasharray={`${(pct / 100) * C} ${C}`}
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[13px] font-bold">
                {pct}%
              </text>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--accent-ink)">
                Report № {nextNumber}
                {gaps.nextReportDue ? ` · due ${formatDate(gaps.nextReportDue)}` : ""}
              </p>
              <h2 className="text-lg font-extrabold tracking-tight">
                {openCount === 0
                  ? "Ready when you are"
                  : `${openCount} thing${openCount === 1 ? "" : "s"} before Send`}
              </h2>
              {days !== null && (
                <p
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium",
                    days < 0
                      ? "text-red-600 dark:text-red-400"
                      : days <= 7
                        ? "text-(--accent-ink)"
                        : "text-muted-foreground"
                  )}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {days < 0
                    ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
                    : days === 0
                      ? "Due today"
                      : `${days} day${days === 1 ? "" : "s"} to go`}
                </p>
              )}
            </div>
            <Button onClick={onReviewAndSend} size="lg">
              <FileText className="mr-1.5 h-4 w-4" />
              {openCount === 0 ? "Review & send →" : `Resolve ${openCount} → Review & send`}
            </Button>
          </div>

          {/* Honesty box */}
          {gaps.zeroPhotoTasks.length > 0 && (
            <div className="mt-4 rounded-lg border border-dashed border-primary/50 bg-accent/50 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--accent-ink)">
                Honesty check
                {days !== null && days > 0 ? `, ${days} days before send` : ""}
              </p>
              <p className="mt-1 text-sm">
                &laquo;{gaps.zeroPhotoTasks[0].name}&raquo; is{" "}
                {gaps.zeroPhotoTasks[0].progressPct}% complete with zero photos
                this period. The report will say so unless evidence arrives —
                nudge the site team now, not on the deadline.
              </p>
            </div>
          )}

          {/* The 11-row section recipe */}
          <ul className="mt-4 space-y-0.5 border-t pt-3">
            {rows.map((row) => {
              const isOpen = openRow === row.key;
              const tappable = interactive.has(row.key) && row.state !== "done";
              return (
                <li key={row.key}>
                  <div
                    role={tappable ? "button" : undefined}
                    tabIndex={tappable ? 0 : undefined}
                    onClick={() => rowAction(row)}
                    onKeyDown={(e) => {
                      if (tappable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        rowAction(row);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                      tappable && "cursor-pointer hover:bg-muted/60",
                      isOpen && "bg-muted/60"
                    )}
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
                      <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                        {row.detail}
                      </span>
                    </span>
                    {!interactive.has(row.key) && row.state !== "done" && (
                      <Link
                        href={`/projects/${projectId}${row.href}`}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-7 shrink-0 gap-1 text-xs text-(--accent-ink)"
                        )}
                      >
                        Fix
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  {/* Inline editors */}
                  {isOpen && row.key === "narrative" && (
                    <div className="mb-2 ml-6 space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Read it, edit it, approve it — it becomes the
                          Executive Summary.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={draftNarrative.isPending}
                          onClick={() =>
                            draftNarrative.mutate({
                              projectId,
                              periodStart: gaps.periodStart,
                              periodEnd: new Date().toISOString().slice(0, 10),
                            })
                          }
                        >
                          <Sparkles className="mr-1 h-3.5 w-3.5" />
                          {draftNarrative.isPending ? "Drafting…" : "Draft with AI"}
                        </Button>
                      </div>
                      <Textarea
                        value={narrative ?? ""}
                        onChange={(e) => setNarrative(e.target.value)}
                        rows={8}
                        placeholder="Narrative paragraphs, separated by blank lines — or Draft with AI"
                      />
                      <Button
                        size="sm"
                        disabled={saveDraft.isPending}
                        onClick={() => {
                          const paragraphs = (narrative ?? "")
                            .split(/\n\s*\n/)
                            .map((p) => p.trim())
                            .filter(Boolean);
                          patch({
                            narrative: paragraphs,
                            narrativeApprovedAt: new Date().toISOString(),
                          });
                          setOpenRow(null);
                          toast.success("Narrative approved");
                        }}
                      >
                        Approve narrative
                      </Button>
                    </div>
                  )}

                  {isOpen && row.key === "issues" && (
                    <div className="mb-2 ml-6 space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          One issue per line — these print as Key Issues &
                          Early Warnings.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={suggestIssues.isPending}
                          onClick={() =>
                            suggestIssues.mutate({
                              projectId,
                              periodStart: gaps.periodStart,
                              periodEnd: new Date().toISOString().slice(0, 10),
                            })
                          }
                        >
                          {suggestIssues.isPending ? "Checking…" : "Suggest from programme"}
                        </Button>
                      </div>
                      <Textarea
                        value={issuesText ?? ""}
                        onChange={(e) => setIssuesText(e.target.value)}
                        rows={4}
                        placeholder="e.g. Awaiting client sign-off on window specification"
                      />
                      <Button
                        size="sm"
                        disabled={saveDraft.isPending}
                        onClick={() => {
                          const issues = (issuesText ?? "")
                            .split("\n")
                            .map((l) => l.trim())
                            .filter(Boolean);
                          patch({
                            keyIssues: issues,
                            issuesSignedOffAt: new Date().toISOString(),
                          });
                          setOpenRow(null);
                          toast.success("Key issues signed off");
                        }}
                      >
                        Sign off {`${(issuesText ?? "").split("\n").filter((l) => l.trim()).length}`} issue(s)
                      </Button>
                    </div>
                  )}

                  {isOpen && row.key === "signoff" && (
                    <div className="mb-2 ml-6 space-y-2 rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">
                        Signing records your name against this report and
                        unlocks Send. The typed signature renders on the
                        sign-off page.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={signName}
                          onChange={(e) => setSignName(e.target.value)}
                          placeholder="Name"
                        />
                        <Input
                          value={signTitle}
                          onChange={(e) => setSignTitle(e.target.value)}
                          placeholder="Title (e.g. Site Manager)"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!signName.trim() || saveDraft.isPending}
                        onClick={() => {
                          patch({
                            signature: {
                              name: signName.trim(),
                              title: signTitle.trim() || undefined,
                            },
                            signedAt: new Date().toISOString(),
                          });
                          setOpenRow(null);
                          toast.success(`Signed as ${signName.trim()}`);
                        }}
                      >
                        Sign as {signName.trim() || "…"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Live A4 preview — desk only */}
      <div className="hidden w-[340px] shrink-0 lg:block">
        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Live preview</p>
              <Button
                variant="outline"
                size="sm"
                disabled={previewMutation.isPending}
                onClick={refreshPreview}
              >
                {previewMutation.isPending ? "Rendering…" : previewHtml ? "Refresh" : "Render preview"}
              </Button>
            </div>
            {previewHtml ? (
              <iframe
                title="Report preview"
                sandbox=""
                srcDoc={previewHtml}
                className="h-[460px] w-full origin-top rounded border bg-white"
              />
            ) : (
              <div className="flex h-[460px] items-center justify-center rounded border border-dashed text-center text-xs text-muted-foreground">
                The report as the client will see it —<br />
                contractor branding, honest gaps included.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
