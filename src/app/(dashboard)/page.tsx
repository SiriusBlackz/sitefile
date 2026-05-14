"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FolderKanban,
  Plus,
  ListChecks,
  Camera,
  ImageIcon,
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
  import: "imported",
};

const ENTITY_LABELS: Record<string, string> = {
  project: "project",
  task: "task",
  evidence: "evidence",
  evidence_link: "link",
  report: "report",
  gps_zone: "GPS zone",
};

export default function DashboardPage() {
  const {
    data: rows,
    isLoading: rowsLoading,
    error: rowsError,
    refetch: refetchRows,
    isRefetching: rowsRefetching,
  } = trpc.dashboard.projectsTable.useQuery();
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Project</TableHead>
                  <TableHead className="w-[280px]">Progress</TableHead>
                  <TableHead>Current Task</TableHead>
                  <TableHead className="pr-6 text-right">Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading
                  ? [0, 1, 2].map((i) => (
                      <TableRow key={i}>
                        <TableCell className="pl-6">
                          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="ml-auto h-4 w-8 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows?.map((row) => <ProjectRow key={row.id} row={row} />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
                        <span className="font-medium">
                          {entry.user?.name ?? "System"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {ACTION_LABELS[entry.action] ?? entry.action}{" "}
                          {entry.metadata &&
                          (entry.metadata as Record<string, string>).name
                            ? `"${(entry.metadata as Record<string, string>).name}"`
                            : `a ${ENTITY_LABELS[entry.entityType] ?? entry.entityType}`}
                        </span>
                        {entry.project && (
                          <span className="text-muted-foreground">
                            {" "}
                            in{" "}
                            <Link
                              href={`/projects/${entry.project.id}`}
                              className="text-primary hover:underline"
                            >
                              {entry.project.name}
                            </Link>
                          </span>
                        )}
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

type ProjectRowData = {
  id: string;
  name: string;
  status: string | null;
  tasks: { total: number; completed: number };
  evidenceCount: number;
  currentTask: { id: string; name: string } | null;
};

function ProjectRow({ row }: { row: ProjectRowData }) {
  const { total, completed } = row.tasks;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <TableRow className="group">
      <TableCell className="pl-6 font-medium">
        <Link
          href={`/projects/${row.id}`}
          className="hover:underline group-hover:text-primary"
        >
          {row.name}
        </Link>
      </TableCell>
      <TableCell>
        {total === 0 ? (
          <span className="text-xs text-muted-foreground">No tasks yet</span>
        ) : (
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                {completed} / {total} tasks
              </span>
              <span>{pct}%</span>
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
        {row.currentTask?.name ?? "—"}
      </TableCell>
      <TableCell className="pr-6 text-right tabular-nums">
        {row.evidenceCount}
      </TableCell>
    </TableRow>
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
