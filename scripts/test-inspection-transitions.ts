import {
  canTransition,
  canReject,
  canDispose,
  canNotify,
  permissionsFor,
  type Actor,
  type ItemForRules,
} from "../src/lib/inspection-transitions";

let passed = 0, failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}
const A: Actor = { userId: "A", isOrgAdmin: false, projectRole: "supervisor" };
const B: Actor = { userId: "B", isOrgAdmin: false, projectRole: "project_manager" };
const M: Actor = { userId: "M", isOrgAdmin: false, projectRole: "member" };
const R: Actor = { userId: "R", isOrgAdmin: false, projectRole: "member" }; // responsible party
const ADMIN: Actor = { userId: "X", isOrgAdmin: true, projectRole: null };
const item = (status: string, extra: Partial<ItemForRules> = {}): ItemForRules => ({ status, createdBy: "C", responsibleUserId: "R", readyMarkedBy: null, ...extra });

console.log("→ progress / ready");
check("responsible party can mark in progress", canTransition(item("open"), R, "in_progress").ok);
check("unrelated member cannot mark in progress", !canTransition(item("open"), M, "in_progress").ok);
check("recorder can mark ready", canTransition(item("in_progress"), { ...M, userId: "C" }, "ready_for_review").ok);
check("reopened behaves as open for ready", canTransition(item("reopened"), R, "ready_for_review").ok);
check("verified item cannot be marked ready", !canTransition(item("verified_closed"), B, "ready_for_review").ok);
console.log("→ verify");
const ready = item("ready_for_review", { readyMarkedBy: "A" });
check("verifier ≠ ready_marked_by: A refused", !canTransition(ready, A, "verified_closed").ok);
check("verifier ≠ ready_marked_by: B allowed", canTransition(ready, B, "verified_closed").ok);
check("verify requires photo + visit", canTransition(ready, B, "verified_closed").requires.verifiedPhoto === true && canTransition(ready, B, "verified_closed").requires.visit === true);
check("member cannot verify", !canTransition(ready, M, "verified_closed").ok);
check("open item cannot be verified", !canTransition(item("open"), B, "verified_closed").ok);
check("org admin can verify (not the marker)", canTransition(ready, ADMIN, "verified_closed").ok);
check("org admin who marked ready still cannot verify", !canTransition(item("ready_for_review", { readyMarkedBy: "X" }), ADMIN, "verified_closed").ok);
console.log("→ reject / reopen");
check("reject requires note", canReject(ready, B).requires.note === true);
check("marker cannot reject own", !canReject(ready, A).ok);
check("reopen only from verified", !canTransition(item("open"), B, "reopened").ok && canTransition(item("verified_closed"), B, "reopened").ok);
console.log("→ dispositions");
check("PM can accept as-is", canDispose(item("open"), B, "accepted_as_is").ok);
check("supervisor cannot accept as-is", !canDispose(item("open"), A, "accepted_as_is").ok);
check("only admin can void", !canDispose(item("open"), B, "void").ok && canDispose(item("open"), ADMIN, "void").ok);
check("terminal cannot change", !canTransition(item("void"), ADMIN, "in_progress").ok && !canDispose(item("accepted_as_is"), ADMIN, "void").ok);
check("disposition requires reference", canDispose(item("open"), B, "accepted_as_is").requires.reference === true);
console.log("→ notify / permissions");
check("member cannot notify", !canNotify(M).ok && canNotify(A).ok);
const p = permissionsFor(ready, A);
check("permissions: marker sees verify blocked with reason", p.verify === false && typeof p.verifyBlockedReason === "string");
check("permissions: flag off on terminal", permissionsFor(item("void"), ADMIN).flag === false);
console.log(`\nTransition rules: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
