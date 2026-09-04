import type { HoldupCause } from "@/server/db/enums";

/** Human labels for hold-up causes — shared by phone UI, PM desk and the
 * report generator (server-safe: no client directives here). */
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
