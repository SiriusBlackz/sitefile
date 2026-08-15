"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ReportList } from "@/components/reports/report-list";
import { GenerateDialog } from "@/components/reports/generate-dialog";
import { ReportBuilderPanel } from "@/components/reports/report-builder-panel";
import { ProjectBreadcrumb } from "@/components/layout/breadcrumb";
import { toast } from "sonner";

export default function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [generateOpen, setGenerateOpen] = useState(false);
  // Bumped on each open so GenerateDialog remounts with fresh default dates.
  const [generateKey, setGenerateKey] = useState(0);
  const utils = trpc.useUtils();
  // Report ids seen as "generating", so we can toast when they finish.
  const generatingIdsRef = useRef<Set<string>>(new Set());

  const { data: reports = [], isLoading } = trpc.report.list.useQuery(
    { projectId },
    {
      // Poll while any report is still generating so the row flips to
      // Completed/Failed without a manual refresh.
      refetchInterval: (query) =>
        query.state.data?.some((r) => r.status === "generating") ? 3000 : false,
    }
  );

  useEffect(() => {
    for (const r of reports) {
      if (r.status === "generating") {
        generatingIdsRef.current.add(r.id);
      } else if (generatingIdsRef.current.has(r.id)) {
        generatingIdsRef.current.delete(r.id);
        if (r.status === "completed") {
          toast.success(`Report #${r.reportNumber} is ready to download`);
        } else if (r.status === "failed") {
          toast.error(
            `Report #${r.reportNumber} failed to generate. You can try again.`
          );
        }
      }
    }
  }, [reports]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectBreadcrumb items={[{ label: "Reports" }]} />
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
      </div>

      {/* The standing draft — readiness ring, fix rows, Review & send. */}
      <ReportBuilderPanel
        projectId={projectId}
        onReviewAndSend={() => {
          setGenerateKey((k) => k + 1);
          setGenerateOpen(true);
        }}
      />

      <ReportList reports={reports} />

      <GenerateDialog
        key={generateKey}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        projectId={projectId}
        onGenerated={() => utils.report.list.invalidate({ projectId })}
        lastPeriodEnd={reports
          .filter((r) => r.status === "completed")
          .reduce<string | null>(
            (max, r) => (max === null || r.periodEnd > max ? r.periodEnd : max),
            null
          )}
      />
    </div>
  );
}
