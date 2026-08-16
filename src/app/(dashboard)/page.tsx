"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {


} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { portfolioPct } from "@/lib/readiness";
import { daysUntil } from "@/lib/reporting-cadence";
import { formatDate } from "@/lib/format";
import { CalendarClock, FileText } from "lucide-react";
import {
  FolderKanban,
  Plus,
  ListChecks,
  Camera,

  AlertTriangle,
  TrendingUp,
} from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  archive: "archived",
  upload: "uploaded",
  link: "linked",
  unlink: "unlinked",
  generate: "generated",
  draft_narrative: "drafted a narrative for",
  import: "imported",
  download: "downloaded",
};

const ENTITY_LABELS: Record<string, string> = {
  project: "project",
  task: "task",
  evidence: "photo",
  evidence_link: "link",
  report: "report",
  gps_zone: "GPS zone",
  project_member: "member",
  subscription: "subscription",
};

/**
 * Compose the readable part of an activity sentence, rendered as
 * "{user} {phrase} {connector} {project link}".
 */
function describeActivity(
  action: string,
  entityType: string,
  metadata: Record<string, unknown> | null
): { phrase: string; connector: string } {
  const name = typeof metadata?.name === "string" ? metadata.name : null;

  switch (action) {
    case "add_member":
      return { phrase: "added a member", connector: "to" };
    case "remove_member":
      return { phrase: "removed a member", connector: "from" };
    case "link":
      return { phrase: "linked a photo to a task", connector: "in" };
    case "bulk_link":
      return { phrase: "linked photos to tasks", connector: "in" };
    case "unlink":
      return { phrase: "unlinked a photo from a task", connector: "in" };
    case "upload":
      return { phrase: "uploaded a photo", connector: "in" };
    case "import": {
      const count = typeof metadata?.count === "number" ? metadata.count : null;
      return {
        phrase: count ? `imported ${count} tasks` : "imported the programme",
        connector: "into",
      };
    }
    case "generate": {
      const num =
        typeof metadata?.reportNumber === "number" ? metadata.reportNumber : null;
      return {
        phrase: num ? `generated report #${num}` : "generated a report",
        connector: "for",
      };
    }
    case "subscribe":
      return { phrase: "started a subscription", connector: "for" };
    case "payment_failed":
      return { phrase: "recorded a failed payment", connector: "for" };
    case "cancel_subscription":
      return { phrase: "cancelled the subscription", connector: "for" };
  }

  const verb = ACTION_LABELS[action] ?? action.replace(/_/g, " ");
  const target = name
    ? `"${name}"`
    : `a ${ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ")}`;
  return { phrase: `${verb} ${target}`, connector: "in" };
}

export default function DashboardPage() {
  const {
    data: portfolio,
    isLoading: rowsLoading,
    error: rowsError,
    refetch: refetchRows,
    isRefetching: rowsRefetching,
  } = trpc.dashboard.portfolio.useQuery();
  const rows = portfolio?.projects;
  const { data: activity = [], isLoading: activityLoading } =
    trpc.dashboard.recentActivity.useQuery();

  const isEmpty = !rowsLoading && (rows?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of all your projects and recent activity.
          </p>
        </div>
        <Link href="/projects/new" className={cn(buttonVariants(), "shrink-0")}>
          <Plus className="mr-1 h-4 w-4" />
          New Project
        </Link>
      </div>

      {rowsError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium">Couldn&apos;t load projects</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rowsError.message || "Try again in a moment."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchRows()}
            disabled={rowsRefetching}
          >
            {rowsRefetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {/* Empty state — first-time user, no projects yet. */}
      {isEmpty && !rowsError ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h2 className="text-lg font-semibold">Welcome to Sitefile</h2>
            <p className="text-sm text-muted-foreground max-w-md mt-1 mb-6">
              Get started by creating your first project. Upload site photos,
              link them to programme tasks, and generate professional progress
              reports.
            </p>
            <Link href="/projects/new" className={cn(buttonVariants(), "gap-1")}>
              <Plus className="h-4 w-4" />
              Create First Project
            </Link>
            <div className="grid grid-cols-3 gap-6 mt-8 text-xs text-muted-foreground">
              <div className="flex flex-col items-center gap-1">
                <Camera className="h-5 w-5" />
                <span>1. Capture</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ListChecks className="h-5 w-5" />
                <span>2. Link</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <TrendingUp className="h-5 w-5" />
                <span>3. Report</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rowsLoading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted" />
              ))
            : rows?.map((p) => <PortfolioCard key={p.id} project={p} />)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded bg-muted"
                    />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No activity yet. Create a project to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-muted">
                          {entry.user?.name
                            ?.split(" ")
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const { phrase, connector } = describeActivity(
                            entry.action,
                            entry.entityType,
                            (entry.metadata as Record<string, unknown>) ?? null
                          );
                          return (
                            <>
                              <span className="font-medium">
                                {entry.user?.name ?? "System"}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                {phrase}
                              </span>
                              {entry.project && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  {connector}{" "}
                                  <Link
                                    href={`/projects/${entry.project.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {entry.project.name}
                                  </Link>
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <time className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {entry.createdAt
                          ? formatRelativeTime(new Date(entry.createdAt))
                          : ""}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/projects/new"
                className={cn(
                  buttonVariants(),
                  "w-full justify-start"
                )}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
              <Link
                href="/projects"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full justify-start"
                )}
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                View Projects
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}



function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type PortfolioProject = {
  id: string;
  name: string;
  reference: string | null;
  status: string | null;
  nextReportDue: string | null;
  periodStart: string;
  taskCount: number;
  photosThisPeriod: number;
  unlinked: number;
  programmeConfirmedThisPeriod: boolean;
  lastReport: {
    id: string;
    number: number;
    status: string | null;
    sentAt: string | null;
    openedAt: string | null;
  } | null;
  draft: {
    narrativeApprovedAt: string | null;
    issuesSignedOffAt: string | null;
    signedAt: string | null;
  } | null;
};

function PortfolioCard({ project: p }: { project: PortfolioProject }) {
  const pct = portfolioPct(p);
  const days = p.nextReportDue ? daysUntil(p.nextReportDue) : null;
  const R = 16;
  const C = 2 * Math.PI * R;
  const receipt = p.lastReport
    ? p.lastReport.openedAt
      ? `№ ${p.lastReport.number} sent · opened ${formatDate(p.lastReport.openedAt)}`
      : p.lastReport.sentAt
        ? `№ ${p.lastReport.number} sent · not yet opened`
        : `№ ${p.lastReport.number} generated · not sent`
    : "No reports yet";

  return (
    <Link
      href={`/projects/${p.id}`}
      className="block rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{p.name}</h3>
          {p.reference && (
            <p className="font-mono text-[10px] text-muted-foreground">
              {p.reference}
            </p>
          )}
        </div>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-label={`${pct}% report-ready`}>
          <circle cx="20" cy="20" r={R} fill="none" strokeWidth="4" className="stroke-muted" />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
            transform="rotate(-90 20 20)"
          />
          <text x="20" y="24" textAnchor="middle" className="fill-foreground font-mono text-[9px] font-bold">
            {pct}%
          </text>
        </svg>
      </div>

      <div className="mt-3 space-y-1.5 text-xs">
        {p.nextReportDue && days !== null && (
          <p
            className={cn(
              "flex items-center gap-1.5 font-medium",
              days < 0
                ? "text-red-600 dark:text-red-400"
                : days <= 7
                  ? "text-(--accent-ink)"
                  : "text-muted-foreground"
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {days < 0
              ? `Report overdue — was due ${formatDate(p.nextReportDue)}`
              : days === 0
                ? "Report due today"
                : `Report due ${formatDate(p.nextReportDue)} · ${days}d`}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Camera className="h-3.5 w-3.5" />
          {p.photosThisPeriod} photo{p.photosThisPeriod === 1 ? "" : "s"} this period
          {p.unlinked > 0 ? ` · ${p.unlinked} to sort` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          {receipt}
        </p>
      </div>
    </Link>
  );
}
