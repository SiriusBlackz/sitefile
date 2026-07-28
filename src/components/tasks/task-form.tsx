"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTaskStatusLabel } from "@/lib/project-status";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const taskFormSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  description: z.string().optional(),
  parentTaskId: z.string().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualStart: z.string().optional(),
  actualEnd: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "delayed"]),
  progressPct: z.number().min(0).max(100),
}).refine(
  (data) => !data.plannedStart || !data.plannedEnd || data.plannedEnd >= data.plannedStart,
  { message: "End date must be after start date", path: ["plannedEnd"] }
).refine(
  (data) => !data.actualStart || !data.actualEnd || data.actualEnd >= data.actualStart,
  { message: "Actual end must be after actual start", path: ["actualEnd"] }
);

export type TaskFormValues = z.infer<typeof taskFormSchema>;

const EMPTY_VALUES: TaskFormValues = {
  name: "",
  description: "",
  parentTaskId: "",
  plannedStart: "",
  plannedEnd: "",
  actualStart: "",
  actualEnd: "",
  status: "not_started",
  progressPct: 0,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TaskOption {
  id: string;
  name: string;
  depth: number;
  parentTaskId: string | null;
}

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TaskFormValues) => void;
  defaultValues?: Partial<TaskFormValues>;
  tasks: TaskOption[];
  isSubmitting?: boolean;
  editTaskId?: string | null;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  tasks,
  isSubmitting,
  editTaskId,
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  // The dialog component stays mounted across open/close, so form state
  // survives between uses — reset to fresh values every time it opens or
  // the previous task's fields leak into the next one.
  useEffect(() => {
    if (open) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTaskId]);

  const status = watch("status");

  // Status ⇄ progress ⇄ dates stay consistent: completed means 100% with
  // actual dates filled; not started means 0% with no actuals; a partial
  // percentage means work has begun.
  function applyStatus(next: TaskFormValues["status"]) {
    setValue("status", next);
    const v = getValues();
    if (next === "completed") {
      setValue("progressPct", 100);
      if (!v.actualStart) setValue("actualStart", v.plannedStart || today());
      if (!v.actualEnd) setValue("actualEnd", today());
    } else if (next === "not_started") {
      setValue("progressPct", 0);
      setValue("actualStart", "");
      setValue("actualEnd", "");
    } else {
      // in_progress / delayed — work has started but isn't finished
      if (!v.actualStart) setValue("actualStart", today());
      setValue("actualEnd", "");
      if (v.progressPct === 100) setValue("progressPct", 0);
    }
  }

  function applyProgress(raw: number) {
    const pct = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 0), 100) : 0;
    const v = getValues();
    if (pct === 100 && v.status !== "completed") {
      applyStatus("completed");
      setValue("progressPct", 100);
    } else if (pct > 0 && pct < 100 && (v.status === "not_started" || v.status === "completed")) {
      applyStatus("in_progress");
      setValue("progressPct", pct);
    } else if (pct === 0 && v.status === "completed") {
      applyStatus("not_started");
    }
  }

  // Filter out the task being edited AND its descendants from parent options.
  // Without this, the server-side cycle guard catches it but the user sees a
  // backend error instead of the invalid option being hidden in the dropdown.
  const parentOptions = (() => {
    if (!editTaskId) return tasks;
    const descendantIds = new Set<string>([editTaskId]);
    // Iterate until no new descendants found (handles arbitrary tree depth)
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of tasks) {
        if (
          t.parentTaskId &&
          descendantIds.has(t.parentTaskId) &&
          !descendantIds.has(t.id)
        ) {
          descendantIds.add(t.id);
          changed = true;
        }
      }
    }
    return tasks.filter((t) => !descendantIds.has(t.id));
  })();

  function handleFormSubmit(values: TaskFormValues) {
    // Don't reset here — on mutation failure the dialog stays open and the
    // user needs to fix their input, not start over. Reset happens on the
    // next open instead.
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTaskId ? "Edit Task" : "Add Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-name">Task Name *</Label>
            <Input
              id="task-name"
              {...register("name")}
              placeholder="e.g. Foundation excavation"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              {...register("description")}
              placeholder="Optional description..."
            />
          </div>

          <div className="space-y-2">
            <Label>Parent Task</Label>
            <Select
               
              value={watch("parentTaskId") ?? ""}
              onValueChange={(val) =>
                setValue("parentTaskId", val === "__none__" ? "" : (val ?? ""))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (top-level)</SelectItem>
                {parentOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {"—".repeat(t.depth)} {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={status}
                onValueChange={(val) =>
                  applyStatus((val as TaskFormValues["status"]) ?? "not_started")
                }
              >
                <SelectTrigger>
                  <span>{getTaskStatusLabel(status)}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-progress">Progress %</Label>
              <Input
                id="task-progress"
                type="number"
                min={0}
                max={100}
                {...register("progressPct", {
                  valueAsNumber: true,
                  onBlur: (e) => applyProgress(Number(e.target.value)),
                })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-start">Planned Start</Label>
              <Input
                id="task-start"
                type="date"
                {...register("plannedStart")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-end">Planned End</Label>
              <Input id="task-end" type="date" {...register("plannedEnd")} />
              {errors.plannedEnd && (
                <p className="text-sm text-destructive">{errors.plannedEnd.message}</p>
              )}
            </div>
          </div>

          {status !== "not_started" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-actual-start">Actual Start</Label>
                <Input
                  id="task-actual-start"
                  type="date"
                  {...register("actualStart")}
                />
              </div>
              {status === "completed" && (
                <div className="space-y-2">
                  <Label htmlFor="task-actual-end">Actual End</Label>
                  <Input
                    id="task-actual-end"
                    type="date"
                    {...register("actualEnd")}
                  />
                  {errors.actualEnd && (
                    <p className="text-sm text-destructive">{errors.actualEnd.message}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editTaskId ? "Update" : "Add Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
