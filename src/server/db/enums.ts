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
  "cancelled",
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

// --- Site Diary (foreman daily record) ---

export const DIARY_ENTRY_STATUSES = ["draft", "locked", "not_filled"] as const;
export type DiaryEntryStatus = (typeof DIARY_ENTRY_STATUSES)[number];

/** Where a datum came from — the evidential provenance stamp. */
export const DIARY_PROVENANCE = ["auto", "carried", "edited", "you"] as const;
export type DiaryProvenance = (typeof DIARY_PROVENANCE)[number];

export const DIARY_WORK_SOURCES = ["photo_link", "manual", "carried"] as const;
export type DiaryWorkSource = (typeof DIARY_WORK_SOURCES)[number];

export const DIARY_RESOURCE_KINDS = ["labour", "plant", "materials"] as const;
export type DiaryResourceKind = (typeof DIARY_RESOURCE_KINDS)[number];

export const HOLDUP_CAUSES = [
  "weather",
  "awaiting_information",
  "no_access",
  "labour_shortage",
  "materials_delay",
  "plant_breakdown",
  "design_change",
  "rework",
  "other",
] as const;
export type HoldupCause = (typeof HOLDUP_CAUSES)[number];

export const HOLDUP_STATUSES = ["open", "closed"] as const;
export type HoldupStatus = (typeof HOLDUP_STATUSES)[number];

export const DIARY_EVENT_KINDS = [
  "created",
  "submitted",
  "auto_locked",
  "amended",
  "holdup_logged",
  "holdup_updated",
  "holdup_closed",
] as const;
export type DiaryEventKind = (typeof DIARY_EVENT_KINDS)[number];

export const PROJECT_MEMBER_ROLES = [
  "admin",
  "member",
  "site_manager",
  "project_manager",
  "construction_manager",
  "quantity_surveyor",
  "supervisor",
] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];
