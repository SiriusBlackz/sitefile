/**
 * Report section recipes — which pages a generated report includes.
 *
 * Cover and Executive Summary are always present (a report without them
 * isn't a report), so they are not listed here. Everything else defaults
 * from the project's reporting frequency: short-cycle reports (weekly /
 * fortnightly) get a lean pack modelled on real weekly site reports —
 * summary, programme, lookahead, photos, sign-off — while monthly /
 * quarterly reports get the full evidence pack. The generate dialog
 * pre-ticks these defaults and any section can be toggled per run; there
 * are no saved custom templates.
 */

export const REPORT_SECTION_KEYS = [
  "toc",
  "keyIssues",
  "keyDates",
  "timeline",
  "lookahead",
  "photoMap",
  "siteDiary",
  "gallery",
  "beforeAfter",
  "verification",
  "signOff",
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export type ReportSections = Record<ReportSectionKey, boolean>;

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  toc: "Table of Contents",
  keyIssues: "Key Issues & Early Warnings",
  keyDates: "Key Dates & Milestones",
  timeline: "Programme Timeline",
  lookahead: "Lookahead — Next Period",
  photoMap: "Photo Location Map",
  siteDiary: "Site Diary Summary",
  gallery: "Progress Records",
  beforeAfter: "Before & After Comparison",
  verification: "Verification & Data Integrity",
  signOff: "Sign-Off",
};

const FULL_RECIPE: ReportSections = {
  toc: true,
  keyIssues: true,
  keyDates: true,
  timeline: true,
  lookahead: true,
  photoMap: true,
  siteDiary: true,
  gallery: true,
  beforeAfter: true,
  verification: true,
  signOff: true,
};

const SHORT_CYCLE_RECIPE: ReportSections = {
  ...FULL_RECIPE,
  toc: false,
  beforeAfter: false,
  verification: false,
};

export function defaultSectionsForFrequency(
  frequency: string | null | undefined
): ReportSections {
  return frequency === "weekly" || frequency === "fortnightly"
    ? { ...SHORT_CYCLE_RECIPE }
    : { ...FULL_RECIPE };
}

/** Recipe defaults overlaid with any per-run toggles. */
export function resolveSections(
  frequency: string | null | undefined,
  overrides?: Partial<ReportSections> | null
): ReportSections {
  return { ...defaultSectionsForFrequency(frequency), ...overrides };
}
