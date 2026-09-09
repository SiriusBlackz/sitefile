"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PWAInstallBanner } from "@/components/layout/pwa-install-banner";
import { ITEM_STATUS_LABELS, STAGE_LABELS, locationLine } from "@/lib/inspection-location";
import { readStage, writeStage, writeCachedProject, type Stage } from "@/lib/inspection-local";
import { ClipboardPlus, ChevronRight, FileText, ListChecks } from "lucide-react";

/**
 * Phone home for an inspection project. No readiness ring, no diary, no
 * programme gaps: the register counts, one giant Record item CTA, and the
 * latest items. Progress projects never render this.
 */
export function InspectionPhoneHome({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const { data: summary } = trpc.inspection.summary.useQuery({ projectId });
  const { data: items = [] } = trpc.inspection.list.useQuery({ projectId });
  const { data: project } = trpc.project.get.useQuery({ id: projectId });
  const [stage, setStage] = useState<Stage>("end_of_defects_period");
  useEffect(() => { setStage(readStage(projectId)); }, [projectId]);
  useEffect(() => {
    if (project) writeCachedProject(projectId, { locationScheme: project.locationScheme ?? null, name: project.name });
  }, [project, projectId]);
  const reinspecting = stage !== "initial_walkthrough";
  const ready = items.filter((i) => i.status === "ready_for_review");

  const latest = [...items].sort((a, b) => b.seq - a.seq).slice(0, 5);

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <PWAInstallBanner />
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          {" · Defects inspection"}
        </p>
        <h1 className="text-xl font-extrabold leading-tight tracking-tight">{projectName}</h1>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Visit stage</span>
        <select
          value={stage}
          onChange={(e) => { const s = e.target.value as Stage; setStage(s); writeStage(projectId, s); }}
          className="h-8 flex-1 rounded-lg border bg-background px-2 text-sm"
          aria-label="Visit stage"
        >
          {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-1.5" aria-label="Register counts">
        {[
          { label: "Items", value: summary?.total ?? 0 },
          { label: "Open", value: summary?.open ?? 0 },
          { label: "Ready", value: summary?.readyForReview ?? 0 },
          { label: "Closed", value: summary?.verifiedClosed ?? 0 },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border px-1 py-1.5 text-center">
            <div className="text-[10px] text-muted-foreground">{t.label}</div>
            <div className="font-mono text-sm font-bold">{t.value}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push(`/inspect/new?projectId=${projectId}`)}
        className="flex w-full flex-col items-center gap-1.5 rounded-2xl bg-primary px-4 py-6 text-primary-foreground active:brightness-95"
      >
        <ClipboardPlus className="h-8 w-8" />
        <span className="text-2xl font-extrabold tracking-tight">Record item</span>
        <span className="text-xs opacity-80">Location · photos · finding</span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/inspect?projectId=${projectId}`}
          className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium"
        >
          <ListChecks className="h-4 w-4 text-(--accent-ink)" />
          Register
        </Link>
        <Link
          href={`/projects/${projectId}/reports`}
          className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium"
        >
          <FileText className="h-4 w-4 text-(--accent-ink)" />
          Report
        </Link>
      </div>

      {reinspecting && ready.length > 0 && (
        <div className="space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Ready for review · {ready.length}
          </span>
          {ready.slice(0, 5).map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-xl border border-primary/40 bg-accent p-3">
              <span className="font-mono text-xs font-bold">{it.ref}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.title}</span>
              <Link href={`/inspect/${it.id}?projectId=${projectId}&verify=1`} className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Verify</Link>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Latest items
        </span>
        {latest.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Nothing recorded yet. Tap Record item at the first defect.
          </p>
        ) : (
          latest.map((it) => (
            <Link
              key={it.id}
              href={`/inspect/${it.id}?projectId=${projectId}`}
              className="flex items-center gap-3 rounded-xl border p-3"
            >
              <span className="font-mono text-xs font-bold">{it.ref}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{it.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {locationLine(project?.locationScheme, it.location as never)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]",
                  it.status === "verified_closed"
                    ? "bg-green-500/15 text-green-700"
                    : "bg-accent text-(--accent-ink)"
                )}
              >
                {ITEM_STATUS_LABELS[it.status]}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
