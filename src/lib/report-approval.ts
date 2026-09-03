/**
 * Tiered report sign-off ("approval chain").
 *
 * A project may configure an ordered chain of 1-3 named people
 * (projects.approval_chain). At generate time the chain is snapshotted
 * onto the report (reports.approval_state) so later config edits never
 * retro-change a live report. Approvals happen in order; the report can
 * only be issued to the client (share link / password reveal) once every
 * step is approved. Reports generated with no chain behave as before.
 */

export interface ApprovalChainStep {
  userId: string;
  /** Display label for the step, e.g. "Reviews" or "Final sign-off". */
  label: string;
}

export interface ApprovalChain {
  steps: ApprovalChainStep[];
}

export interface ApprovalStateStep extends ApprovalChainStep {
  /** Denormalised at snapshot time so the card renders without joins. */
  name: string;
  roleLabel: string | null;
  approvedAt: string | null;
  /** Name as typed at approval time (matches the sign-off affordance). */
  approvedName: string | null;
}

export interface ApprovalState {
  steps: ApprovalStateStep[];
  completedAt: string | null;
}

export function parseApprovalChain(value: unknown): ApprovalChain | null {
  if (!value || typeof value !== "object") return null;
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const clean = steps
    .filter(
      (s): s is ApprovalChainStep =>
        Boolean(s) &&
        typeof (s as ApprovalChainStep).userId === "string" &&
        typeof (s as ApprovalChainStep).label === "string"
    )
    .slice(0, 3);
  return clean.length > 0 ? { steps: clean } : null;
}

export function parseApprovalState(value: unknown): ApprovalState | null {
  if (!value || typeof value !== "object") return null;
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return value as ApprovalState;
}

/** The first unapproved step, or null when the chain is complete. */
export function currentApprovalStep(
  state: ApprovalState
): ApprovalStateStep | null {
  return state.steps.find((s) => !s.approvedAt) ?? null;
}

export function isApprovalComplete(state: ApprovalState | null): boolean {
  return !state || Boolean(state.completedAt);
}
