/**
 * Readiness rows for the Defects Inspection and Closeout Report — the
 * inspection counterpart of src/lib/readiness.ts. Pure: takes the register
 * summary, the chosen visit, the standing draft and the project, returns
 * what still needs the PM's hand before the report is issued. Nothing
 * here blocks issue; every open row is a fact the report would otherwise
 * print as missing or unconfirmed.
 */

export type InspectionDraftPayload = {
  visitId?: string;
  stage?: "initial_walkthrough" | "interim_reinspection" | "end_of_defects_period";
  kind?: "inspection_record" | "register_status" | "closeout";
  supersedesReportId?: string | null;
  scopeNote?: string;
  methodLine?: string;
  weather?: string;
  attendees?: { name: string; org?: string; role?: string; authority?: string }[];
  notInspected?: { area: string; reason?: string; owner?: string; followUp?: string }[];
  /** PM declared there were no areas left uninspected. */
  notInspectedNone?: boolean;
  urgentConcerns?: string;
  /** PM decided the urgent-concerns line (text or explicit "none"). */
  urgentDecidedAt?: string;
  distribution?: string[];
  sections?: Record<string, boolean>;
  signature?: { name: string; title?: string };
  signedAt?: string;
};

export type InspectionReadinessState = "done" | "todo" | "danger" | "waiting";

export interface InspectionReadinessRow {
  key: string;
  label: string;
  detail: string;
  state: InspectionReadinessState;
  /** Where to fix it when it isn't an inline editor (relative to the project). */
  href?: string;
}

export interface InspectionReadinessInput {
  visit: {
    id: string;
    visitDate: string;
    stage: string;
    scopeNote: string | null;
    methodLine: string | null;
    weather: string | null;
    urgentConcerns: string | null;
    attendees: unknown;
    notInspected: unknown;
  } | null;
  draft: InspectionDraftPayload;
  summary: { total: number; withPhotos: number; readyForReview: number; overdue: number } | null;
  project: { contractDates: unknown } | null;
  kind: NonNullable<InspectionDraftPayload["kind"]>;
}

/** Draft wins over the visit's stored facts; the visit is the fallback. */
export function effectiveFacts(input: Pick<InspectionReadinessInput, "visit" | "draft">) {
  const { visit, draft } = input;
  const fromVisit = draft.visitId === visit?.id || !draft.visitId;
  const attendees =
    draft.attendees ??
    (fromVisit ? ((visit?.attendees as InspectionDraftPayload["attendees"]) ?? []) : []);
  const notInspected =
    draft.notInspected ??
    (fromVisit ? ((visit?.notInspected as InspectionDraftPayload["notInspected"]) ?? []) : []);
  return {
    scopeNote: draft.scopeNote ?? (fromVisit ? (visit?.scopeNote ?? "") : ""),
    methodLine: draft.methodLine ?? (fromVisit ? (visit?.methodLine ?? "") : ""),
    weather: draft.weather ?? (fromVisit ? (visit?.weather ?? "") : ""),
    urgentConcerns: draft.urgentConcerns ?? (fromVisit ? (visit?.urgentConcerns ?? "") : ""),
    attendees: attendees ?? [],
    notInspected: notInspected ?? [],
    distribution: draft.distribution ?? [],
  };
}

export function buildInspectionRows(input: InspectionReadinessInput): InspectionReadinessRow[] {
  const { visit, draft, summary, project, kind } = input;
  const f = effectiveFacts(input);
  const cd = (project?.contractDates ?? null) as
    | { completion?: string | null; defectsDate?: string | null; confirmed?: { completion?: boolean; defectsDate?: boolean } }
    | null;
  const total = summary?.total ?? 0;
  const withPhotos = summary?.withPhotos ?? 0;
  const noPhotos = Math.max(0, total - withPhotos);

  const rows: InspectionReadinessRow[] = [
    {
      key: "visit",
      label: "Visit",
      detail: visit ? `${visit.visitDate} · ${STAGE_LABEL[draft.stage ?? visit.stage] ?? visit.stage}` : "Record at least one item on the phone first",
      state: visit ? "done" : "waiting",
      href: visit ? undefined : "inspection",
    },
    {
      key: "scope",
      label: "Areas inspected",
      detail: f.scopeNote ? f.scopeNote.slice(0, 70) : "Prints as \"not stated\"",
      state: f.scopeNote ? "done" : "todo",
    },
    {
      key: "method",
      label: "Method and conditions",
      detail: f.methodLine ? f.methodLine.slice(0, 70) : "Prints as \"not stated\"",
      state: f.methodLine ? "done" : "todo",
    },
    {
      key: "attendees",
      label: "Attendees",
      detail: f.attendees.length ? `${f.attendees.length} listed` : "Who was on the walk, with decision authority",
      state: f.attendees.length ? "done" : "todo",
    },
    {
      key: "notInspected",
      label: "Areas not inspected declared",
      detail: f.notInspected.length
        ? `${f.notInspected.length} declared with reasons`
        : draft.notInspectedNone
          ? "None — everything in scope was reached"
          : "Declare what wasn't reached, or confirm none",
      state: f.notInspected.length || draft.notInspectedNone ? "done" : "todo",
    },
    {
      key: "photos",
      label: "Every item has a photo",
      detail:
        total === 0
          ? (kind === "inspection_record" ? "No items at this visit yet" : "No items on the register yet")
          : noPhotos === 0
            ? `${total} item${total === 1 ? "" : "s"}${kind === "inspection_record" ? " at this visit" : ""}, all with photos`
            : `${noPhotos} of ${total}${kind === "inspection_record" ? " at this visit" : ""} without a photo — they print as \"no photograph\"`,
      state: total === 0 ? "waiting" : noPhotos === 0 ? "done" : "danger",
      href: noPhotos > 0 ? "inspection" : undefined,
    },
  ];

  // Whole-register kinds print Ready-for-review items as still open.
  if (kind !== "inspection_record") {
    const ready = summary?.readyForReview ?? 0;
    rows.push({
      key: "review",
      label: "Items awaiting verification",
      detail: ready ? `${ready} marked Ready for review — verify or they print as open` : "None outstanding",
      state: ready ? "todo" : "done",
      href: ready ? "inspection?status=ready_for_review" : undefined,
    });
  }

  const datesOk = Boolean(cd?.confirmed?.completion && cd?.confirmed?.defectsDate);
  rows.push(
    {
      key: "contractDates",
      label: "Contract dates confirmed",
      detail: datesOk ? "Completion and defects date confirmed from the contract" : "Print as \"not confirmed\" until checked in Settings",
      state: datesOk ? "done" : "todo",
      href: datesOk ? undefined : "settings",
    },
    {
      key: "urgent",
      label: "Urgent concerns decided",
      detail: f.urgentConcerns
        ? f.urgentConcerns.slice(0, 70)
        : draft.urgentDecidedAt
          ? "None observed within scope"
          : "State any, or confirm none observed",
      state: f.urgentConcerns || draft.urgentDecidedAt ? "done" : "todo",
    },
    {
      key: "distribution",
      label: "Distribution",
      detail: f.distribution.length ? f.distribution.join("; ").slice(0, 70) : "Who receives this issue",
      state: f.distribution.length ? "done" : "todo",
    },
    {
      key: "signoff",
      label: "Inspector sign-off",
      detail: draft.signature?.name ? `Signed as ${draft.signature.name}` : "Your name against this issue",
      state: draft.signature?.name ? "done" : "todo",
    }
  );
  return rows;
}

export function inspectionReadinessPct(rows: InspectionReadinessRow[]): number {
  const counted = rows.filter((r) => r.state !== "waiting");
  if (counted.length === 0) return 0;
  return Math.round((counted.filter((r) => r.state === "done").length / counted.length) * 100);
}

const STAGE_LABEL: Record<string, string> = {
  initial_walkthrough: "Initial walkthrough",
  interim_reinspection: "Interim reinspection",
  end_of_defects_period: "End of defects period",
};
