/**
 * Reporting-cadence date arithmetic (YYYY-MM-DD strings, UTC).
 * The due date drives the countdown chip and the gap list, and is
 * advanced one step each time a report is generated.
 */

export function addReportingPeriod(
  dateStr: string,
  frequency: string | null | undefined
): string {
  const d = new Date(dateStr + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    default:
      // monthly
      d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Whole days from today (UTC date) to the given date; negative = overdue. */
export function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const target = new Date(dateStr + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
