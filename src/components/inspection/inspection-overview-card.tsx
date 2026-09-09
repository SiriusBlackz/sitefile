"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { DueItemsPanel } from "./due-items-panel";

/** Desk overview for an inspection project: register counts + where to go. */
export function InspectionOverviewCard({ projectId }: { projectId: string }) {
  const { data: s } = trpc.inspection.summary.useQuery({ projectId });
  const tiles = [
    { label: "Items on register", value: s?.total ?? 0 },
    { label: "Open / in progress", value: s?.open ?? 0 },
    { label: "Ready for review", value: s?.readyForReview ?? 0 },
    { label: "Verified closed", value: s?.verifiedClosed ?? 0 },
    { label: "With photos", value: s?.withPhotos ?? 0 },
    { label: "Overdue", value: s?.overdue ?? 0 },
    { label: "Due in 7 days", value: s?.dueSoon ?? 0 },
  ];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Defects register
        </CardTitle>
        <Link href={`/projects/${projectId}/inspection`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open register
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <DueItemsPanel projectId={projectId} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Items are recorded on the phone during a visit. Only items marked Verified
          closed count as closed on the report.
        </p>
      </CardContent>
    </Card>
  );
}
