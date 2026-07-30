"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type Variant = "primary" | "icon";

interface CaptureLauncherProps {
  variant?: Variant;
  onNavigated?: () => void;
}

export function CaptureLauncher({
  variant = "primary",
  onNavigated,
}: CaptureLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");

  const { data: projects = [], isLoading } = trpc.project.list.useQuery(
    undefined,
    { enabled: open }
  );

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects]
  );

  // If launched and exactly one active project exists, skip the picker.
  useEffect(() => {
    if (!open || isLoading) return;
    if (activeProjects.length === 1) {
      const id = activeProjects[0].id;
      setOpen(false);
      router.push(`/capture?projectId=${id}`);
      onNavigated?.();
    } else if (activeProjects.length === 0 && projects.length > 0) {
      setOpen(false);
      toast.error("No active projects. Activate a project first.");
    } else if (projects.length === 0) {
      setOpen(false);
      toast.error("Create a project before capturing photos.");
      router.push("/projects/new");
      onNavigated?.();
    }
  }, [open, isLoading, activeProjects, projects, router, onNavigated]);

  const launch = () => {
    if (!selected) return;
    setOpen(false);
    setSelected("");
    router.push(`/capture?projectId=${selected}`);
    onNavigated?.();
  };

  const trigger =
    variant === "icon" ? (
      <Tooltip>
        <TooltipTrigger
          aria-label="Capture photos"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors"
        >
          <Camera className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent>Capture photos</TooltipContent>
      </Tooltip>
    ) : (
      <Button
        className="w-full justify-start gap-2"
        onClick={() => setOpen(true)}
      >
        <Camera className="h-4 w-4" />
        Capture Photos
      </Button>
    );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pick a project to capture for</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Loading projects...</p>
            )}
            {!isLoading && activeProjects.length > 1 && (
              <>
                <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className="max-w-[calc(100vw-2rem)]"
                  >
                    {activeProjects.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="*:min-w-0 *:shrink *:whitespace-normal"
                      >
                        {p.name}
                        {p.reference ? ` (${p.reference})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={launch} disabled={!selected}>
                    Open Capture
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
