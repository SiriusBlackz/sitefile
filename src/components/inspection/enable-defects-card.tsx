"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CONTRACT_FORMS, LOCATION_SCHEMES } from "@/server/db/enums";
import { CONTRACT_FORM_LABELS, LOCATION_SCHEME_LABELS } from "@/lib/format";

type Scheme = (typeof LOCATION_SCHEMES)[number];
type Form = (typeof CONTRACT_FORMS)[number];

/**
 * "Works reached completion" for a progress project: switch the defects
 * register on. The project keeps its programme, diary and past reports on
 * record; from here on the phone records defects and Reports issues
 * inspection and close-out reports. One-way from the app.
 */
export function EnableDefectsCard({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [scheme, setScheme] = useState<Scheme | "">("");
  const [form, setForm] = useState<Form | "">("");
  const [days, setDays] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const enable = trpc.inspection.enableDefects.useMutation({
    onSuccess: () => {
      toast.success("Defects period started — the register is now live on this project");
      setConfirmOpen(false);
      utils.project.get.invalidate({ id: projectId });
      utils.project.list.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Defects period</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When the works reach completion, switch this project over to the
          defects register: walk the site recording defects with photos, track
          each one to verified close-out, and issue inspection and close-out
          reports. The site diary carries on; the programme and monthly reports
          stay on record and report numbering continues.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="enable-scheme">Location scheme *</Label>
            <select
              id="enable-scheme"
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Scheme | "")}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose…</option>
              {LOCATION_SCHEMES.map((s) => (
                <option key={s} value={s}>{LOCATION_SCHEME_LABELS[s]}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              What the phone asks for on every defect — linear for roads, rail
              and cable routes; building for block, level and room.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enable-form">Contract form</Label>
            <select
              id="enable-form"
              value={form}
              onChange={(e) => setForm(e.target.value as Form | "")}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Not set</option>
              {CONTRACT_FORMS.map((f) => (
                <option key={f} value={f}>{CONTRACT_FORM_LABELS[f]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enable-days">Defect correction period (days)</Label>
            <Input
              id="enable-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. 28"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Used only to compute a due date once an item is formally notified.
            </p>
          </div>
        </div>
        <Button disabled={!scheme || enable.isPending} onClick={() => setConfirmOpen(true)}>
          Start defects period
        </Button>
        <p className="text-xs text-muted-foreground">
          For project managers, construction managers and supervisors. This
          can&apos;t be switched back from the app.
        </p>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start the defects period?</AlertDialogTitle>
              <AlertDialogDescription>
                The project switches to the defects register: the phone home
                becomes Record item and the Reports page issues inspection and
                close-out reports. The site diary stays; the monthly progress
                report, programme and commercial register come off the menu —
                nothing already recorded is removed, and past reports stay listed.
                This can&apos;t be undone from the app.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={enable.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!scheme || enable.isPending}
                onClick={() =>
                  scheme &&
                  enable.mutate({
                    projectId,
                    locationScheme: scheme,
                    contractForm: form || null,
                    defaultCorrectionPeriodDays: days ? Number(days) : null,
                  })
                }
              >
                {enable.isPending ? "Starting…" : "Start defects period"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
