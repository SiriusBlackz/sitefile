/**
 * Shared display formatting: dates and enum labels. Use these instead of
 * rendering raw ISO strings or database enum values anywhere in the UI.
 */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight — append T00:00 to
  // keep them in local time so they never render as the previous day.
  const d =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "28 Jul 2026" — for date-only values (planned/actual dates, periods). */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : "—";
}

/** "28 Jul 2026, 14:05" — for timestamps (captured/uploaded/generated at). */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_TIME_FMT.format(d) : "—";
}

/** "1 Jun – 30 Oct 2026" (same-year compact) or full dates across years. */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return "—";
  if (s && e && s.getFullYear() === e.getFullYear()) {
    const startNoYear = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(s);
    return `${startNoYear} – ${DATE_FMT.format(e)}`;
  }
  return `${s ? DATE_FMT.format(s) : "?"} – ${e ? DATE_FMT.format(e) : "?"}`;
}

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  design_build: "Design & Build",
  traditional: "Traditional",
  management: "Management Contract",
  jct: "JCT",
  nec: "NEC",
  other: "Other",
};

export const REPORTING_FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  photo: "Photo",
  video: "Video",
};

/** Label for a stored enum value; falls back to Title Case, never raw. */
export function labelFor(
  map: Record<string, string>,
  value: string | null | undefined
): string {
  if (!value) return "—";
  return (
    map[value] ??
    value
      .split(/[_-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}
