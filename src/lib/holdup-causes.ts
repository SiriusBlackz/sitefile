import type { HoldupCause } from "@/server/db/enums";

/** Human labels for hold-up causes — shared by phone UI, PM desk and the
 * report generator (server-safe: no client directives here). */
/** Foreman-facing labels for amendable diary fields (no camelCase leaks). */
export const DIARY_FIELD_LABELS: Record<string, string> = {
  workNote: "Work note",
  visitorsCount: "Visitors",
  inspectionsCount: "Inspections",
  toolboxTalk: "Toolbox talk",
  toolboxTopic: "Toolbox topic",
  incidentsCount: "Incidents",
  safetyNote: "Safety note",
  correction: "Correction",
};

export function diaryFieldLabel(field: string): string {
  return DIARY_FIELD_LABELS[field] ?? field;
}

export const HOLDUP_CAUSE_LABELS: Record<HoldupCause, string> = {
  weather: "Weather",
  awaiting_information: "Awaiting info",
  no_access: "No access",
  labour_shortage: "Labour short",
  materials_delay: "Materials late",
  plant_breakdown: "Plant down",
  design_change: "Design change",
  rework: "Rework",
  other: "Other",
};
