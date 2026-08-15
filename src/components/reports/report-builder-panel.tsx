"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/reporting-cadence";
import { formatDate } from "@/lib/format";
import { CalendarClock, Check, ChevronRight, FileText } from "lucide-react";

/**
 * The report builder — Friday Report's centrepiece grafted onto the
 * reports page. The next report is a standing draft that fills all
 * period: a readiness ring, the fix-list feeding it, and one primary
 * action. "Generate" stops being an event and becomes "Review & send".
 */
export function ReportBuilderPanel({
  projectId,
  onReviewAndSend,
}: {
  projectId: string;
  onReviewAndSend: () => void;
}) {
  const { data: gaps } = trpc.project.gapList.useQuery({ id: projectId });
  if (!gaps) return null;

  const checks = [
    {
      key: "programme",
      label: "Programme loaded",
      done: gaps.taskCount > 0,
      href: `/projects/${projectId}/tasks`,
      fix: "Import your programme",
    },
    {
      key: "photos",
      label: "Photos captured this period",
      done: gaps.photosThisPeriod > 0,
      href: `/projects/${projectId}/evidence`,
      fix: `No photos since ${formatDate(gaps.periodStart)}`,
    },
    {
      key: "linked",
      label: "Every photo linked to a task",
      // Vacuously done with zero photos — the photos row above carries it.
      done: gaps.photosThisPeriod === 0 || gaps.unlinked === 0,
      href: `/projects/${projectId}/evidence`,
      fix: `${gaps.unlinked} to sort in the Yard`,
    },
    {
      key: "captioned",
      label: "Photos captioned",
      done: gaps.photosThisPeriod === 0 || gaps.uncaptioned === 0,
      href: `/projects/${projectId}/evidence`,
      fix: `${gaps.uncaptioned} without captions`,
    },
    {
      key: "programme-fresh",
      label: "Programme updated this period",
      done: gaps.programmeConfirmedThisPeriod,
      href: `/projects/${projectId}/tasks`,
      fix: "Re-import or confirm no change",
    },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checks.length) * 100);
  const open = checks.filter((c) => !c.done);
  const nextNumber = (gaps.lastReportNumber ?? 0) + 1;
  const days = gaps.nextReportDue ? daysUntil(gaps.nextReportDue) : null;

  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
            <circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              strokeWidth="6"
              className="stroke-muted"
            />
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
            <text
              x="32"
              y="36"
              textAnchor="middle"
              className="fill-foreground text-[13px] font-bold"
            >
              {pct}%
            </text>
          </svg>

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              Report № {nextNumber} — {pct === 100 ? "ready" : `${open.length} to fix`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {pct === 100
                ? "Everything's in — review it and send."
                : "The draft fills as the period goes on; fix the items below any time."}
            </p>
            {gaps.nextReportDue && days !== null && (
              <p
                className={cn(
                  "mt-1 inline-flex items-center gap-1.5 text-xs font-medium",
                  days < 0
                    ? "text-red-600 dark:text-red-400"
                    : days <= 7
                      ? "text-(--accent-ink)"
                      : "text-muted-foreground"
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {days < 0
                  ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue — was due ${formatDate(gaps.nextReportDue)}`
                  : days === 0
                    ? "Due today"
                    : `Due ${formatDate(gaps.nextReportDue)} — ${days} day${days === 1 ? "" : "s"} to go`}
              </p>
            )}
          </div>

          <Button onClick={onReviewAndSend} size="lg">
            <FileText className="mr-1.5 h-4 w-4" />
            Review &amp; send
          </Button>
        </div>

        {open.length > 0 && (
          <ul className="mt-4 space-y-1 border-t pt-3">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2.5 text-sm">
                {c.done ? (
                  <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-primary/60" />
                )}
                <span className={c.done ? "text-muted-foreground" : "font-medium"}>
                  {c.label}
                </span>
                {!c.done && (
                  <Link
                    href={c.href}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "ml-auto h-7 gap-1 text-xs text-(--accent-ink)"
                    )}
                  >
                    {c.fix}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
