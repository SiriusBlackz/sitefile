"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  GripVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDate, formatDateRange } from "@/lib/format";

interface TaskItem {
  id: string;
  parentTaskId: string | null;
  name: string;
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPct: number | null;
  sortOrder: number | null;
  status: string | null;
  depth: number;
}

interface TaskListProps {
  tasks: TaskItem[];
  onEdit: (task: TaskItem) => void;
  onDelete: (taskId: string) => void;
  onReorder: (
    items: { id: string; sortOrder: number; parentTaskId: string | null }[]
  ) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  not_started: {
    label: "Not Started",
    className: "bg-muted text-muted-foreground",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  delayed: {
    label: "Delayed",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

export function TaskList({ tasks, onEdit, onDelete, onReorder }: TaskListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<TaskItem | null>(null);

  function getSiblings(task: TaskItem) {
    return tasks.filter((t) => t.parentTaskId === task.parentTaskId);
  }

  function canMoveUp(task: TaskItem) {
    const siblings = getSiblings(task);
    const idx = siblings.findIndex((t) => t.id === task.id);
    return idx > 0;
  }

  function canMoveDown(task: TaskItem) {
    const siblings = getSiblings(task);
    const idx = siblings.findIndex((t) => t.id === task.id);
    return idx < siblings.length - 1;
  }

  function moveTask(task: TaskItem, direction: "up" | "down") {
    const siblings = getSiblings(task);
    const idx = siblings.findIndex((t) => t.id === task.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const other = siblings[swapIdx];
    onReorder([
      {
        id: task.id,
        sortOrder: other.sortOrder ?? 0,
        parentTaskId: task.parentTaskId,
      },
      {
        id: other.id,
        sortOrder: task.sortOrder ?? 0,
        parentTaskId: other.parentTaskId,
      },
    ]);
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No tasks yet. Add your first task to get started.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {tasks.map((task) => {
          const status = statusConfig[task.status ?? "not_started"];
          const progress = task.progressPct ?? 0;

          return (
            <div
              key={task.id}
              className="group flex items-center gap-2 max-sm:flex-wrap rounded-lg border bg-card px-3 py-2 hover:bg-muted/50"
              style={{ marginLeft: `${task.depth * 24}px` }}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 max-sm:flex-wrap">
                  <span className="font-medium truncate max-sm:w-full">
                    {task.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn("text-xs shrink-0", status.className)}
                  >
                    {status.label}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {(task.plannedStart || task.plannedEnd) && (
                    <span className="whitespace-nowrap">
                      Planned {formatDateRange(task.plannedStart, task.plannedEnd)}
                    </span>
                  )}
                  {(task.actualStart || task.actualEnd) && (
                    <span className="whitespace-nowrap text-green-700 dark:text-green-400">
                      Actual{" "}
                      {task.actualEnd
                        ? formatDateRange(task.actualStart, task.actualEnd)
                        : `${formatDate(task.actualStart)} – ongoing`}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span>{progress}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5 max-sm:w-full max-sm:justify-end md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => moveTask(task, "up")}
                        disabled={!canMoveUp(task)}
                        aria-label={`Move ${task.name} up`}
                      />
                    }
                  >
                    <ChevronUp className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Move up</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => moveTask(task, "down")}
                        disabled={!canMoveDown(task)}
                        aria-label={`Move ${task.name} down`}
                      />
                    }
                  >
                    <ChevronDown className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Move down</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onEdit(task)}
                        aria-label={`Edit ${task.name}`}
                      />
                    }
                  >
                    <Pencil className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteConfirm(task)}
                        aria-label={`Delete ${task.name}`}
                      />
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {deleteConfirm?.name}
            </span>
            ? Child tasks will be moved up to the parent level.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) onDelete(deleteConfirm.id);
                setDeleteConfirm(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
