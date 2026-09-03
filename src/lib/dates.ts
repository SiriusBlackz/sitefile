/**
 * Site-local date and working-day helpers for the Site Diary.
 *
 * Diary entry dates are ALWAYS the phone's client-supplied local date
 * (`YYYY-MM-DD`) — never re-derive them server-side, and never reuse the
 * UTC bucketing used for photosByDay. The project's IANA `timezone` exists
 * only to answer "is the site's day over yet" on the server (auto-lock
 * derivation and the cron sweep).
 *
 * Pure functions, shared client/server. Remember format.ts `toDate()`:
 * date-only strings must be parsed with an explicit time component or
 * they render a day early in negative-offset zones.
 */

export type WorkingDays = number[]; // ISO weekday numbers, 1=Mon .. 7=Sun

export const DEFAULT_WORKING_DAYS: WorkingDays = [1, 2, 3, 4, 5];

/** The local calendar date (YYYY-MM-DD) for `now` in an IANA timezone. */
export function localDateString(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** ISO weekday (1=Mon..7=Sun) for a YYYY-MM-DD date string. */
export function isoWeekday(dateStr: string): number {
  // Parse as UTC noon so the weekday is unambiguous in every zone.
  const d = new Date(`${dateStr}T12:00:00Z`);
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

export function isWorkingDay(
  dateStr: string,
  workingDays: WorkingDays = DEFAULT_WORKING_DAYS
): boolean {
  return workingDays.includes(isoWeekday(dateStr));
}

/** Working dates within [from, to] inclusive (both YYYY-MM-DD). */
export function workingDatesBetween(
  from: string,
  to: string,
  workingDays: WorkingDays = DEFAULT_WORKING_DAYS
): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`).getTime();
  const cur = new Date(`${from}T12:00:00Z`);
  while (cur.getTime() <= end) {
    const dateStr = cur.toISOString().slice(0, 10);
    if (isWorkingDay(dateStr, workingDays)) out.push(dateStr);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Has the site's local day for `dateStr` ended? True strictly after that
 * calendar date in the project timezone (the 23:59 boundary).
 */
export function siteDayIsOver(
  dateStr: string,
  timeZone: string,
  now: Date = new Date()
): boolean {
  return localDateString(now, timeZone) > dateStr;
}

export type EffectiveDiaryStatus =
  | "none" // not a working day / before member's time — nothing expected
  | "pending" // working day, still today, no locked entry yet
  | "draft" // draft exists, day not over
  | "locked"
  | "locked_late" // locked but flagged late
  | "not_filled"; // day over with no locked entry (derived or materialised)

/**
 * Derive-at-read lock semantics: the source of truth on previews and
 * everywhere the cron hasn't swept yet. `entry` is the row (or null).
 */
export function effectiveDiaryStatus(
  entry: { status: string; late?: boolean | null } | null | undefined,
  dateStr: string,
  timeZone: string,
  workingDays: WorkingDays = DEFAULT_WORKING_DAYS,
  now: Date = new Date()
): EffectiveDiaryStatus {
  const working = isWorkingDay(dateStr, workingDays);
  const over = siteDayIsOver(dateStr, timeZone, now);
  if (entry) {
    if (entry.status === "locked") return entry.late ? "locked_late" : "locked";
    if (entry.status === "not_filled") return "not_filled";
    // draft
    return over ? "not_filled" : "draft";
  }
  if (!working) return "none";
  return over ? "not_filled" : "pending";
}

/**
 * Consecutive-working-day streak ending at `today` (site-local date).
 * `lockedDates` = set of YYYY-MM-DD dates with a locked entry. Today
 * counts when locked; an unlocked today doesn't break yesterday's run.
 */
export function computeStreak(
  lockedDates: Set<string>,
  today: string,
  workingDays: WorkingDays = DEFAULT_WORKING_DAYS
): number {
  let streak = 0;
  const cur = new Date(`${today}T12:00:00Z`);
  let first = true;
  for (let i = 0; i < 366; i++) {
    const dateStr = cur.toISOString().slice(0, 10);
    if (isWorkingDay(dateStr, workingDays)) {
      if (lockedDates.has(dateStr)) {
        streak++;
      } else if (first && dateStr === today) {
        // today simply not done yet — look further back
      } else {
        break;
      }
      first = false;
    }
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return streak;
}
