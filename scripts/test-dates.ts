/**
 * Unit tests for src/lib/dates.ts — run: pnpm exec tsx scripts/test-dates.ts
 * Plain asserts (no test framework in this repo); exits non-zero on failure.
 */
import {
  localDateString,
  isoWeekday,
  isWorkingDay,
  workingDatesBetween,
  siteDayIsOver,
  effectiveDiaryStatus,
  computeStreak,
} from "../src/lib/dates";

let failures = 0;
function eq<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  if (!ok) failures++;
}

// localDateString — the BST midnight trap (23:30 UTC on 3 Sep = 00:30 on 4 Sep in London)
eq(localDateString(new Date("2026-09-03T23:30:00Z"), "Europe/London"), "2026-09-04", "localDateString BST rollover");
eq(localDateString(new Date("2026-09-03T23:30:00Z"), "UTC"), "2026-09-03", "localDateString UTC same instant");
// Winter (GMT): 23:30 UTC stays 3 Dec in London
eq(localDateString(new Date("2026-12-03T23:30:00Z"), "Europe/London"), "2026-12-03", "localDateString GMT winter");
// DST spring-forward day (29 Mar 2026): still resolves cleanly
eq(localDateString(new Date("2026-03-29T00:59:00Z"), "Europe/London"), "2026-03-29", "localDateString DST day");

// isoWeekday
eq(isoWeekday("2026-09-04"), 5, "isoWeekday Friday");
eq(isoWeekday("2026-09-06"), 7, "isoWeekday Sunday");
eq(isoWeekday("2026-09-07"), 1, "isoWeekday Monday");

// isWorkingDay
eq(isWorkingDay("2026-09-05"), false, "Sat not working by default");
eq(isWorkingDay("2026-09-05", [1, 2, 3, 4, 5, 6]), true, "Sat working on 6-day week");
eq(isWorkingDay("2026-09-06", [1, 2, 3, 4, 5, 6, 7]), true, "Sun working on 7-day week");

// workingDatesBetween — Mon 31 Aug .. Sun 6 Sep, default = 5 weekdays
eq(
  workingDatesBetween("2026-08-31", "2026-09-06"),
  ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
  "workingDatesBetween default week"
);
eq(workingDatesBetween("2026-09-05", "2026-09-06"), [], "workingDatesBetween weekend-only empty");

// siteDayIsOver
const at0030LondonSep4 = new Date("2026-09-03T23:30:00Z");
eq(siteDayIsOver("2026-09-03", "Europe/London", at0030LondonSep4), true, "siteDayIsOver: 3 Sep over at 00:30 on 4th");
eq(siteDayIsOver("2026-09-04", "Europe/London", at0030LondonSep4), false, "siteDayIsOver: 4 Sep not over");
eq(siteDayIsOver("2026-09-03", "UTC", at0030LondonSep4), false, "siteDayIsOver: UTC still 3 Sep");

// effectiveDiaryStatus
const now = new Date("2026-09-04T12:00:00Z");
eq(effectiveDiaryStatus(null, "2026-09-04", "Europe/London", undefined, now), "pending", "status: today no entry");
eq(effectiveDiaryStatus(null, "2026-09-03", "Europe/London", undefined, now), "not_filled", "status: yesterday no entry");
eq(effectiveDiaryStatus(null, "2026-09-06", "Europe/London", undefined, now), "none", "status: Sunday none");
eq(effectiveDiaryStatus({ status: "draft" }, "2026-09-04", "Europe/London", undefined, now), "draft", "status: today draft");
eq(effectiveDiaryStatus({ status: "draft" }, "2026-09-03", "Europe/London", undefined, now), "not_filled", "status: stale draft derives not_filled");
eq(effectiveDiaryStatus({ status: "locked", late: false }, "2026-09-03", "Europe/London", undefined, now), "locked", "status: locked");
eq(effectiveDiaryStatus({ status: "locked", late: true }, "2026-09-03", "Europe/London", undefined, now), "locked_late", "status: locked late");
eq(effectiveDiaryStatus({ status: "not_filled" }, "2026-09-03", "Europe/London", undefined, now), "not_filled", "status: materialised not_filled");

// computeStreak — Fri 4 Sep today; Mon-Thu locked, today not yet done -> 4
const locked = new Set(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]);
eq(computeStreak(locked, "2026-09-04"), 4, "streak: 4 through Thu, today pending doesn't break");
// today locked too -> 5
eq(computeStreak(new Set([...locked, "2026-09-04"]), "2026-09-04"), 5, "streak: 5 incl today");
// gap on Wed breaks at Thu
eq(computeStreak(new Set(["2026-08-31", "2026-09-01", "2026-09-03"]), "2026-09-04"), 1, "streak: Wed gap breaks");
// weekend never breaks: locked Fri 28 Aug + Mon 31 Aug .. Thu, weekend skipped
eq(
  computeStreak(new Set(["2026-08-28", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]), "2026-09-04"),
  5,
  "streak: weekend skipped, Fri counts"
);
// 6-day week: Sat missing breaks
eq(
  computeStreak(new Set(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]), "2026-09-04", [1, 2, 3, 4, 5, 6]),
  4,
  "streak: 6-day week, prior Sat missing bounds the run"
);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll dates.ts tests passed");
