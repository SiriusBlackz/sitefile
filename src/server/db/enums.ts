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

// ─── Inspection (defects) — see Research/Sitefile_Defects_Inspection_FINAL_TEMPLATE.md ───

/** What a project is for. Everything inspection-related is opt-in on 'inspection'. */
export const PROJECT_TYPES = ["progress", "inspection", "condition_survey"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CONTRACT_FORMS = ["nec4_ecc", "nec3_ecc", "jct", "other"] as const;
export type ContractForm = (typeof CONTRACT_FORMS)[number];

export const LOCATION_SCHEMES = ["building", "linear", "grid"] as const;
export type LocationScheme = (typeof LOCATION_SCHEMES)[number];

export const INSPECTION_VISIT_KINDS = ["defects"] as const;
export type InspectionVisitKind = (typeof INSPECTION_VISIT_KINDS)[number];

export const INSPECTION_VISIT_STAGES = [
  "initial_walkthrough",
  "interim_reinspection",
  "end_of_defects_period",
] as const;
export type InspectionVisitStage = (typeof INSPECTION_VISIT_STAGES)[number];

export const INSPECTION_REPORT_KINDS = ["inspection_record", "register_status", "closeout"] as const;
export type InspectionReportKind = (typeof INSPECTION_REPORT_KINDS)[number];

export const INSPECTION_ITEM_TYPES = ["defect", "snag", "outstanding_work", "observation"] as const;
export type InspectionItemType = (typeof INSPECTION_ITEM_TYPES)[number];

export const INSPECTION_ITEM_STATUSES = [
  "open",
  "in_progress",
  "ready_for_review",
  "verified_closed",
  "reopened",
  "accepted_as_is",
  "void",
] as const;
export type InspectionItemStatus = (typeof INSPECTION_ITEM_STATUSES)[number];

export const INSPECTION_EVENT_KINDS = [
  "created",
  "updated",
  "status_change",
  "not_accepted",
  "flag_set",
  "flag_cleared",
  "photo_added",
  "notified",
  "reopened",
  "disposition",
] as const;
export type InspectionEventKind = (typeof INSPECTION_EVENT_KINDS)[number];

export const INSPECTION_PHOTO_ROLES = ["defect", "during", "rectified", "verified"] as const;
export type InspectionPhotoRole = (typeof INSPECTION_PHOTO_ROLES)[number];

/** Which document a `reports` row is. Progress rows keep the default. */
export const REPORT_KINDS = ["progress", "inspection", "condition_survey"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
