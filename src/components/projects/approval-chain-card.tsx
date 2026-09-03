"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { parseApprovalChain } from "@/lib/report-approval";

interface StepDraft {
  userId: string | null;
  label: string;
}

const DEFAULT_LABELS = ["Review", "Sign-off", "Final sign-off"];

/**
 * Tiered report sign-off config: an ordered chain of 1-3 named people who
 * must approve each generated report, in order, before it can be sent.
 */
export function ApprovalChainCard({
  projectId,
  approvalChain,
}: {
  projectId: string;
  approvalChain: unknown;
}) {
  const utils = trpc.useUtils();
  const { data: orgUsers = [] } = trpc.project.orgUsers.useQuery();

  const saved = parseApprovalChain(approvalChain);
  const [enabled, setEnabled] = useState(Boolean(saved));
  const [steps, setSteps] = useState<StepDraft[]>(
    saved
      ? saved.steps.map((s) => ({ userId: s.userId, label: s.label }))
      : [{ userId: null, label: "Sign-off" }]
  );
  const [dirty, setDirty] = useState(false);

  // Re-seed from the server when the project reloads with a different chain.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    const fresh = parseApprovalChain(approvalChain);
    setEnabled(Boolean(fresh));
    setSteps(
      fresh
        ? fresh.steps.map((s) => ({ userId: s.userId, label: s.label }))
        : [{ userId: null, label: "Sign-off" }]
    );
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedKey is the value identity
  }, [savedKey]);

  const setChain = trpc.project.setApprovalChain.useMutation({
    onSuccess: () => {
      toast.success("Report approval settings saved");
      setDirty(false);
      utils.project.get.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const usedIds = new Set(steps.map((s) => s.userId).filter(Boolean));
  const complete =
    steps.length > 0 && steps.every((s) => s.userId && s.label.trim());

  function save() {
    if (!enabled) {
      setChain.mutate({ projectId, chain: null });
      return;
    }
    if (!complete) return;
    setChain.mutate({
      projectId,
      chain: {
        steps: steps.map((s) => ({
          userId: s.userId as string,
          label: s.label.trim(),
        })),
      },
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Report approval</CardTitle>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(Boolean(v));
            setDirty(true);
          }}
          aria-label="Require sign-off before reports are sent"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          When on, a generated report is held from the client until each
          person below approves it, in order — e.g. the site manager
          prepares, the project manager reviews, the construction manager
          signs off. Choose one, two or three steps.
        </p>
        {enabled && (
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <Select
                  value={step.userId}
                  onValueChange={(val) => {
                    setSteps((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, userId: val } : s))
                    );
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a person...">
                      {(val: string | null) => {
                        const u = orgUsers.find((x) => x.id === val);
                        return u ? u.name : "Choose a person...";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {orgUsers
                      .filter(
                        (u) => u.id === step.userId || !usedIds.has(u.id)
                      )
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  value={step.label}
                  onChange={(e) => {
                    setSteps((prev) =>
                      prev.map((s, j) =>
                        j === i ? { ...s, label: e.target.value } : s
                      )
                    );
                    setDirty(true);
                  }}
                  className="w-32"
                  aria-label={`Step ${i + 1} label`}
                />
                {steps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => {
                      setSteps((prev) => prev.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {steps.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSteps((prev) => [
                    ...prev,
                    {
                      userId: null,
                      label:
                        DEFAULT_LABELS[prev.length] ??
                        `Step ${prev.length + 1}`,
                    },
                  ]);
                  setDirty(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add a step
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Applies to reports generated after saving — a report already
              in flight keeps the chain it was created with.
            </p>
          </div>
        )}
        {dirty && (
          <div className="flex justify-end border-t pt-3">
            <Button
              size="sm"
              onClick={save}
              disabled={setChain.isPending || (enabled && !complete)}
            >
              {setChain.isPending ? "Saving..." : "Save approval settings"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
