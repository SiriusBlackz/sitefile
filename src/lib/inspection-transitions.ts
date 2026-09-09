/**
 * Defects register status rules — one pure module shared by the server
 * guards and the phone buttons, so no screen ever re-encodes who may do
 * what. Server always re-evaluates; the phone only uses `permissionsFor`
 * to decide which buttons to draw.
 *
 * From the FINAL template: Open → In progress → Ready for review →
 * Verified closed, with Reopened behaving as Open; Accepted as-is and Void
 * are terminal dispositions; "Not accepted" is an event back to Open.
 * The verifier can never be the person who marked Ready for review.
 */

export type ItemStatus =
  | "open"
  | "in_progress"
  | "ready_for_review"
  | "verified_closed"
  | "reopened"
  | "accepted_as_is"
  | "void";

export type TransitionTarget = "in_progress" | "ready_for_review" | "verified_closed" | "reopened";
export type Disposition = "accepted_as_is" | "void";
export type Flag = "disputed" | "access_blocked" | "awaiting_test";

/** Project roles allowed to verify, reject, reopen, notify and edit settings. */
export const OVERSIGHT_ROLES = ["admin", "project_manager", "construction_manager", "supervisor"] as const;
/** Project roles allowed to accept-as-is or void (plus org admins). */
export const DISPOSITION_ROLES = ["admin", "project_manager"] as const;

export interface Actor {
  userId: string;
  isOrgAdmin: boolean;
  projectRole: string | null;
}

export interface ItemForRules {
  status: string;
  createdBy: string;
  responsibleUserId: string | null;
  readyMarkedBy: string | null;
}

export const TERMINAL: ReadonlySet<string> = new Set(["accepted_as_is", "void"]);
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(["verified_closed", "accepted_as_is", "void"]);

export function isOversight(a: Actor): boolean {
  return a.isOrgAdmin || (a.projectRole != null && (OVERSIGHT_ROLES as readonly string[]).includes(a.projectRole));
}
export function isDispositionAuthority(a: Actor): boolean {
  return a.isOrgAdmin || (a.projectRole != null && (DISPOSITION_ROLES as readonly string[]).includes(a.projectRole));
}
export function isVoidAuthority(a: Actor): boolean {
  return a.isOrgAdmin || a.projectRole === "admin";
}
/** The people who may progress an item towards Ready for review. */
export function isParty(item: ItemForRules, a: Actor): boolean {
  return isOversight(a) || item.createdBy === a.userId || item.responsibleUserId === a.userId;
}

export interface RuleResult {
  ok: boolean;
  /** Human reason when refused — printed to the user as-is. */
  reason?: string;
  /** What the caller must supply for this transition. */
  requires: { verifiedPhoto?: boolean; visit?: boolean; note?: boolean; reference?: boolean };
}

const NONE: RuleResult["requires"] = {};

export function canTransition(item: ItemForRules, actor: Actor, to: TransitionTarget): RuleResult {
  const s = item.status;
  if (TERMINAL.has(s)) return { ok: false, reason: "This item has a final disposition and cannot change status.", requires: NONE };
  switch (to) {
    case "in_progress":
      if (!(s === "open" || s === "reopened")) return { ok: false, reason: "Only an open or reopened item can be marked in progress.", requires: NONE };
      if (!isParty(item, actor)) return { ok: false, reason: "Only the responsible party, the recorder or a manager can progress this item.", requires: NONE };
      return { ok: true, requires: NONE };
    case "ready_for_review":
      if (!(s === "open" || s === "in_progress" || s === "reopened")) return { ok: false, reason: "Only an open, in-progress or reopened item can be marked ready for review.", requires: NONE };
      if (!isParty(item, actor)) return { ok: false, reason: "Only the responsible party, the recorder or a manager can mark this ready.", requires: NONE };
      return { ok: true, requires: NONE };
    case "verified_closed":
      if (s !== "ready_for_review") return { ok: false, reason: "An item must be ready for review before it can be verified.", requires: NONE };
      if (!isOversight(actor)) return { ok: false, reason: "Only a project manager, construction manager, supervisor or admin can verify.", requires: NONE };
      if (item.readyMarkedBy && item.readyMarkedBy === actor.userId) return { ok: false, reason: "The person who marked this ready for review cannot also verify it.", requires: NONE };
      return { ok: true, requires: { verifiedPhoto: true, visit: true } };
    case "reopened":
      if (s !== "verified_closed") return { ok: false, reason: "Only a verified-closed item can be reopened.", requires: NONE };
      if (!isOversight(actor)) return { ok: false, reason: "Only a manager can reopen a verified item.", requires: NONE };
      return { ok: true, requires: { note: true } };
  }
}

/** Ready for review → Open with a mandatory reason; an event, not a status. */
export function canReject(item: ItemForRules, actor: Actor): RuleResult {
  if (item.status !== "ready_for_review") return { ok: false, reason: "Only an item that is ready for review can be sent back.", requires: NONE };
  if (!isOversight(actor)) return { ok: false, reason: "Only a manager can send an item back.", requires: NONE };
  if (item.readyMarkedBy && item.readyMarkedBy === actor.userId) return { ok: false, reason: "The person who marked this ready for review cannot review it.", requires: NONE };
  return { ok: true, requires: { note: true } };
}

export function canDispose(item: ItemForRules, actor: Actor, to: Disposition): RuleResult {
  if (TERMINAL.has(item.status)) return { ok: false, reason: "This item already has a final disposition.", requires: NONE };
  if (to === "void" ? !isVoidAuthority(actor) : !isDispositionAuthority(actor)) {
    return { ok: false, reason: to === "void" ? "Only an admin can void an item." : "Only a project manager or admin can accept an item as-is.", requires: NONE };
  }
  return { ok: true, requires: { reference: true } };
}

export function canNotify(actor: Actor): RuleResult {
  return isOversight(actor) ? { ok: true, requires: NONE } : { ok: false, reason: "Only a manager can record a formal notification.", requires: NONE };
}

export interface Permissions {
  progress: boolean;
  ready: boolean;
  verify: boolean;
  reject: boolean;
  reopen: boolean;
  flag: boolean;
  dispose: boolean;
  notify: boolean;
  /** Why verify is unavailable, when it is — the phone shows this. */
  verifyBlockedReason: string | null;
}

export function permissionsFor(item: ItemForRules, actor: Actor): Permissions {
  const verify = canTransition(item, actor, "verified_closed");
  return {
    progress: canTransition(item, actor, "in_progress").ok,
    ready: canTransition(item, actor, "ready_for_review").ok,
    verify: verify.ok,
    reject: canReject(item, actor).ok,
    reopen: canTransition(item, actor, "reopened").ok,
    flag: !TERMINAL.has(item.status),
    dispose: canDispose(item, actor, "accepted_as_is").ok || canDispose(item, actor, "void").ok,
    notify: canNotify(actor).ok,
    verifyBlockedReason: verify.ok ? null : item.status === "ready_for_review" ? (verify.reason ?? null) : null,
  };
}
