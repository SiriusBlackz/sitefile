"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GanttTask {
  id: string;
  name: string;
  parentTaskId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPct: number | null;
  status: string | null;
  depth: number;
}

interface EvidenceMarker {
  taskId: string;
  date: string; // ISO date
  count: number;
}

interface GanttChartProps {
  tasks: GanttTask[];
  evidenceMarkers: EvidenceMarker[];
}

// ─── Status helpers ─────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: "Not Started", color: "#94a3b8", bg: "bg-slate-200 dark:bg-slate-700" },
  in_progress: { label: "In Progress", color: "#3b82f6", bg: "bg-blue-500" },
  completed: { label: "Completed", color: "#10b981", bg: "bg-emerald-500" },
  delayed: { label: "Delayed", color: "#ef4444", bg: "bg-red-500" },
};

// ─── Zoom levels ────────────────────────────────────────────────────────────

type ZoomLevel = "months" | "weeks" | "days";
const ZOOM_LEVELS: ZoomLevel[] = ["months", "weeks", "days"];
const DAY_WIDTHS: Record<ZoomLevel, number> = { months: 3, weeks: 8, days: 24 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(d: string): Date {
  return new Date(d + "T00:00:00");
}

// Local-time ISO date (YYYY-MM-DD). Never use toISOString() for date-only
// values here: it converts to UTC, so during BST a local midnight becomes
// 23:00 the previous day and every gridline/label drifts one day off the bars.
function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// Minimum horizontal room per header label before we start skipping days —
// "28 Jul" at 10px needs ~40px, plus breathing space so labels never touch.
const MIN_LABEL_PX = 48;

// ─── Component ──────────────────────────────────────────────────────────────

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;
const LABEL_WIDTH = 240;

export function GanttChart({ tasks, evidenceMarkers }: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("weeks");

  // Build evidence lookup: taskId -> dates with counts
  const evidenceByTask = useMemo(() => {
    const map = new Map<string, EvidenceMarker[]>();
    for (const m of evidenceMarkers) {
      const list = map.get(m.taskId) ?? [];
      list.push(m);
      map.set(m.taskId, list);
    }
    return map;
  }, [evidenceMarkers]);

  // Calculate timeline bounds from task dates
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const allDates: string[] = [];
    for (const t of tasks) {
      if (t.plannedStart) allDates.push(t.plannedStart);
      if (t.plannedEnd) allDates.push(t.plannedEnd);
      if (t.actualStart) allDates.push(t.actualStart);
      if (t.actualEnd) allDates.push(t.actualEnd);
    }
    for (const m of evidenceMarkers) {
      allDates.push(m.date);
    }

    if (allDates.length === 0) {
      const today = toIsoLocal(new Date());
      return { timelineStart: today, timelineEnd: today, totalDays: 30 };
    }

    // Add 7-day padding on each side
    const minDate = allDates.reduce((a, b) => (a < b ? a : b));
    const maxDate = allDates.reduce((a, b) => (a > b ? a : b));
    const padStart = new Date(parseDate(minDate));
    padStart.setDate(padStart.getDate() - 7);
    const padEnd = new Date(parseDate(maxDate));
    padEnd.setDate(padEnd.getDate() + 7);

    const startIso = toIsoLocal(padStart);
    const endIso = toIsoLocal(padEnd);
    return {
      timelineStart: startIso,
      timelineEnd: endIso,
      totalDays: daysBetween(padStart, padEnd),
    };
  }, [tasks, evidenceMarkers]);

  const dayWidth = DAY_WIDTHS[zoom];
  const chartWidth = totalDays * dayWidth;

  const dateToPx = useCallback((date: string): number => {
    const days = daysBetween(parseDate(timelineStart), parseDate(date));
    return days * dayWidth;
  }, [timelineStart, dayWidth]);

  // Generate header markers. Positions come straight from the cursor Date
  // via daysBetween — same local-midnight arithmetic the bars use — so
  // gridlines/labels can never drift a day off the bars across BST.
  const headerMarkers = useMemo(() => {
    const markers: { label: string; px: number }[] = [];
    const start = parseDate(timelineStart);
    const end = parseDate(timelineEnd);
    const pxFor = (d: Date) => daysBetween(start, d) * dayWidth;

    if (zoom === "days") {
      // Thin labels at high density: skip days so adjacent labels always
      // get at least MIN_LABEL_PX of room and stay legible.
      const step = Math.max(1, Math.ceil(MIN_LABEL_PX / dayWidth));
      const cursor = new Date(start);
      while (cursor <= end) {
        markers.push({
          label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          px: pxFor(cursor),
        });
        cursor.setDate(cursor.getDate() + step);
      }
    } else if (zoom === "weeks") {
      const cursor = new Date(start);
      // Snap to Monday
      const day = cursor.getDay();
      cursor.setDate(cursor.getDate() + ((8 - day) % 7));
      while (cursor <= end) {
        markers.push({
          label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          px: pxFor(cursor),
        });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(start);
      cursor.setDate(1);
      if (cursor < start) cursor.setMonth(cursor.getMonth() + 1);
      while (cursor <= end) {
        markers.push({
          label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
          px: pxFor(cursor),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return markers;
  }, [timelineStart, timelineEnd, zoom, dayWidth]);

  // Today line
  const todayIso = toIsoLocal(new Date());
  const todayPx = dateToPx(todayIso);
  const showToday = todayPx >= 0 && todayPx <= chartWidth;

  const zoomIdx = ZOOM_LEVELS.indexOf(zoom);

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No tasks with dates. Add planned start/end dates to see the Gantt chart.
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(ZOOM_LEVELS[zoomIdx - 1])}
              disabled={zoomIdx === 0}
            >
              <ZoomOut className="mr-1 h-3.5 w-3.5" />
              Out
            </Button>
            <span className="px-2 text-xs text-muted-foreground capitalize">{zoom}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(ZOOM_LEVELS[zoomIdx + 1])}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            >
              <ZoomIn className="mr-1 h-3.5 w-3.5" />
              In
            </Button>
          </div>
          {/* Legend — progress fill takes the bar's status colour */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-blue-200 border border-blue-300 dark:bg-blue-900 dark:border-blue-700" />
              Planned
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-blue-500" />
              In Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-emerald-500" />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-red-500" />
              Delayed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              Evidence
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-0.5 bg-red-500" />
              Today
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex">
            {/* ─── Left: task labels ─── */}
            <div
              className="shrink-0 border-r bg-muted/30"
              style={{ width: LABEL_WIDTH }}
            >
              {/* Header */}
              <div
                className="flex items-center border-b px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                style={{ height: HEADER_HEIGHT }}
              >
                Task
              </div>
              {/* Rows */}
              {tasks.map((task) => {
                const status = statusConfig[task.status ?? "not_started"];
                const hasBar = task.plannedStart && task.plannedEnd;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-1.5 border-b px-3 text-sm truncate",
                      !hasBar && "text-muted-foreground"
                    )}
                    style={{
                      height: ROW_HEIGHT,
                      paddingLeft: 12 + task.depth * 16,
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: status.color }}
                    />
                    <span className="truncate">{task.name}</span>
                  </div>
                );
              })}
            </div>

            {/* ─── Right: scrollable chart area ─── */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto">
              <div style={{ width: chartWidth, minWidth: "100%" }} className="relative">
                {/* Header with time markers */}
                <div
                  className="border-b bg-muted/30 relative"
                  style={{ height: HEADER_HEIGHT }}
                >
                  {headerMarkers.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-end pb-1.5 text-[10px] text-muted-foreground font-medium"
                      style={{ left: m.px }}
                    >
                      <span className="pl-1">{m.label}</span>
                    </div>
                  ))}
                </div>

                {/* Gridlines */}
                {headerMarkers.map((m, i) => (
                  <div
                    key={`grid-${i}`}
                    className="absolute border-l border-border/40"
                    style={{
                      left: m.px,
                      top: HEADER_HEIGHT,
                      bottom: 0,
                      height: tasks.length * ROW_HEIGHT,
                    }}
                  />
                ))}

                {/* Today line */}
                {showToday && (
                  <div
                    className="absolute w-0.5 bg-red-500/60 z-10"
                    style={{
                      left: todayPx,
                      top: HEADER_HEIGHT,
                      height: tasks.length * ROW_HEIGHT,
                    }}
                  />
                )}

                {/* Task rows */}
                {tasks.map((task, idx) => {
                  const top = HEADER_HEIGHT + idx * ROW_HEIGHT;
                  const status = statusConfig[task.status ?? "not_started"];
                  const progress = task.progressPct ?? 0;
                  const markers = evidenceByTask.get(task.id) ?? [];

                  const hasBars = task.plannedStart && task.plannedEnd;
                  const barLeft = hasBars ? dateToPx(task.plannedStart!) : 0;
                  const barWidth = hasBars
                    ? Math.max(dateToPx(task.plannedEnd!) - barLeft, dayWidth)
                    : 0;

                  return (
                    <div key={task.id}>
                      {/* Row background */}
                      <div
                        className={cn(
                          "absolute left-0 right-0 border-b",
                          idx % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                        )}
                        style={{ top, height: ROW_HEIGHT, width: chartWidth }}
                      />

                      {/* Planned bar */}
                      {hasBars && (
                        <Tooltip>
                          <TooltipTrigger
                            className="absolute rounded-[4px] bg-blue-200 border border-blue-300 dark:bg-blue-900/60 dark:border-blue-700 z-[1] cursor-default overflow-hidden"
                            style={{
                              left: barLeft,
                              top: top + 8,
                              width: barWidth,
                              height: ROW_HEIGHT - 16,
                            }}
                          >
                            {/* Progress fill */}
                            {progress > 0 && (
                              <div
                                className="h-full rounded-l-[3px]"
                                style={{
                                  width: `${Math.min(progress, 100)}%`,
                                  background: status.color,
                                  opacity: 0.85,
                                  borderRadius: progress >= 100 ? "3px" : "3px 0 0 3px",
                                }}
                              />
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="font-medium">{task.name}</div>
                            <div className="text-muted-foreground">
                              {formatDate(task.plannedStart!)} — {formatDate(task.plannedEnd!)}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {status.label}
                              </Badge>
                              <span>{progress}%</span>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Evidence markers */}
                      {markers.map((m, mi) => {
                        const px = dateToPx(m.date);
                        return (
                          <Tooltip key={mi}>
                            <TooltipTrigger
                              className="absolute z-[3] h-3 w-3 rounded-full bg-amber-500 border-2 border-white dark:border-zinc-900 cursor-default"
                              style={{
                                left: px - 6,
                                top: top + 4,
                              }}
                            />
                            <TooltipContent side="top" className="text-xs">
                              {m.count} evidence item{m.count > 1 ? "s" : ""} on{" "}
                              {formatDate(m.date)}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
