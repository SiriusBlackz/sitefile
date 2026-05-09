/**
 * Shared string literal unions used by the DB schema, the Drizzle defaults,
 * and the Zod input validators. CHECK constraints in the schema reference
 * these arrays so a single edit here propagates to every layer.
 *
 * To add a new value: append it here, regenerate the migration with
 * `drizzle-kit generate` (or write a manual ALTER ... DROP CONSTRAINT ...
 * ADD CONSTRAINT migration), and the Zod `.enum()` calls pick it up
 * automatically.
 */

export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROJECT_STATUSES = [
  "active",
  "archived",
  "pending_payment",
  "payment_failed",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "delayed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const REPORT_STATUSES = [
  "generating",
  "completed",
  "failed",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const EVIDENCE_TYPES = ["photo", "video"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const LINK_METHODS = ["manual", "ai_suggested", "auto"] as const;
export type LinkMethod = (typeof LINK_METHODS)[number];

export const PROJECT_MEMBER_ROLES = ["admin", "member"] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];
