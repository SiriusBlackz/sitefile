/**
 * Section recipe for the Defects Inspection and Closeout Report. Kept
 * separate from REPORT_SECTION_KEYS so the progress dialog never renders
 * these and the progress schema stays strict.
 */
export const INSPECTION_SECTION_KEYS = [
  "toc",
  "scope",
  "summary",
  "register",
  "items",
  "decisions",
  "photoMap",
  "verification",
  "signOff",
] as const;
export type InspectionSectionKey = (typeof INSPECTION_SECTION_KEYS)[number];
export type InspectionSections = Record<InspectionSectionKey, boolean>;

export const INSPECTION_SECTION_LABELS: Record<InspectionSectionKey, string> = {
  toc: "Contents",
  scope: "Scope, method and limitations",
  summary: "Summary at the issue date",
  register: "Defect register",
  items: "Item records",
  decisions: "Decisions and outstanding matters",
  photoMap: "Photo location map",
  verification: "Verification and metadata",
  signOff: "Sign-off",
};

export const INSPECTION_RECIPE: InspectionSections = {
  toc: true,
  scope: true,
  summary: true,
  register: true,
  items: true,
  decisions: true,
  photoMap: true,
  verification: true,
  signOff: true,
};

export function resolveInspectionSections(
  overrides?: Partial<InspectionSections> | null
): InspectionSections {
  return { ...INSPECTION_RECIPE, ...(overrides ?? {}) };
}

export const INSPECTION_REPORT_TITLE = "Defects Inspection and Closeout Report";

/** Fixed texts — the honesty lines every issue carries. */
export const INSPECTION_FIXED_TEXT = {
  coverBanner:
    "Record of inspection. This document is not a notification of a Defect, a Completion certificate, a Defects Certificate or a Certificate of Making Good.",
  scopeMethod:
    "The inspection was visual and non-intrusive and limited to parts accessible at the time. Nothing in this report confirms that uninspected or concealed work is free of defects.",
  summaryCounts:
    "Only items marked Verified closed are treated as closed. Counts are at the issue date and within the inspected scope.",
  signatures:
    "Signatures record inspection and review outcomes for the listed items and this revision only. This report is not a Completion or Defects Certificate, does not release retention, and does not waive any other defect or any right or liability under the contract or at law, including in respect of latent defects. 'Verified closed' reflects a visual re-inspection unless a test or record is cited.",
} as const;
