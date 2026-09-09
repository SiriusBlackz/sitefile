"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { CLOSED_STATUSES } from "@/lib/inspection-transitions";
import { CalendarClock } from "lucide-react";

const SOON_DAYS = 7;

/**
 * Items past or within a week of their contractual correction date — the
 * in-app nudge (gate B6). The daily sweep emails the same list when a
 * Resend key is configured; this panel is what everyone sees regardless.
 */
export function DueItemsPanel({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const { data: items = [] } = trpc.inspection.list.useQuery({ projectId });
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + SOON_DAYS * 86400000).toISOString().slice(0, 10);
  const due = items
    .filter((it) => it.correctionDue && !CLOSED_STATUSES.has(it.status) && it.correctionDue <= horizon)
    .sort((a, b) => (a.correctionDue ?? "").localeCompare(b.correctionDue ?? ""));
  if (due.length === 0) return null;
  const overdue = due.filter((it) => (it.correctionDue ?? "") < today).length;
  return (
    <div className={cn("rounded-xl border p-3", overdue > 0 ? "border-red-300 bg-red-50/60" : "border-amber-300 bg-amber-50/60")}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <CalendarClock className="h-4 w-4" />
        {overdue > 0 ? `${overdue} past the correction date` : ""}
        {overdue > 0 && due.length > overdue ? " · " : ""}
        {due.length > overdue ? `${due.length - overdue} due within ${SOON_DAYS} days` : ""}
      </div>
      <ul className="space-y-1">
        {due.slice(0, compact ? 4 : 12).map((it) => {
          const late = (it.correctionDue ?? "") < today;
          return (
            <li key={it.id} className="flex items-center gap-2 text-xs">
              <Link href={compact ? `/inspect/${it.id}?projectId=${projectId}` : `/projects/${projectId}/inspection?item=${it.id}`} className="font-mono font-bold hover:underline">
                {it.ref}
              </Link>
              <span className="min-w-0 flex-1 truncate">{it.title}</span>
              <span className={cn("shrink-0 tabular-nums", late ? "font-semibold text-red-700" : "text-amber-800")}>
                {late ? "was due " : "due "}{formatDate(it.correctionDue!)}
              </span>
            </li>
          );
        })}
      </ul>
      {due.length > (compact ? 4 : 12) && <p className="mt-1 text-[11px] text-muted-foreground">and {due.length - (compact ? 4 : 12)} more on the register.</p>}
      <p className="mt-1.5 text-[10px] text-muted-foreground">Dates are computed from the notification date and the project correction period — confirm against the contract.</p>
    </div>
  );
}
