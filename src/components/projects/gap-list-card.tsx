"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/lib/reporting-cadence";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
} from "lucide-react";

/**
 * The living gap list — what stands between this project and its next
 * report, every period (the first-report checklist hands over to this
 * once report #1 exists). Countdown in the header; each gap links to
 * the screen that fixes it; the programme-refresh ritual lives here.
 */
export function GapListCard({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const { data: gaps, isLoading } = trpc.project.gapList.useQuery({
    id: projectId,
  });
  const confirmMutation = trpc.project.confirmProgramme.useMutation({
    onSuccess: () => {
      utils.project.gapList.invalidate({ id: projectId });
      toast.success("Programme confirmed for this period");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !gaps) return null;

  const due = gaps.nextReportDue;
  const days = due ? daysUntil(due) : null;

  type Gap = {
    key: string;
    label: string;
    detail: string;
    href?: string;
    action?: React.ReactNode;
  };
  const items: Gap[] = [];

  if (gaps.unlinked > 0) {
    items.push({
      key: "unlinked",
      label: `${gaps.unlinked} photo${gaps.unlinked === 1 ? "" : "s"} not linked to a task`,
      detail: "Unlinked photos group at the back of the report",
      href: `/projects/${projectId}/evidence`,
    });
  }
  if (gaps.uncaptioned > 0) {
    items.push({
      key: "uncaptioned",
      label: `${gaps.uncaptioned} photo${gaps.uncaptioned === 1 ? "" : "s"} without a caption`,
      detail: "Captions become the photo titles in the report",
      href: `/projects/${projectId}/evidence`,
    });
  }
  if (gaps.photosThisPeriod === 0) {
    items.push({
      key: "no-photos",
      label: "No photos captured this period yet",
      detail: `Period began ${formatDate(gaps.periodStart)}`,
      href: `/projects/${projectId}/evidence`,
    });
  }
  if (!gaps.programmeConfirmedThisPeriod) {
    items.push({
      key: "programme",
      label: "Programme not updated this period",
      detail: "Re-import the latest revision, or confirm nothing changed",
      action: (
        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}/tasks`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Re-import
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => confirmMutation.mutate({ id: projectId })}
            disabled={confirmMutation.isPending}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            No change this period
          </Button>
        </div>
      ),
    });
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {gaps.lastReportNumber
              ? `Report № ${gaps.lastReportNumber + 1} — getting ready`
              : "Next report — getting ready"}
          </h2>
          {due && days !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                days < 0
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                  : days <= 7
                    ? "border-primary/40 bg-accent text-accent-foreground"
                    : "text-muted-foreground"
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {days < 0
                ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue — due ${formatDate(due)}`
                : days === 0
                  ? "Due today"
                  : `Due ${formatDate(due)} — ${days} day${days === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            Nothing outstanding — this period&apos;s evidence is report-ready.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((gap) => (
              <li
                key={gap.key}
                className="flex items-start gap-3 rounded-lg px-2 py-2"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--accent-ink)" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{gap.label}</p>
                  <p className="text-xs text-muted-foreground">{gap.detail}</p>
                  {gap.action && <div className="mt-2">{gap.action}</div>}
                </div>
                {gap.href && (
                  <Link
                    href={gap.href}
                    aria-label={gap.label}
                    className="mt-1 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
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
