"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Link2 } from "lucide-react";
import { formatDate } from "@/lib/format";

/**
 * The Yard — batch triage of unlinked photos, grouped by capture day +
 * GPS zone. Each group carries its reason and (where a zone task
 * exists) a one-tap "Link all N". Nothing auto-commits: no-GPS and
 * outside-zone groups always ask the human to pick.
 */
export function YardTriage({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.evidence.triageGroups.useQuery({ projectId });
  const { data: tasks = [] } = trpc.task.list.useQuery({ projectId });
  // Per-group manual task picks for groups without a zone suggestion.
  const [picks, setPicks] = useState<Record<string, string>>({});
  // Persistent confirmation of the last linked batch — toasts vanish,
  // this stays until dismissed, with the two natural next steps.
  const [lastLinked, setLastLinked] = useState<{
    count: number;
    taskName: string | null;
  } | null>(null);

  const bulkLink = trpc.evidence.bulkLink.useMutation({
    onSuccess: (res) => {
      toast.success(`Linked ${res.linked} photo${res.linked === 1 ? "" : "s"}`);
      setLastLinked((prev) => ({
        count: (prev?.count ?? 0) + res.linked,
        taskName: prev?.taskName ?? null,
      }));
      utils.evidence.triageGroups.invalidate({ projectId });
      utils.evidence.list.invalidate();
      utils.project.gapList.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data || (data.groups.length === 0 && !lastLinked)) return null;

  function linkGroup(groupKey: string, evidenceIds: string[], taskId: string) {
    bulkLink.mutate({ evidenceIds, taskId });
    setPicks((prev) => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            The Yard — {data.total} photo{data.total === 1 ? "" : "s"} to sort
          </h2>
          <span className="text-xs text-muted-foreground">
            Confirm a group at a time — nothing links itself
          </span>
        </div>

        {lastLinked && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
            <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <span className="min-w-0 flex-1 text-sm font-medium">
              {lastLinked.count} photo{lastLinked.count === 1 ? "" : "s"} linked ✓
              {data.groups.length === 0 ? " — the Yard is clear" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLastLinked(null)}
            >
              Dismiss
            </Button>
            <Link
              href={`/projects/${projectId}/reports`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Review report →
            </Link>
          </div>
        )}
        <div className="space-y-3">
          {data.groups.map((group) => {
            const chosen = group.suggestedTaskId ?? picks[group.key] ?? "";
            return (
              <div key={group.key} className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium">
                      {formatDate(group.day)}
                      {group.zoneName ? ` · ${group.zoneName}` : ""}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {group.items.length} photo{group.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">{group.reason}</p>

                <div className="mb-3 flex gap-1.5 overflow-x-auto">
                  {group.items.slice(0, 10).map((item) => (
                    // eslint-disable-next-line @next/next/no-img-element -- thumb
                    <img
                      key={item.id}
                      src={item.thumbnailUrl ?? item.publicUrl}
                      alt={item.note ?? "Site photo"}
                      title={item.note ?? undefined}
                      className="h-14 w-14 shrink-0 rounded-md border object-cover"
                      onError={(e) => {
                        // Thumbnail missing or unservable — fall back to the
                        // original once (same rule as the gallery cards).
                        const img = e.currentTarget;
                        if (item.thumbnailUrl && !img.dataset.fellBack) {
                          img.dataset.fellBack = "true";
                          img.src = item.publicUrl;
                        }
                      }}
                    />
                  ))}
                  {group.items.length > 10 && (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border text-xs text-muted-foreground">
                      +{group.items.length - 10}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!group.suggestedTaskId && (
                    <Select
                      value={picks[group.key] ?? ""}
                      onValueChange={(val) =>
                        setPicks((prev) => ({
                          ...prev,
                          [group.key]: val ?? "",
                        }))
                      }
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Pick the task…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tasks.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {"—".repeat(t.depth)} {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    disabled={!chosen || bulkLink.isPending}
                    onClick={() =>
                      linkGroup(
                        group.key,
                        group.items.map((i) => i.id),
                        chosen
                      )
                    }
                  >
                    <Link2 className="mr-1 h-3.5 w-3.5" />
                    Link all {group.items.length}
                    {group.suggestedTaskName
                      ? ` to “${truncate(group.suggestedTaskName, 30)}”`
                      : ""}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
