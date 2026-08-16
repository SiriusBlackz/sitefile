import { daysUntil } from "@/lib/reporting-cadence";
import type { DraftStates } from "@/lib/report-draft";

/**
 * The one readiness engine. Phone home gap list, desk report builder,
 * both readiness rings, portfolio cards and desknav dots all derive
 * from these pure functions — one source of truth, no drift.
 */

export interface GapSnapshot {
  /** False while the org still carries its sign-up placeholder name —
   * reports suppress the name entirely until it's set. */
  brandingSet: boolean;
  nextReportDue: string | null;
  reportingFrequency: string | null;
  lastReportNumber: number | null;
  periodStart: string;
  taskCount: number;
  /** Latest programmed date across all tasks — before periodStart means
   * the imported programme is fully elapsed. */
  programmeLastDate: string | null;
  photosThisPeriod: number;
  unlinked: number;
  uncaptioned: number;
  /** In-period photos with no embedded capture timestamp (dated by upload). */
  noCaptureTime: number;
  programmeConfirmedThisPeriod: boolean;
  zoneCount: number;
  zeroPhotoTasks: { id: string; name: string; progressPct: number }[];
  /** Tasks still marked not-started that have photos this period. */
  misStatusTasks: { id: string; name: string; photoCount: number }[];
  photosByDay: { date: string; count: number }[];
  lastReport: {
    id: string;
    number: number;
    status: string | null;
    sentAt: string | null;
    openedAt: string | null;
  } | null;
  draft: DraftStates | null;
}

export type RowState = "danger" | "open" | "done" | "waiting";

export interface ReadinessRow {
  key: string;
  label: string;
  detail: string;
  state: RowState;
  /** Project-relative href of the screen that fixes it ("" = overview).
   * A leading "@" marks an app-absolute path (e.g. "@/account") —
   * resolve with rowHref(), not string concatenation. */
  href: string;
}

/** Resolves a row's href — project-relative by default, app-absolute
 * when prefixed with "@" (org-level fixes like the Account page). */
export function rowHref(projectId: string, href: string): string {
  return href.startsWith("@") ? href.slice(1) : `/projects/${projectId}${href}`;
}

/** True when every programmed date sits before the current period —
 * an imported programme that has fully elapsed prints every milestone
 * as overdue and turns the lookahead into carried-over noise. */
export function programmeElapsed(gaps: GapSnapshot): boolean {
  return (
    gaps.taskCount > 0 &&
    gaps.programmeLastDate != null &&
    gaps.programmeLastDate < gaps.periodStart
  );
}

/** The desk builder's 11-row section recipe, in prototype order. */
export function buildRecipeRows(gaps: GapSnapshot): ReadinessRow[] {
  const d = gaps.draft;
  const programmeReady = gaps.taskCount > 0;
  const elapsed = programmeElapsed(gaps);
  const rows: ReadinessRow[] = [
    {
      key: "cover",
      label: "Cover — hero photo & branding",
      detail: gaps.brandingSet
        ? "Always included"
        : "Your company name is still the sign-up placeholder — set it on the Account page or the cover prints without one",
      state: gaps.brandingSet ? "done" : "open",
      href: gaps.brandingSet ? "/reports" : "@/account",
    },
    {
      key: "narrative",
      label: "Executive summary",
      detail: d?.narrativeApprovedAt
        ? "AI draft approved by you — weather and deltas auto-filled"
        : "AI draft from the period's links — tap to read & approve",
      state: d?.narrativeApprovedAt ? "done" : "open",
      href: "/reports",
    },
    {
      key: "issues",
      label: "Key issues & early warnings",
      detail: d?.issuesSignedOffAt
        ? "Signed off by you — included"
        : "Suggested from the programme — tap to sign off",
      state: d?.issuesSignedOffAt ? "done" : "open",
      href: "/reports",
    },
    {
      key: "milestones",
      label: "Milestones & key dates",
      detail: elapsed
        ? "Programme fully elapsed — every milestone will print as overdue. Re-import the current revision"
        : programmeReady
          ? "Derived from the programme"
          : "Waiting for programme import",
      state: elapsed ? "danger" : programmeReady ? "done" : "waiting",
      href: "/tasks",
    },
    {
      key: "timeline",
      label: "Programme timeline",
      detail: elapsed
        ? "Every activity ends before this period — the Gantt reads as history, not progress"
        : programmeReady
          ? `${gaps.taskCount} activities, evidence-dotted`
          : "Waiting for programme import",
      state: elapsed ? "danger" : programmeReady ? "done" : "waiting",
      href: "/tasks",
    },
    {
      key: "lookahead",
      label: "Lookahead — next period",
      detail: elapsed
        ? "Nothing is programmed ahead — the lookahead would only list carried-over items"
        : programmeReady
          ? "Auto from the programme"
          : "Waiting for programme import",
      state: elapsed ? "danger" : programmeReady ? "done" : "waiting",
      href: "/tasks",
    },
    {
      key: "photomap",
      label: "Photo location map",
      detail:
        gaps.zoneCount > 0
          ? "Plotted from photo GPS and your zones"
          : "Waiting for zones — confirm the suggestions",
      state: gaps.zoneCount > 0 ? "done" : "waiting",
      href: "/zones",
    },
    {
      key: "gallery",
      label: "Evidence gallery",
      detail:
        gaps.photosThisPeriod === 0
          ? "No photos captured this period yet"
          : gaps.unlinked > 0
            ? `${gaps.unlinked} unlinked in the Yard — tap to triage`
            : "All photos attributed — nothing prints unattributed",
      state:
        gaps.photosThisPeriod === 0
          ? "danger"
          : gaps.unlinked > 0
            ? "open"
            : "done",
      href: "/evidence?view=yard",
    },
    {
      key: "beforeafter",
      label: "Before / after",
      detail:
        gaps.zeroPhotoTasks.length > 0
          ? `${gaps.zeroPhotoTasks[0].name} has 0 photos this period — tap to capture`
          : "Auto-pairs each task's earliest and latest photo — shoot the same spot over the period and the pair builds itself",
      state: gaps.zeroPhotoTasks.length > 0 ? "danger" : "done",
      href: "/evidence",
    },
    {
      key: "verification",
      label: "Verification",
      detail: "GPS, EXIF and no-GPS declarations — automatic",
      state: "done",
      href: "/reports",
    },
    {
      key: "signoff",
      label: "Sign-off",
      detail: d?.signedAt
        ? "Signed — today"
        : "Tap to sign — blocks send until signed",
      state: d?.signedAt ? "done" : "open",
      href: "/reports",
    },
  ];
  return rows;
}

export function readinessPct(gaps: GapSnapshot): number {
  const rows = buildRecipeRows(gaps);
  const done = rows.filter((r) => r.state === "done").length;
  return Math.round((done / rows.length) * 100);
}

/** The phone home's gap list — actionable rows only, in priority order. */
export function buildGapRows(gaps: GapSnapshot): ReadinessRow[] {
  const rows: ReadinessRow[] = [];
  if (!gaps.brandingSet) {
    rows.push({
      key: "branding",
      label: "Name your company",
      detail: "Reports print your name and logo on every page — 2 minutes on the Account page",
      state: "open",
      href: "@/account",
    });
  }
  if (!gaps.nextReportDue) {
    rows.push({
      key: "deadline",
      label: "Set your first report deadline",
      detail: "Question № 1 — everything hangs off this date",
      state: "open",
      href: "/settings",
    });
  }
  if (gaps.taskCount === 0) {
    rows.push({
      key: "programme",
      label: "Load the programme",
      detail: "Desk job, once — AI reads the PDF your planner issues",
      state: "open",
      href: "/tasks",
    });
  } else if (programmeElapsed(gaps)) {
    rows.push({
      key: "programme-elapsed",
      label: "Programme is out of date",
      detail: "Every activity ends before this period — re-import the current revision or the report prints all-overdue",
      state: "danger",
      href: "/tasks",
    });
  } else if (!gaps.programmeConfirmedThisPeriod && gaps.lastReportNumber != null) {
    rows.push({
      key: "programme-refresh",
      label: "Programme updated this period?",
      detail: "Re-import the latest revision, or confirm nothing changed",
      state: "open",
      href: "/tasks",
    });
  }
  if (gaps.taskCount > 0 && gaps.zoneCount === 0) {
    rows.push({
      key: "zones",
      label: "Confirm your zones",
      detail: "Proposed from photo clusters — taps, not cartography",
      state: "open",
      href: "/zones",
    });
  }
  for (const t of gaps.misStatusTasks.slice(0, 2)) {
    rows.push({
      key: `misstatus-${t.id}`,
      label: `${t.name}: photos linked but still "Not started"`,
      detail: `${t.photoCount} photo${t.photoCount === 1 ? "" : "s"} this period — update its status or the report prints the contradiction`,
      state: "open",
      href: "/tasks",
    });
  }
  for (const t of gaps.zeroPhotoTasks.slice(0, 2)) {
    rows.push({
      key: `zero-${t.id}`,
      label: `${t.name}: 0 photos this period`,
      detail: `${t.progressPct}% complete on paper — the report will say so unless evidence arrives`,
      state: "danger",
      href: "/evidence",
    });
  }
  if (gaps.unlinked > 0) {
    rows.push({
      key: "unlinked",
      label: `${gaps.unlinked} photo${gaps.unlinked === 1 ? "" : "s"} not linked to a task`,
      detail: "Batch suggestions ready — a ten-minute Yard session",
      state: "open",
      href: "/evidence?view=yard",
    });
  }
  if (gaps.uncaptioned > 0) {
    rows.push({
      key: "uncaptioned",
      label: `${gaps.uncaptioned} photo${gaps.uncaptioned === 1 ? "" : "s"} without a caption`,
      detail: "Captions become the photo titles in the report",
      state: "open",
      href: "/evidence",
    });
  }
  const d = gaps.draft;
  if (gaps.photosThisPeriod > 0 && !d?.narrativeApprovedAt) {
    rows.push({
      key: "narrative",
      label: "Review the AI narrative draft",
      detail: "Drafted from the period's evidence — a 2-minute read",
      state: "open",
      href: "/reports",
    });
  }
  if (gaps.photosThisPeriod > 0 && !d?.issuesSignedOffAt) {
    rows.push({
      key: "issues",
      label: "Sign off key issues / early warnings",
      detail: "Suggested from the programme — needs your judgement",
      state: "open",
      href: "/reports",
    });
  }
  if (gaps.photosThisPeriod > 0 && !d?.signedAt) {
    rows.push({
      key: "sign",
      label: "Sign the report",
      detail: "Blocks send until done",
      state: "open",
      href: "/reports",
    });
  }
  return rows;
}

export type DueChip =
  | { variant: "set-deadline"; label: string; mono: string }
  | { variant: "due"; label: string; mono: string; overdue: boolean; soon: boolean }
  | { variant: "sent"; label: string; mono: string };

export function dueChip(gaps: GapSnapshot): DueChip {
  const nextNumber = (gaps.lastReportNumber ?? 0) + 1;
  const last = gaps.lastReport;
  if (last && last.status === "completed" && last.sentAt) {
    return {
      variant: "sent",
      label: `Report № ${last.number} sent ✓`,
      mono: last.openedAt ? "OPENED BY CLIENT" : "AWAITING FIRST OPEN",
    };
  }
  if (!gaps.nextReportDue) {
    return {
      variant: "set-deadline",
      label: `Report № ${nextNumber}`,
      mono: "SET DEADLINE FIRST",
    };
  }
  const days = daysUntil(gaps.nextReportDue);
  const dateLabel = new Date(gaps.nextReportDue + "T00:00:00")
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();
  return {
    variant: "due",
    label: `Report № ${nextNumber}`,
    mono:
      days < 0
        ? `OVERDUE — WAS DUE ${dateLabel}`
        : days === 0
          ? "DUE TODAY"
          : `DUE ${dateLabel} · ${days} DAY${days === 1 ? "" : "S"}`,
    overdue: days < 0,
    soon: days >= 0 && days <= 7,
  };
}

/** Portfolio-card readiness — the subset of checks the portfolio query
 * carries (no captions/zones detail). Approximate by design; the project
 * pages use the full engine. */
export function portfolioPct(p: {
  taskCount: number;
  photosThisPeriod: number;
  unlinked: number;
  programmeConfirmedThisPeriod: boolean;
  draft: DraftStates | null;
}): number {
  const checks = [
    p.taskCount > 0,
    p.photosThisPeriod > 0,
    p.photosThisPeriod > 0 && p.unlinked === 0,
    p.programmeConfirmedThisPeriod,
    !!p.draft?.narrativeApprovedAt,
    !!p.draft?.issuesSignedOffAt,
    !!p.draft?.signedAt,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
