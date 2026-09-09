/**
 * Location fields per project location scheme — shared by the phone
 * record screen, the desk register and the report. A written description
 * is always required; GPS is only ever supplementary.
 */
export type LocationFields = {
  description: string;
  block?: string;
  level?: string;
  room?: string;
  element?: string;
  alignment?: string;
  chainage?: string;
  side?: string;
  offset?: string;
  grid?: string;
};

export const SCHEME_FIELDS: Record<
  string,
  { key: keyof LocationFields; label: string; placeholder: string; options?: string[] }[]
> = {
  linear: [
    { key: "alignment", label: "Route / alignment", placeholder: "e.g. Access Road" },
    { key: "chainage", label: "Chainage", placeholder: "e.g. 0+245" },
    { key: "side", label: "Side", placeholder: "L", options: ["L", "R", "NS", "OS", "C"] },
    { key: "offset", label: "Offset", placeholder: "e.g. 1.5 m verge" },
  ],
  building: [
    { key: "block", label: "Block / building", placeholder: "e.g. Block B" },
    { key: "level", label: "Level", placeholder: "e.g. L2" },
    { key: "room", label: "Room / space", placeholder: "e.g. 2.14 Plant" },
    { key: "element", label: "Element", placeholder: "e.g. Ceiling" },
  ],
  grid: [{ key: "grid", label: "Grid reference", placeholder: "e.g. C/4" }],
};

export function locationLine(scheme: string | null | undefined, loc: LocationFields): string {
  const f = SCHEME_FIELDS[scheme ?? ""] ?? [];
  const parts = f.map((x) => loc[x.key]).filter(Boolean);
  return parts.length ? `${parts.join(" · ")} — ${loc.description}` : loc.description;
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  defect: "Defect",
  snag: "Snag",
  outstanding_work: "Outstanding work",
  observation: "Observation",
};

export const ITEM_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  ready_for_review: "Ready for review",
  verified_closed: "Verified closed",
  reopened: "Reopened",
  accepted_as_is: "Accepted as-is",
  void: "Void",
};

export const STAGE_LABELS: Record<string, string> = {
  initial_walkthrough: "Initial walkthrough",
  interim_reinspection: "Interim reinspection",
  end_of_defects_period: "End of defects period",
};
