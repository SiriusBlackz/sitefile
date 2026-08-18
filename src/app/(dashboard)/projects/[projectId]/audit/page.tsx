"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Filter,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Link2,
  Unlink2,
  FileText,
  FileUp,
  ArchiveIcon,
} from "lucide-react";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { toast } from "sonner";

const ACTION_CONFIG: Record<
  string,
  { label: string; icon: typeof Plus; color: string }
> = {
  create: { label: "Created", icon: Plus, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  update: { label: "Updated", icon: Pencil, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  delete: { label: "Deleted", icon: Trash2, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  archive: { label: "Archived", icon: ArchiveIcon, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  upload: { label: "Uploaded", icon: Upload, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  link: { label: "Linked", icon: Link2, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  bulk_link: { label: "Bulk Linked", icon: Link2, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  bulk_delete: { label: "Bulk Deleted", icon: Trash2, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unlink: { label: "Unlinked", icon: Unlink2, color: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400" },
  generate: { label: "Generated", icon: FileText, color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  import: { label: "Imported", icon: FileUp, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
};

const ENTITY_LABELS: Record<string, string> = {
  project: "Project",
  task: "Task",
  evidence: "Evidence",
  evidence_link: "Evidence Link",
  report: "Report",
  gps_zone: "GPS Zone",
};

export default function AuditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.audit.list.useInfiniteQuery(
      {
        projectId,
        limit: 50,
        action: actionFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined }
    );

  const exportQuery = trpc.audit.export.useQuery(
    {
      projectId,
      action: actionFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { enabled: false }
  );

  const handleExport = useCallback(async () => {
    const result = await exportQuery.refetch();
    if (!result.data) {
      toast.error("Failed to export audit log");
      return;
    }

    const rows = result.data;
    if (rows.length === 0) {
      toast.error("No entries to export");
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h as keyof typeof row] ?? "");
            return val.includes(",") || val.includes('"')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${projectId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} entries`);
  }, [exportQuery, projectId]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const hasActiveFilters = actionFilter || dateFrom || dateTo;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "Audit Log" }]} />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="mr-1 h-4 w-4" />
            Filters
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select
              value={actionFilter}
              onValueChange={(val) =>
                setActionFilter(val === "__all__" ? "" : (val ?? ""))
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All actions</SelectItem>
                {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionFilter("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Timeline feed */}
      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No audit entries found.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((entry) => {
            const config =
              ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.update;
            const Icon = config.icon;
            const entityLabel =
              ENTITY_LABELS[entry.entityType] ?? entry.entityType;
            const meta = entry.metadata as Record<string, string> | null;

            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-muted/30"
              >
                {/* User avatar */}
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback className="text-xs bg-muted">
                    {entry.user?.name
                      ? entry.user.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      : "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {entry.user?.name ?? "System"}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${config.color}`}
                    >
                      <Icon className="h-3 w-3 mr-0.5" />
                      {config.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {entityLabel}
                    </span>
                  </div>

                  {/* Metadata details */}
                  {meta?.name && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {meta.name}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <time className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </time>
              </div>
            );
          })}
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
