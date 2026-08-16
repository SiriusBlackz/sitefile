import type { ReportSections } from "@/lib/report-sections";

/**
 * The standing draft's payload — the PM's pre-generate state, persisted
 * server-side (report_drafts.payload) so desk approvals show on the
 * phone home. All fields optional; merge-patched by report.saveDraft.
 */
export interface ReportDraftPayload {
  narrative?: string[];
  narrativeApprovedAt?: string | null;
  keyIssues?: string[];
  issuesSignedOffAt?: string | null;
  keyRisks?: string[];
  signature?: {
    name: string;
    title?: string;
    imageDataUrl?: string;
  } | null;
  signedAt?: string | null;
  sections?: Partial<ReportSections>;
  coverEvidenceId?: string | null;
  healthSafety?: {
    accidents: number;
    nearMisses: number;
    riddor: number;
    toolboxTalks: number;
    inductions: number;
    note?: string;
  } | null;
}

/** The three approval states the readiness engine cares about. */
export interface DraftStates {
  narrativeApprovedAt: string | null;
  issuesSignedOffAt: string | null;
  signedAt: string | null;
}

export function draftStates(
  payload: ReportDraftPayload | null | undefined
): DraftStates {
  return {
    narrativeApprovedAt: payload?.narrativeApprovedAt ?? null,
    issuesSignedOffAt: payload?.issuesSignedOffAt ?? null,
    signedAt: payload?.signedAt ?? null,
  };
}
