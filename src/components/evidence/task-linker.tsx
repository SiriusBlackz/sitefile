"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";

interface TaskSuggestion {
  taskId: string;
  taskName: string;
  confidence: number;
  reasons: string[];
}

interface TaskLinkerProps {
  evidenceId: string;
  projectId: string;
  linkedTaskIds: string[];
  suggestions?: TaskSuggestion[];
}

export function TaskLinker({
  evidenceId,
  projectId,
  linkedTaskIds,
  suggestions,
}: TaskLinkerProps) {
  const utils = trpc.useUtils();
  const { data: tasks = [] } = trpc.task.list.useQuery({ projectId });
  const [unlinkTarget, setUnlinkTarget] = useState<{
    taskId: string;
    name: string;
  } | null>(null);

  const linkMutation = trpc.evidence.link.useMutation({
    onSuccess: () => {
      utils.evidence.list.invalidate();
      toast.success("Task linked");
    },
    onError: (err) => toast.error(err.message),
  });

  const unlinkMutation = trpc.evidence.unlink.useMutation({
    onSuccess: () => {
      utils.evidence.list.invalidate();
      setUnlinkTarget(null);
      toast.success("Task unlinked");
    },
    onError: (err) => toast.error(err.message),
  });

  const availableTasks = tasks.filter((t) => !linkedTaskIds.includes(t.id));
  const linkedTasks = tasks.filter((t) => linkedTaskIds.includes(t.id));

  // Filter suggestions to only show unlinked tasks
  const activeSuggestions = suggestions?.filter(
    (s) => !linkedTaskIds.includes(s.taskId)
  );

  function handleLink(
    taskId: string,
    method: "manual" | "ai_suggested" = "manual",
    confidence?: number
  ) {
    linkMutation.mutate({
      evidenceId,
      taskId,
      linkMethod: method,
      aiConfidence: confidence,
    });
  }

  function handleUnlink(taskId: string) {
    const taskName = linkedTasks.find((t) => t.id === taskId)?.name ?? "this task";
    setUnlinkTarget({ taskId, name: taskName });
  }

  function confidenceColor(c: number) {
    if (c >= 0.7) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (c >= 0.4) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  }

  return (
    <div className="space-y-3">
      {linkedTasks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Linked Tasks
          </p>
          <div className="flex flex-wrap gap-1">
            {linkedTasks.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                {t.name}
                <button
                  onClick={() => handleUnlink(t.id)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {activeSuggestions && activeSuggestions.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            AI suggestions
          </p>
          <div className="space-y-1">
            {activeSuggestions.map((s) => (
              <button
                key={s.taskId}
                className="flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm hover:bg-muted/50 transition-colors"
                onClick={() =>
                  handleLink(s.taskId, "ai_suggested", s.confidence)
                }
              >
                <Badge
                  variant="secondary"
                  className={`text-[10px] shrink-0 ${confidenceColor(s.confidence)}`}
                >
                  {Math.round(s.confidence * 100)}%
                </Badge>
                <span className="min-w-0">
                  <span className="block truncate">{s.taskName}</span>
                  {s.reasons.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {s.reasons.join(" · ")}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {availableTasks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Link a Task
          </p>
          <Select
            value=""
            onValueChange={(val) => {
              if (val) handleLink(val);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a task..." />
            </SelectTrigger>
            <SelectContent>
              {availableTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {"—".repeat(t.depth)} {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <AlertDialog
        open={unlinkTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlink &ldquo;{unlinkTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This photo will no longer appear under {unlinkTarget?.name ?? "this task"} in
              the gallery or reports. You can re-link it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!unlinkTarget) return;
                unlinkMutation.mutate({ evidenceId, taskId: unlinkTarget.taskId });
              }}
              disabled={unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? "Unlinking..." : "Unlink"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
