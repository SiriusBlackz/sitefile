"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/tasks/task-list";
import { GanttChart } from "@/components/tasks/gantt-chart";
import { TaskFormDialog, type TaskFormValues } from "@/components/tasks/task-form";
import { ImportDialog } from "@/components/tasks/import-dialog";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { Plus, FileUp, List, GanttChartSquare } from "lucide-react";
import { toast } from "sonner";

type ViewMode = "list" | "gantt";

export default function TasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [view, setView] = useState<ViewMode>("list");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTask, setEditTask] = useState<{
    id: string;
    values: Partial<TaskFormValues>;
  } | null>(null);

  const utils = trpc.useUtils();
  // Programme-as-living-document: each period asks for a re-import or a
  // one-tap confirmation. Shown once a first report exists.
  const { data: gaps } = trpc.project.gapList.useQuery({ id: projectId });
  const confirmProgramme = trpc.project.confirmProgramme.useMutation({
    onSuccess: () => {
      utils.project.gapList.invalidate({ id: projectId });
      toast.success("Programme confirmed for this period");
    },
    onError: (err) => toast.error(err.message),
  });
  const showRefreshCard =
    gaps != null &&
    gaps.lastReportNumber != null &&
    !gaps.programmeConfirmedThisPeriod &&
    gaps.taskCount > 0;

  // Baseline = the accepted programme, snapshotted at first import and
  // held fixed while re-imports replace the current one.
  const { data: baseline } = trpc.task.baselineInfo.useQuery({ projectId });
  const [confirmRebaseline, setConfirmRebaseline] = useState(false);
  const setBaseline = trpc.task.setBaseline.useMutation({
    onSuccess: (d) => {
      utils.task.baselineInfo.invalidate({ projectId });
      setConfirmRebaseline(false);
      toast.success(`Baseline re-set from the current programme (${d.count} activities)`);
    },
    onError: (err) => toast.error(err.message),
  });
  const { data: tasks = [], isLoading } = trpc.task.list.useQuery({
    projectId,
  });

  const {
    data: evidenceMarkers = [],
    isError: markersError,
    refetch: refetchMarkers,
  } = trpc.evidence.markers.useQuery(
    { projectId },
    { enabled: view === "gantt" }
  );

  const createMutation = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate({ projectId });
      setFormOpen(false);
      toast.success("Task created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate({ projectId });
      setEditTask(null);
      toast.success("Task updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate({ projectId });
      toast.success("Task deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.task.reorder.useMutation({
    onSuccess: () => utils.task.list.invalidate({ projectId }),
    onError: (err) => toast.error(err.message),
  });

  function handleCreate(values: TaskFormValues) {
    createMutation.mutate({
      projectId,
      name: values.name,
      description: values.description || undefined,
      parentTaskId: values.parentTaskId || null,
      plannedStart: values.plannedStart || undefined,
      plannedEnd: values.plannedEnd || undefined,
      actualStart: values.actualStart || undefined,
      actualEnd: values.actualEnd || undefined,
      status: values.status,
      progressPct: values.progressPct,
    });
  }

  function handleUpdate(values: TaskFormValues) {
    if (!editTask) return;
    updateMutation.mutate({
      id: editTask.id,
      name: values.name,
      description: values.description || null,
      parentTaskId: values.parentTaskId || null,
      plannedStart: values.plannedStart || null,
      plannedEnd: values.plannedEnd || null,
      actualStart: values.actualStart || null,
      actualEnd: values.actualEnd || null,
      status: values.status,
      progressPct: values.progressPct,
    });
  }

  function handleEdit(task: {
    id: string;
    parentTaskId: string | null;
    name: string;
    description: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string | null;
    actualEnd: string | null;
    progressPct: number | null;
    status: string | null;
  }) {
    setEditTask({
      id: task.id,
      values: {
        name: task.name,
        description: task.description ?? "",
        parentTaskId: task.parentTaskId ?? "",
        plannedStart: task.plannedStart ?? "",
        plannedEnd: task.plannedEnd ?? "",
        actualStart: task.actualStart ?? "",
        actualEnd: task.actualEnd ?? "",
        status: (task.status as TaskFormValues["status"]) ?? "not_started",
        progressPct: task.progressPct ?? 0,
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "Tasks" }]} />

      {showRefreshCard && (
        <div className="rounded-lg border border-primary/50 bg-accent/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-(--accent-ink)">
            New period · programme refresh
          </p>
          <h3 className="mt-1 text-sm font-semibold">
            Programme updated this period?
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Report № {(gaps?.lastReportNumber ?? 0) + 1}&apos;s period is open.
            If your planner issued a new revision, re-import it — the Gantt,
            lookahead and variance depend on it. If nothing changed, confirm
            and move on.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setImportOpen(true)}>
              Re-import the latest revision
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={confirmProgramme.isPending}
              onClick={() => confirmProgramme.mutate({ id: projectId })}
            >
              No new rev — confirm progress
            </Button>
          </div>
        </div>
      )}

      {/* Baseline strip — reports measure slippage against this snapshot */}
      {baseline && gaps != null && gaps.taskCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Baseline:</span>{" "}
            {baseline.taskCount} activities,{" "}
            {baseline.source === "rebaseline" ? "re-set" : "set at first import"}
            {baseline.setAt
              ? ` on ${new Date(baseline.setAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : ""}
            . Re-imports update the current programme only — reports show
            variance against this baseline.
          </p>
          {confirmRebaseline ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-destructive">
                Replaces the baseline — variance history resets.
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={setBaseline.isPending}
                onClick={() => setBaseline.mutate({ projectId })}
              >
                Confirm re-baseline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRebaseline(false)}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setConfirmRebaseline(true)}
            >
              Re-baseline to current programme
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setView("list")}
            >
              <List className="mr-1 h-3.5 w-3.5" />
              List
            </Button>
            <Button
              variant={view === "gantt" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setView("gantt")}
            >
              <GanttChartSquare className="mr-1 h-3.5 w-3.5" />
              Gantt
            </Button>
          </div>

          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-1 h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <TaskList
          tasks={tasks}
          onEdit={handleEdit}
          onDelete={(id) => deleteMutation.mutate({ id })}
          onReorder={(items) => reorderMutation.mutate({ projectId, items })}
        />
      ) : (
        <>
          {markersError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              <span>
                Evidence markers unavailable — the chart is shown without them.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchMarkers()}
              >
                Retry
              </Button>
            </div>
          )}
          <GanttChart tasks={tasks} evidenceMarkers={evidenceMarkers} />
        </>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        tasks={tasks}
        isSubmitting={createMutation.isPending}
      />

      <TaskFormDialog
        open={editTask !== null}
        onOpenChange={(open) => {
          if (!open) setEditTask(null);
        }}
        onSubmit={handleUpdate}
        defaultValues={editTask?.values}
        tasks={tasks}
        isSubmitting={updateMutation.isPending}
        editTaskId={editTask?.id}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        onImportComplete={() => utils.task.list.invalidate({ projectId })}
      />
    </div>
  );
}
