"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProvenanceChip } from "@/components/diary/provenance-chip";
import { HOLDUP_CAUSE_LABELS } from "@/components/diary/holdup-sheet";
import { formatDate, formatDateTime } from "@/lib/format";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { DiaryProvenance, HoldupCause } from "@/server/db/enums";

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week containing dateStr. */
function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return shiftDays(dateStr, 1 - wd);
}

const CELL_STYLES: Record<string, string> = {
  locked: "bg-green-500/15 text-green-700 dark:text-green-400",
  locked_late: "bg-green-500/10 text-green-700 dark:text-green-400",
  not_filled: "bg-red-500/10 text-red-600 dark:text-red-400",
  draft: "bg-accent text-(--accent-ink)",
  pending: "bg-muted text-muted-foreground",
  none: "text-muted-foreground/40",
};
const CELL_GLYPH: Record<string, string> = {
  locked: "✓",
  locked_late: "†",
  not_filled: "—",
  draft: "…",
  pending: "·",
  none: "",
};

/**
 * PM oversight: foremen × working-days matrix, weekly roll-up strip and
 * the open-delay ledger. Aggregate internally rich — but remember the
 * client PDF only ever gets aggregate coverage (enforced server-side).
 */
export default function DiaryDeskPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const today = useMemo(() => localToday(), []);
  const [weekOf, setWeekOf] = useState(() => weekStart(localToday()));
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  const from = useMemo(() => shiftDays(today, -20), [today]);
  const matrix = trpc.diary.matrix.useQuery({ projectId, from, to: today });
  const week = trpc.diary.weekSummary.useQuery({
    projectId,
    from: weekOf,
    to: shiftDays(weekOf, 6),
  });
  const ledger = trpc.diary.ledger.useQuery({ projectId });

  if (matrix.error?.data?.code === "FORBIDDEN") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ProjectBreadcrumb items={[{ label: "Site Diary" }]} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            The site diary overview is for project managers. Your own diary
            lives on your phone — open Sitefile there and it&apos;s under the
            Capture button.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ProjectBreadcrumb items={[{ label: "Site Diary" }]} />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Site Diary</h1>
        <p className="text-muted-foreground">
          Who kept the record, what it cost in hours, and the delay ledger.
        </p>
      </div>

      {/* Weekly roll-up strip */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            Week of {formatDate(weekOf)}
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOf((w) => shiftDays(w, -7))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekOf((w) => shiftDays(w, 7))}
              disabled={shiftDays(weekOf, 7) > today}
              className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {week.data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Coverage" value={`${week.data.daysWithRecord}/${week.data.workingDayCount}`} alert={week.data.daysWithRecord < week.data.workingDayCount} />
              <Stat label="Labour avg" value={String(week.data.labourAvg)} />
              <Stat label="Labour peak" value={String(week.data.labourPeak)} />
              <Stat label="Hours lost" value={`${week.data.hoursLostTotal}h`} alert={week.data.hoursLostTotal > 0} />
              <Stat label="Incidents" value={String(week.data.incidents)} alert={week.data.incidents > 0} />
              <Stat label="Toolbox talks" value={String(week.data.toolboxTalks)} />
              <Stat label="Tasks touched" value={String(week.data.tasksTouched)} />
            </div>
          ) : (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          )}
          {week.data && Object.keys(week.data.hoursByCause).length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Hours lost:{" "}
              {Object.entries(week.data.hoursByCause)
                .map(
                  ([c, h]) =>
                    `${HOLDUP_CAUSE_LABELS[c as HoldupCause] ?? c} ${h}h`
                )
                .join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Matrix */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Coverage — last 3 weeks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {matrix.data ? (
            matrix.data.authors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project members yet — diaries appear here once the site
                team is added and starts logging.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card p-1 text-left font-medium text-muted-foreground">
                      Foreman
                    </th>
                    {matrix.data.days.map((d) => (
                      <th key={d} className="p-1 text-center font-mono font-normal text-muted-foreground">
                        {new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.authors.map((a) => (
                    <tr key={a.id}>
                      <td className="sticky left-0 bg-card p-1 font-medium">{a.name}</td>
                      {a.cells.map((c) => (
                        <td key={c.date} className="p-0.5 text-center">
                          <button
                            disabled={!c.entryId}
                            onClick={() => c.entryId && setDetailEntryId(c.entryId)}
                            title={`${c.date} — ${c.status}${c.amended ? " · amended ◆" : ""}`}
                            className={cn(
                              "h-7 w-7 rounded-md font-mono text-[11px] font-bold",
                              CELL_STYLES[c.status] ?? "",
                              c.entryId && "hover:ring-1 hover:ring-primary"
                            )}
                          >
                            {c.amended ? "◆" : CELL_GLYPH[c.status] ?? ""}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            ✓ locked · † entered late · ◆ amended · — no record made · … draft · &nbsp;·&nbsp; pending
          </p>
        </CardContent>
      </Card>

      {/* Delay ledger */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delay ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ledger.data ? (
            ledger.data.threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hold-ups logged. When the team logs one, hours accrue
                here by cause — your early-warning radar and, if it ever
                comes to it, the claim evidence bundle.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ledger.data.hoursByCause).map(([c, h]) => (
                    <span key={c} className="rounded-full border px-3 py-1 text-xs font-medium">
                      {HOLDUP_CAUSE_LABELS[c as HoldupCause] ?? c}:{" "}
                      <strong>{h}h</strong>
                    </span>
                  ))}
                  <span className="rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                    Total {ledger.data.totalHours}h
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {ledger.data.threads.map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-2.5 text-sm",
                        t.status === "open" && "border-amber-400/60 bg-accent/40"
                      )}
                    >
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold",
                          t.status === "open"
                            ? "bg-accent text-(--accent-ink)"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t.status === "open" ? `OPEN · DAY ${t.dayCount}` : "CLOSED"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">
                          {HOLDUP_CAUSE_LABELS[t.cause as HoldupCause] ?? t.cause}
                        </span>
                        {t.taskName && (
                          <span className="text-muted-foreground"> · {t.taskName}</span>
                        )}
                        {t.note && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {t.note}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(t.startedOn)}
                        {t.closedOn && t.closedOn !== t.startedOn ? ` – ${formatDate(t.closedOn)}` : ""}
                      </span>
                      <span className="shrink-0 font-mono text-sm font-bold">{t.totalHours}h</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.authorName}</span>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          )}
        </CardContent>
      </Card>

      <EntryDetailSheet entryId={detailEntryId} onClose={() => setDetailEntryId(null)} />
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-lg font-bold", alert && "text-red-600 dark:text-red-400")}>
        {value}
      </p>
    </div>
  );
}

function EntryDetailSheet({
  entryId,
  onClose,
}: {
  entryId: string | null;
  onClose: () => void;
}) {
  const detail = trpc.diary.entryDetail.useQuery(
    { entryId: entryId ?? "" },
    { enabled: Boolean(entryId) }
  );
  const d = detail.data;
  return (
    <Sheet open={Boolean(entryId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>
            {d ? (
              <>
                {d.entry.author.name} — {formatDate(d.entry.entryDate)}
              </>
            ) : (
              "Diary entry"
            )}
          </SheetTitle>
        </SheetHeader>
        {d && (
          <div className="space-y-4 text-sm">
            <div
              className={cn(
                "rounded-lg border p-3 text-xs",
                d.entry.status === "not_filled"
                  ? "border-red-400/50 bg-red-500/5"
                  : "border-green-500/40 bg-green-500/10"
              )}
            >
              <p className="font-bold">
                {d.entry.status === "not_filled"
                  ? "No record made"
                  : `Locked${d.entry.late ? " · entered late †" : ""}${d.entry.amendedAt ? " · amended ◆" : ""}`}
              </p>
              {d.entry.status !== "not_filled" && (
                <p className="mt-0.5 text-muted-foreground">
                  Entered {d.entry.enteredAt ? formatDateTime(d.entry.enteredAt) : "—"} · received{" "}
                  {d.entry.receivedAt ? formatDateTime(d.entry.receivedAt) : "—"}
                </p>
              )}
            </div>

            {d.entry.workLines.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Work done</p>
                {d.entry.workLines.map((l) => (
                  <p key={l.id} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    <span className="min-w-0 flex-1">{l.body}</span>
                    <ProvenanceChip value={l.provenance as DiaryProvenance} />
                  </p>
                ))}
                {d.entry.workNote && (
                  <p className="italic text-muted-foreground">“{d.entry.workNote}”</p>
                )}
              </div>
            )}

            {d.entry.resources.length > 0 && (
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Crew & kit</p>
                {d.entry.resources.map((r) => (
                  <p key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 capitalize">
                      {r.kind}: <strong>{r.kind === "materials" ? (r.note ?? "—") : r.qty}</strong>
                    </span>
                    <ProvenanceChip value={r.provenance as DiaryProvenance} />
                  </p>
                ))}
              </div>
            )}

            {d.holdupDays.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Hold-ups</p>
                {d.holdupDays.map((h) => (
                  <div key={h.id} className="rounded-lg border border-red-400/40 bg-red-500/5 p-2 text-xs">
                    <p className="font-semibold">
                      {HOLDUP_CAUSE_LABELS[h.cause as HoldupCause] ?? h.cause} · {h.hoursLost}h
                    </p>
                    {h.note && <p className="text-muted-foreground">{h.note}</p>}
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      logged {formatDateTime(h.loggedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">People & safety</p>
              <p>
                {d.entry.visitorsCount} visitors · {d.entry.inspectionsCount} inspections ·{" "}
                {d.entry.incidentsCount} incidents
                {d.entry.toolboxTalk ? ` · toolbox ✓${d.entry.toolboxTopic ? ` (${d.entry.toolboxTopic})` : ""}` : ""}
              </p>
              {d.entry.safetyNote && <p className="text-muted-foreground">{d.entry.safetyNote}</p>}
            </div>

            {d.amendments.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Amendments ◆</p>
                {d.amendments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-dashed p-2 text-xs">
                    <p className="font-semibold">◆ {a.field} · {formatDateTime(a.at)}</p>
                    {a.previous && <p className="text-muted-foreground line-through">{a.previous}</p>}
                    {a.next && <p>{a.next}</p>}
                    {a.note && <p className="italic text-muted-foreground">“{a.note}”</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
