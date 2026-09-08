"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { ArrowRightLeft } from "lucide-react";

type Person = { id: string; name: string; email: string };

interface HandOverDialogProps {
  projectId: string;
  /** People currently running the project: explicit members plus org admins. */
  current: Person[];
  /** Everyone in the organisation who could take it on. */
  candidates: Person[];
  disabled?: boolean;
}

/**
 * "Our PM is leaving" in one step: the replacement takes the leaver's
 * project role and their place in the approval chain; the leaver can be
 * removed from the project at the same time. Past approvals, uploads and
 * diary days keep the leaver's name — nothing is rewritten.
 */
export function HandOverDialog({
  projectId,
  current,
  candidates,
  disabled,
}: HandOverDialogProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [removeFrom, setRemoveFrom] = useState(true);

  const handOver = trpc.project.handOver.useMutation({
    onSuccess: (r) => {
      const to = candidates.find((c) => c.id === toId);
      toast.success(
        `${to?.name ?? "Replacement"} now runs this project${r.removedFrom ? "; the previous person has been removed" : ""}.`
      );
      utils.project.memberList.invalidate({ projectId });
      utils.project.get.invalidate({ id: projectId });
      setOpen(false);
      setFromId(null);
      setToId(null);
      setRemoveFrom(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const label = (p: Person) => `${p.name} · ${p.email}`;
  const canSubmit = Boolean(fromId && toId && fromId !== toId) && !handOver.isPending;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || current.length === 0}
        onClick={() => setOpen(true)}
      >
        <ArrowRightLeft className="mr-2 h-4 w-4" />
        Hand over project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hand over this project</DialogTitle>
            <DialogDescription>
              For when the person running it is leaving. The replacement takes
              their project role and their place in the approval chain. Past
              approvals, uploads and diary days stay under the original name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="handover-from">From</Label>
              <Select value={fromId} onValueChange={(v) => setFromId(v)}>
                <SelectTrigger id="handover-from" className="w-full">
                  <SelectValue>
                    {(val: string | null) => {
                      const p = current.find((c) => c.id === val);
                      return p ? label(p) : "Who is leaving?";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {current.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {label(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="handover-to">To</Label>
              <Select value={toId} onValueChange={(v) => setToId(v)}>
                <SelectTrigger id="handover-to" className="w-full">
                  <SelectValue>
                    {(val: string | null) => {
                      const p = candidates.find((c) => c.id === val);
                      return p ? label(p) : "Who takes it on?";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {candidates
                    .filter((p) => p.id !== fromId)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {label(p)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Not in the list? Add them by email in Team Members first.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={removeFrom}
                onCheckedChange={(v) => setRemoveFrom(Boolean(v))}
                className="mt-0.5"
              />
              <span>
                Remove the leaver from this project
                <span className="block text-xs text-muted-foreground">
                  Untick if they are staying on in a smaller role. Org admins
                  keep access to every project either way.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => {
                if (fromId && toId)
                  handOver.mutate({ projectId, fromUserId: fromId, toUserId: toId, removeFrom });
              }}
            >
              {handOver.isPending ? "Handing over…" : "Hand over"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
