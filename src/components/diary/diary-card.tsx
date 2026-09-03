"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { HoldupSheet } from "@/components/diary/holdup-sheet";
import { BookOpen, Check, ChevronRight, OctagonAlert } from "lucide-react";

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Phone-home diary habit card: streak strip, the 90-second promise, a
 * state-aware CTA — plus the all-day "Log a hold-up" quick action.
 */
export function DiaryCard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const localDate = useMemo(() => todayLocal(), []);
  const [holdupOpen, setHoldupOpen] = useState(false);

  const { data: week } = trpc.diary.myWeek.useQuery({ projectId, localDate });

  if (!week) {
    return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  }

  const today = week.todayStatus;
  const strip = week.last7.slice(-5);
  const locked = today === "locked" || today === "locked_late";
  const restDay = today === "none";

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => router.push(`/diary?projectId=${projectId}`)}
        disabled={restDay}
        className={cn(
          "w-full rounded-2xl border p-3 text-left active:bg-muted/50",
          locked
            ? "border-green-500/40 bg-green-500/10"
            : restDay
              ? "border-dashed opacity-70"
              : "border-primary/40 bg-accent"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              locked
                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                : "bg-primary/15 text-(--accent-ink)"
            )}
          >
            {locked ? <Check className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">
              {locked
                ? `Today's diary locked${today === "locked_late" ? " †" : ""}`
                : restDay
                  ? "No diary needed today"
                  : today === "draft"
                    ? "Finish today's diary"
                    : "Fill today's diary"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {locked
                ? week.streak > 1
                  ? `${week.streak} working days straight`
                  : "On the record"
                : restDay
                  ? "Rest day on this site's calendar"
                  : "About 90 seconds — most of it is already filled in"}
            </span>
          </span>
          {!restDay && (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>

        {/* Streak strip — same idiom as the photo week tracker. */}
        <div className="mt-2 grid grid-cols-5 gap-1" aria-label="Diary this week">
          {strip.map((d) => {
            const isToday = d.date === localDate;
            const done = d.status === "locked" || d.status === "locked_late";
            const missed = d.status === "not_filled";
            return (
              <div
                key={d.date}
                className={cn(
                  "rounded-md border px-1 py-0.5 text-center",
                  isToday
                    ? "border-primary/60"
                    : done
                      ? "border-green-500/40 bg-green-500/10"
                      : missed
                        ? "border-dashed border-red-400/60"
                        : "border-border opacity-60"
                )}
              >
                <span className="block text-[9px] text-muted-foreground">
                  {new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </span>
                <span
                  className={cn(
                    "block font-mono text-[10px] font-bold",
                    done
                      ? "text-green-700 dark:text-green-400"
                      : missed
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}
                >
                  {done ? "✓" : missed ? "—" : "·"}
                </span>
              </div>
            );
          })}
        </div>
      </button>

      <button
        onClick={() => setHoldupOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold active:bg-muted"
      >
        <OctagonAlert className="h-4 w-4 text-(--accent-ink)" />
        Log a hold-up
        <span className="font-mono text-[10px] text-muted-foreground">10 SEC</span>
      </button>

      <HoldupSheet
        projectId={projectId}
        localDate={localDate}
        open={holdupOpen}
        onOpenChange={setHoldupOpen}
      />
    </div>
  );
}
