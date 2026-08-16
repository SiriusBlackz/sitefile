"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { pointInPolygon } from "@/lib/geo";
import {
  buildGapRows,
  dueChip,
  readinessPct,
  rowHref,
  type GapSnapshot,
} from "@/lib/readiness";
import { ResumeCaptureBanner } from "@/components/capture/resume-capture-banner";
import { PWAInstallBanner } from "@/components/layout/pwa-install-banner";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  FileText,
} from "lucide-react";

/**
 * The phone site-home — Site Boots' key screen. No menu, no tabs: the
 * home IS the navigator. Hero with the readiness ring and due chip, the
 * week's photo tracker (zero-days shown in red, not hidden), one
 * dominant Capture CTA, and the draft gap list as the only content
 * section — every row deep-links to the screen that fixes it.
 */
export function PhoneProjectHome({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const { data: gaps } = trpc.project.gapList.useQuery({ id: projectId });
  const { data: zones = [] } = trpc.zone.list.useQuery({ projectId });

  // "You're in <zone>" subtitle — best-effort, degrades to plain "GPS on".
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (zones.length === 0) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setGpsOk(true);
        for (const z of zones) {
          const polygon = z.polygon as { coordinates: number[][][] };
          if (
            pointInPolygon(
              [pos.coords.longitude, pos.coords.latitude],
              polygon.coordinates
            )
          ) {
            setZoneName(z.name);
            return;
          }
        }
      },
      () => setGpsOk(false),
      { timeout: 5000 }
    );
  }, [zones]);

  if (!gaps) {
    return (
      <div className="space-y-3 p-4">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const snapshot = gaps as GapSnapshot;
  const pct = readinessPct(snapshot);
  const chip = dueChip(snapshot);
  const rows = buildGapRows(snapshot);
  const nextNumber = (gaps.lastReportNumber ?? 0) + 1;
  const sent = chip.variant === "sent";

  // Week tracker: last 5 days of the 7 returned.
  const week = gaps.photosByDay.slice(-5);

  const R = 18;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <ResumeCaptureBanner projectId={projectId} />
      <PWAInstallBanner />

      {/* Hero */}
      <div className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-xl font-extrabold leading-tight tracking-tight">
            {projectName}
          </h1>
          <svg width="44" height="44" viewBox="0 0 44 44" aria-label={`Report ${pct}% ready`}>
            <circle cx="22" cy="22" r={R} fill="none" strokeWidth="5" className="stroke-muted" />
            <circle
              cx="22"
              cy="22"
              r={R}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-primary"
              strokeDasharray={`${(pct / 100) * C} ${C}`}
              transform="rotate(-90 22 22)"
            />
            <text
              x="22"
              y="26"
              textAnchor="middle"
              className="fill-foreground font-mono text-[10px] font-bold"
            >
              {pct}%
            </text>
          </svg>
        </div>

        {/* Due chip */}
        <Link
          href={`/projects/${projectId}/reports`}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-2",
            sent
              ? "border-green-500/40 bg-green-500/10"
              : chip.variant === "due" && chip.overdue
                ? "border-red-500/50 bg-red-500/10"
                : "border-primary/40 bg-accent"
          )}
        >
          <FileText
            className={cn(
              "h-4 w-4 shrink-0",
              sent
                ? "text-green-600 dark:text-green-400"
                : "text-(--accent-ink)"
            )}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {chip.label}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tracking-wide",
              sent
                ? "text-green-700 dark:text-green-400"
                : chip.variant === "due" && chip.overdue
                  ? "text-red-600 dark:text-red-400"
                  : "text-(--accent-ink)"
            )}
          >
            {chip.mono}
          </span>
        </Link>

        {/* Week tracker */}
        <div
          className="grid grid-cols-5 gap-1.5"
          aria-label="Photos this week, by day"
        >
          {week.map((day, i) => {
            const isToday = i === week.length - 1;
            const zero = day.count === 0;
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-lg border px-1 py-1.5 text-center",
                  isToday
                    ? "border-primary/60 bg-accent"
                    : zero
                      ? "border-dashed border-red-400/60"
                      : "border-border"
                )}
              >
                <div className="text-[10px] text-muted-foreground">
                  {new Date(day.date + "T00:00:00").toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </div>
                <div
                  className={cn(
                    "font-mono text-sm font-bold",
                    zero && !isToday
                      ? "text-red-600 dark:text-red-400"
                      : "text-foreground"
                  )}
                >
                  {day.count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* THE Capture CTA — the only amber block above the fold. */}
      <button
        onClick={() => router.push(`/capture?projectId=${projectId}`)}
        className="flex w-full flex-col items-center gap-1.5 rounded-2xl bg-primary px-4 py-6 text-primary-foreground active:brightness-95"
      >
        <Camera className="h-8 w-8" />
        <span className="text-2xl font-extrabold tracking-tight">Capture</span>
        <span className="text-xs opacity-80">
          {gpsOk === false
            ? "GPS off — photos won't verify"
            : zoneName
              ? `GPS on · you're in ${zoneName}`
              : "GPS on"}
        </span>
      </button>

      {/* Gap list — the home's only content section. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Draft gap list · Report № {nextNumber}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold",
              rows.length > 0
                ? "bg-accent text-(--accent-ink)"
                : "bg-green-500/15 text-green-700 dark:text-green-400"
            )}
          >
            {rows.length > 0 ? `${rows.length} OPEN` : "CLEAR"}
          </span>
        </div>

        {rows.length === 0 ? (
          <Link
            href={`/projects/${projectId}/reports`}
            className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-3"
          >
            <Check className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {sent
                  ? `Report № ${gaps.lastReport?.number} sent — watch the receipt`
                  : `Gap list clear — Report № ${nextNumber} is ready`}
              </span>
              <span className="block text-xs text-muted-foreground">
                {sent
                  ? "Opened-by-client lands on the report page"
                  : "Review & send from the Report Builder"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li key={row.key}>
                <Link
                  href={rowHref(projectId, row.href)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 active:bg-muted/50",
                    row.state === "danger" && "border-red-400/50 bg-red-500/5"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      row.state === "danger"
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-accent text-(--accent-ink)"
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">
                      {row.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.detail}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
