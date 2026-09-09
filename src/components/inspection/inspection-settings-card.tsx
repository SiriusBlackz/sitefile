"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_FORMS, LOCATION_SCHEMES } from "@/server/db/enums";

const CONTRACT_FORM_LABELS: Record<string, string> = {
  nec4_ecc: "NEC4 ECC",
  nec3_ecc: "NEC3 ECC",
  jct: "JCT",
  other: "Other",
};
const SCHEME_LABELS: Record<string, string> = {
  linear: "Linear (route · chainage · side)",
  building: "Building (block · level · room · element)",
  grid: "Grid reference",
};

type Dates = { completion?: string | null; defectsDate?: string | null; confirmed?: { completion?: boolean; defectsDate?: boolean } } | null;

/** Inspection-only project settings: contract form, correction period, location scheme, contract dates. */
export function InspectionSettingsCard({
  projectId,
  contractForm,
  locationScheme,
  defaultCorrectionPeriodDays,
  contractDates,
}: {
  projectId: string;
  contractForm: string | null;
  locationScheme: string | null;
  defaultCorrectionPeriodDays: number | null;
  contractDates: unknown;
}) {
  const utils = trpc.useUtils();
  const cd = (contractDates ?? null) as Dates;
  const [form, setForm] = useState(contractForm ?? "");
  const [scheme, setScheme] = useState(locationScheme ?? "");
  const [days, setDays] = useState(defaultCorrectionPeriodDays ? String(defaultCorrectionPeriodDays) : "");
  const [completion, setCompletion] = useState(cd?.completion ?? "");
  const [defectsDate, setDefectsDate] = useState(cd?.defectsDate ?? "");
  const [completionConfirmed, setCompletionConfirmed] = useState(Boolean(cd?.confirmed?.completion));
  const [defectsConfirmed, setDefectsConfirmed] = useState(Boolean(cd?.confirmed?.defectsDate));

  const update = trpc.project.update.useMutation({
    onSuccess: () => {
      toast.success("Inspection settings saved");
      utils.project.get.invalidate({ id: projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inspection settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The location scheme shapes what the phone asks for on every item. Contract
          dates print on the report as confirmed or not confirmed — never assumed.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="insp-scheme">Location scheme</Label>
            <select
              id="insp-scheme"
              value={scheme}
              onChange={(e) => setScheme(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose…</option>
              {LOCATION_SCHEMES.map((s) => (
                <option key={s} value={s}>{SCHEME_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insp-form">Contract form</Label>
            <select
              id="insp-form"
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Not set</option>
              {CONTRACT_FORMS.map((f) => (
                <option key={f} value={f}>{CONTRACT_FORM_LABELS[f]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insp-days">Default defect correction period (days)</Label>
            <Input id="insp-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 28" />
            <p className="text-xs text-muted-foreground">Used only to compute a due date once an item is formally notified.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insp-completion">Completion date</Label>
            <Input id="insp-completion" type="date" value={completion} onChange={(e) => setCompletion(e.target.value)} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={completionConfirmed} onChange={(e) => setCompletionConfirmed(e.target.checked)} />
              Confirmed from the contract
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insp-defects">Defects date</Label>
            <Input id="insp-defects" type="date" value={defectsDate} onChange={(e) => setDefectsDate(e.target.value)} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={defectsConfirmed} onChange={(e) => setDefectsConfirmed(e.target.checked)} />
              Confirmed from the contract
            </label>
          </div>
        </div>
        <Button
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              id: projectId,
              contractForm: (form || null) as "nec4_ecc" | "nec3_ecc" | "jct" | "other" | null,
              locationScheme: (scheme || null) as "building" | "linear" | "grid" | null,
              defaultCorrectionPeriodDays: days ? Number(days) : null,
              contractDates: {
                completion: completion || null,
                defectsDate: defectsDate || null,
                confirmed: { completion: completionConfirmed, defectsDate: defectsConfirmed },
              },
            })
          }
        >
          {update.isPending ? "Saving…" : "Save inspection settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
