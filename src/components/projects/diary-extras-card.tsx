"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DIARY_EXTRA_LABELS, parseDiaryExtras, type DiaryExtras } from "@/lib/diary-extras";

/**
 * Optional diary additions. Off by default — every switch adds a field to
 * the foreman's phone ritual, so the PM turns on only what the site needs.
 */
export function DiaryExtrasCard({ projectId, diaryExtras }: { projectId: string; diaryExtras: unknown }) {
  const utils = trpc.useUtils();
  const [extras, setExtras] = useState<DiaryExtras>(() => parseDiaryExtras(diaryExtras));
  const [dirty, setDirty] = useState(false);
  const update = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Diary additions saved");
      setDirty(false);
      utils.project.get.invalidate({ id: projectId });
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Site diary additions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Extra lines on the foreman&apos;s daily diary, taken from the end-of-shift report format. Each one adds a field to the phone ritual, so switch on only what this site reports.
        </p>
        {(Object.keys(DIARY_EXTRA_LABELS) as (keyof DiaryExtras)[]).map((k) => (
          <div key={k} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{DIARY_EXTRA_LABELS[k].label}</p>
              <p className="text-xs text-muted-foreground">{DIARY_EXTRA_LABELS[k].help}</p>
            </div>
            <Switch checked={extras[k]} onCheckedChange={(v) => { setExtras((e) => ({ ...e, [k]: Boolean(v) })); setDirty(true); }} aria-label={DIARY_EXTRA_LABELS[k].label} />
          </div>
        ))}
        {dirty && (
          <div className="flex justify-end border-t pt-3">
            <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: projectId, diaryExtras: extras })}>
              {update.isPending ? "Saving..." : "Save diary additions"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
