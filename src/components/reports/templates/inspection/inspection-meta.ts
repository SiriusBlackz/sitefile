import type { ReportMeta } from "../report-shell";

/** Progress ReportMeta plus the inspection-specific cover facts. */
export interface InspectionMeta extends ReportMeta {
  reportTitle: string;
  stageLabel: string;
  kindLabel: string;
  kind: "inspection_record" | "register_status" | "closeout";
  visitDate: string;
  revision: number;
  /** Re-issue: the report this revision replaces. */
  supersedes: { reportNumber: number; revision: number; issuedAt: string | null } | null;
  contractFormLabel: string | null;
  /** Project default defect correction period, printed with the contract dates. */
  defaultCorrectionPeriodDays: number | null;
  /** Name of the person who generated the report. */
  preparedBy: string;
  /** Intended recipients, one per line in the dialog. */
  distribution: string[];
  /** Each date prints with its confirmed / not confirmed flag. */
  contractDates: {
    completion: string | null;
    defectsDate: string | null;
    completionConfirmed: boolean;
    defectsConfirmed: boolean;
  };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "not recorded";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  ready_for_review: "Ready for review",
  verified_closed: "Verified closed",
  reopened: "Reopened",
  accepted_as_is: "Accepted as-is",
  void: "Void",
};

export const STATUS_BADGE: Record<string, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  ready_for_review: "badge-blue",
  verified_closed: "badge-green",
  reopened: "badge-red",
  accepted_as_is: "badge-gray",
  void: "badge-gray",
};

export const TYPE_LABEL: Record<string, string> = {
  defect: "Defect",
  snag: "Snag",
  outstanding_work: "Outstanding work",
  observation: "Observation",
};
