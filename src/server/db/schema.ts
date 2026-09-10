import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  boolean,
  real,
  doublePrecision,
  numeric,
  bigint,
  jsonb,
  unique,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  USER_ROLES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  REPORT_STATUSES,
  EVIDENCE_TYPES,
  LINK_METHODS,
  PROJECT_MEMBER_ROLES,
  DIARY_ENTRY_STATUSES,
  DIARY_PROVENANCE,
  DIARY_WORK_SOURCES,
  DIARY_RESOURCE_KINDS,
  HOLDUP_CAUSES,
  HOLDUP_STATUSES,
  DIARY_EVENT_KINDS,
  PROJECT_TYPES,
  CONTRACT_FORMS,
  LOCATION_SCHEMES,
  INSPECTION_VISIT_KINDS,
  INSPECTION_VISIT_STAGES,
  INSPECTION_ITEM_TYPES,
  INSPECTION_ITEM_STATUSES,
  INSPECTION_EVENT_KINDS,
  INSPECTION_PHOTO_ROLES,
  REPORT_KINDS,
} from "./enums";

function quotedList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

// ─── Organisations ───────────────────────────────────────────────────────────

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  companyDetails: text("company_details"),
  subscriptionTier: text("subscription_tier").default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  // Null = the org hasn't finished (or skipped) the first-run setup
  // wizard; the dashboard layout redirects it to /onboarding.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
}).enableRLS();

export const organisationsRelations = relations(organisations, ({ many }) => ({
  users: many(users),
  projects: many(projects),
}));

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id),
    clerkId: text("clerk_id").unique().notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("member"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    // Set when an org admin removes a colleague who has already signed in.
    // The row stays (evidence / reports / diary / audit rows reference it
    // for attribution) but the account can no longer reach the app.
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    check(
      "users_role_check",
      sql.raw(`${t.role.name} IN (${quotedList(USER_ROLES)})`)
    ),
  ]
).enableRLS();

export const usersRelations = relations(users, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [users.orgId],
    references: [organisations.id],
  }),
  projectMembers: many(projectMembers),
  evidence: many(evidence),
  reports: many(reports),
}));

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  reference: text("reference"),
  clientName: text("client_name"),
  clientLogoKey: text("client_logo_key"),
  contractType: text("contract_type"),
  scheduleMode: text("schedule_mode").notNull().default("manual"),
  reportingFrequency: text("reporting_frequency").default("monthly"),
  // When the next report is owed to the client — drives the countdown
  // chip and the gap list; advanced by one frequency step on generation.
  nextReportDue: date("next_report_due", { mode: "string" }),
  // Where report numbering begins: contractors joining mid-contract may
  // already have sent reports №1..N outside Sitefile. Only consulted
  // while the project has no reports; after that MAX+1 rules.
  firstReportNumber: integer("first_report_number").notNull().default(1),
  // Programme-as-living-document ritual: stamped by programme import and
  // by the per-period "no change this period" confirmation.
  programmeConfirmedAt: timestamp("programme_confirmed_at", {
    withTimezone: true,
    mode: "date",
  }),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  status: text("status").default("active"),
  // Tiered report sign-off config ({ steps: [{ userId, label }] }, 1-3
  // ordered steps). NULL = feature off: reports send as soon as generated.
  approvalChain: jsonb("approval_chain"),
  // Site diary cadence: ISO weekday numbers (1=Mon..7=Sun) that count as
  // working days — drives streaks, coverage % and missed-day nudges.
  workingDays: jsonb("working_days").notNull().default([1, 2, 3, 4, 5]),
  // Optional diary additions per project ({ contractors, plannedWorks,
  // nextDayImpact } booleans). Default {} = off: the 90-second ritual is
  // unchanged unless the PM switches an addition on.
  diaryExtras: jsonb("diary_extras").notNull().default({}),
  // IANA timezone for "is the site's day over" derivations and the
  // auto-lock sweep. Diary entry dates themselves are always the
  // phone's client-supplied local date.
  timezone: text("timezone").notNull().default("Europe/London"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // ── Inspection / condition-survey projects (additive; progress rows keep
  // the defaults and never enter an inspection code path) ──
  projectType: text("project_type").notNull().default("progress"),
  contractForm: text("contract_form"),
  // NEC defect correction period in days; drives the computed
  // correction_due when an item is formally notified. NULL = not set.
  defaultCorrectionPeriodDays: integer("default_correction_period_days"),
  locationScheme: text("location_scheme"),
  // { labels: string[] } — off when NULL (severity is project-configurable).
  priorityScheme: jsonb("priority_scheme"),
  // { completion?, defectsDate?, confirmed?: { completion?, defectsDate? } }
  contractDates: jsonb("contract_dates"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("projects_org_id_idx").on(t.orgId),
  index("projects_status_idx").on(t.status),
  check(
    "projects_status_check",
    sql.raw(`${t.status.name} IN (${quotedList(PROJECT_STATUSES)})`)
  ),
  check(
    "projects_project_type_check",
    sql.raw(`${t.projectType.name} IN (${quotedList(PROJECT_TYPES)})`)
  ),
  check(
    "projects_contract_form_check",
    sql.raw(`${t.contractForm.name} IS NULL OR ${t.contractForm.name} IN (${quotedList(CONTRACT_FORMS)})`)
  ),
  check(
    "projects_location_scheme_check",
    sql.raw(`${t.locationScheme.name} IS NULL OR ${t.locationScheme.name} IN (${quotedList(LOCATION_SCHEMES)})`)
  ),
]).enableRLS();

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [projects.orgId],
    references: [organisations.id],
  }),
  members: many(projectMembers),
  tasks: many(tasks),
  gpsZones: many(gpsZones),
  evidence: many(evidence),
  reports: many(reports),
  inspectionVisits: many(inspectionVisits),
  inspectionItems: many(inspectionItems),
}));

// ─── Project Members ─────────────────────────────────────────────────────────

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
  },
  (t) => [
    unique().on(t.projectId, t.userId),
    check(
      "project_members_role_check",
      sql.raw(`${t.role.name} IN (${quotedList(PROJECT_MEMBER_ROLES)})`)
    ),
  ]
).enableRLS();

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  parentTaskId: uuid("parent_task_id"),
  name: text("name").notNull(),
  description: text("description"),
  plannedStart: date("planned_start", { mode: "string" }),
  plannedEnd: date("planned_end", { mode: "string" }),
  actualStart: date("actual_start", { mode: "string" }),
  actualEnd: date("actual_end", { mode: "string" }),
  progressPct: integer("progress_pct").default(0),
  sortOrder: integer("sort_order").default(0),
  sourceRef: text("source_ref"),
  // Contract milestones drive the report's Key Dates table. Set by
  // programme import (MS Project / P6 mark them explicitly) or by hand;
  // zero-duration tasks are additionally treated as milestones at
  // report time without needing this flag.
  isMilestone: boolean("is_milestone").default(false).notNull(),
  status: text("status").default("not_started"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("tasks_project_id_idx").on(t.projectId),
  index("tasks_status_idx").on(t.status),
  check(
    "tasks_status_check",
    sql.raw(`${t.status.name} IN (${quotedList(TASK_STATUSES)})`)
  ),
]).enableRLS();

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "parentChild",
  }),
  childTasks: many(tasks, { relationName: "parentChild" }),
  evidenceLinks: many(evidenceLinks),
}));

// ─── GPS Zones ───────────────────────────────────────────────────────────────

export const gpsZones = pgTable("gps_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  polygon: jsonb("polygon").notNull(),
  defaultTaskId: uuid("default_task_id").references(() => tasks.id),
  color: text("color").default("#3B82F6"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}).enableRLS();

export const gpsZonesRelations = relations(gpsZones, ({ one }) => ({
  project: one(projects, {
    fields: [gpsZones.projectId],
    references: [projects.id],
  }),
  defaultTask: one(tasks, {
    fields: [gpsZones.defaultTaskId],
    references: [tasks.id],
  }),
}));

// ─── Evidence ────────────────────────────────────────────────────────────────

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull().default("photo"),
  storageKey: text("storage_key").notNull(),
  thumbnailKey: text("thumbnail_key"),
  originalFilename: text("original_filename"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  mimeType: text("mime_type"),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }).defaultNow(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  altitude: doublePrecision("altitude"),
  exifData: jsonb("exif_data"),
  note: text("note"),
  deviceInfo: text("device_info"),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("evidence_project_id_idx").on(t.projectId),
  index("evidence_project_created_idx").on(t.projectId, t.createdAt),
  index("evidence_captured_at_idx").on(t.capturedAt),
  check(
    "evidence_type_check",
    sql.raw(`${t.type.name} IN (${quotedList(EVIDENCE_TYPES)})`)
  ),
]).enableRLS();

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  project: one(projects, {
    fields: [evidence.projectId],
    references: [projects.id],
  }),
  uploader: one(users, {
    fields: [evidence.uploadedBy],
    references: [users.id],
  }),
  links: many(evidenceLinks),
}));

// ─── Evidence Links ──────────────────────────────────────────────────────────

export const evidenceLinks = pgTable(
  "evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    linkMethod: text("link_method").notNull().default("manual"),
    aiConfidence: real("ai_confidence"),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    unique().on(t.evidenceId, t.taskId),
    index("evidence_links_task_id_idx").on(t.taskId),
    check(
      "evidence_links_link_method_check",
      sql.raw(`${t.linkMethod.name} IN (${quotedList(LINK_METHODS)})`)
    ),
  ]
).enableRLS();

export const evidenceLinksRelations = relations(evidenceLinks, ({ one }) => ({
  evidence: one(evidence, {
    fields: [evidenceLinks.evidenceId],
    references: [evidence.id],
  }),
  task: one(tasks, {
    fields: [evidenceLinks.taskId],
    references: [tasks.id],
  }),
  confirmer: one(users, {
    fields: [evidenceLinks.confirmedBy],
    references: [users.id],
  }),
}));

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => users.id),
  reportNumber: integer("report_number").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  pdfStorageKey: text("pdf_storage_key"),
  passwordHash: text("password_hash"),
  // Short-lived AES-256-GCM wrapping of the report password so the Inngest
  // worker can encrypt the PDF without the plaintext transiting Inngest.
  // Set at generate time, cleared on completion/failure.
  passwordCiphertext: text("password_ciphertext"),
  reportData: jsonb("report_data"),
  // Snapshot of the project's approval chain taken at generate time, plus
  // per-step approvals. NULL = no chain on this report (sendable once
  // completed). Status stays generating/completed/failed regardless.
  approvalState: jsonb("approval_state"),
  status: text("status").default("generating"),
  // Which document this row is. Progress reports keep the default; the
  // send page, share page and list label the document from this column.
  reportKind: text("report_kind").notNull().default("progress"),
  // Issue revision of the same document (re-issued inspection reports).
  revision: integer("revision").notNull().default(1),
  // Re-issue: the report this revision replaces (same number, revision + 1).
  // NULL for first issues and every progress report.
  supersedesReportId: uuid("supersedes_report_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("reports_project_id_idx").on(t.projectId),
  // Two reports in the same project must not share a report number AND
  // revision — makes the MAX+1 race in report.generate fail at the DB level
  // instead of creating duplicate-numbered rows (progress always inserts
  // revision 1, so its behaviour is unchanged by the revision column).
  unique("reports_project_report_number_unique").on(
    t.projectId,
    t.reportNumber,
    t.revision
  ),
  // Only one in-flight report per project — the partial unique index turns
  // the check-then-insert race in report.generate into a hard CONFLICT.
  uniqueIndex("reports_one_generating_per_project_idx")
    .on(t.projectId)
    .where(sql`status = 'generating'`),
  check(
    "reports_status_check",
    sql.raw(`${t.status.name} IN (${quotedList(REPORT_STATUSES)})`)
  ),
  check(
    "reports_report_kind_check",
    sql.raw(`${t.reportKind.name} IN (${quotedList(REPORT_KINDS)})`)
  ),
]).enableRLS();

export const reportsRelations = relations(reports, ({ one, many }) => ({
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
  generator: one(users, {
    fields: [reports.generatedBy],
    references: [users.id],
  }),
  shares: many(reportShares),
}));

// ─── Report Drafts (the standing draft) ─────────────────────────────────────
// One live draft per project: the PM's pre-generate state — approved
// narrative, signed-off issues, signature — set at the desk and shown on
// the phone home's gap list, so it must live server-side, not in a
// device's localStorage. Keyed to period_start: a new period resets it.

export const reportDrafts = pgTable("report_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  payload: jsonb("payload").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
}).enableRLS();

export const reportDraftsRelations = relations(reportDrafts, ({ one }) => ({
  project: one(projects, {
    fields: [reportDrafts.projectId],
    references: [projects.id],
  }),
}));

// ─── Programme Baselines ────────────────────────────────────────────────────
// The accepted/contract programme, snapshotted once (first import by
// default) and held fixed while re-imports replace the *current*
// programme each period. Reports measure slippage against this snapshot.
// One row per project; re-baselining replaces it (audit-logged).

export const programmeBaselines = pgTable("programme_baselines", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  setBy: uuid("set_by").references(() => users.id),
  setAt: timestamp("set_at", { withTimezone: true, mode: "date" }).defaultNow(),
  /** "first-import" | "rebaseline" — how this snapshot came to be. */
  source: text("source").notNull().default("first-import"),
  /** { tasks: [{ sourceRef, name, plannedStart, plannedEnd, isMilestone }] } */
  snapshot: jsonb("snapshot").notNull(),
}).enableRLS();

export const programmeBaselinesRelations = relations(
  programmeBaselines,
  ({ one }) => ({
    project: one(projects, {
      fields: [programmeBaselines.projectId],
      references: [projects.id],
    }),
  })
);

// ─── Report Shares (send & receipt) ─────────────────────────────────────────
// A share is a tokenised public link to a completed report. The client's
// interactions with it (opened the page, downloaded the PDF) are logged as
// events, giving the contractor a delivery receipt — "the client opened
// it" is the product's success criterion, so it is first-class data.

export const reportShares = pgTable("report_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  recipientLabel: text("recipient_label"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("report_shares_report_id_idx").on(t.reportId),
]).enableRLS();

export const reportSharesRelations = relations(reportShares, ({ one, many }) => ({
  report: one(reports, {
    fields: [reportShares.reportId],
    references: [reports.id],
  }),
  creator: one(users, {
    fields: [reportShares.createdBy],
    references: [users.id],
  }),
  events: many(reportShareEvents),
}));

export const reportShareEvents = pgTable("report_share_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareId: uuid("share_id")
    .notNull()
    .references(() => reportShares.id, { onDelete: "cascade" }),
  // "opened" = share page viewed; "downloaded" = PDF fetched.
  event: text("event").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("report_share_events_share_id_idx").on(t.shareId),
]).enableRLS();

export const reportShareEventsRelations = relations(reportShareEvents, ({ one }) => ({
  share: one(reportShares, {
    fields: [reportShareEvents.shareId],
    references: [reportShares.id],
  }),
}));

// ─── Stripe Events (idempotency cache) ──────────────────────────────────────

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}).enableRLS();

// ─── Upload Intents ──────────────────────────────────────────────────────────

export const uploadIntents = pgTable(
  "upload_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    maxSizeBytes: bigint("max_size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    unique("upload_intents_storage_key_unique").on(t.storageKey),
    index("upload_intents_expires_idx").on(t.expiresAt),
  ]
).enableRLS();

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("audit_log_project_created_idx").on(t.projectId, t.createdAt),
]).enableRLS();

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  project: one(projects, {
    fields: [auditLog.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

// ─── Site Diary ──────────────────────────────────────────────────────────────
// Foreman daily record ("The 90-Second Ritual"). One entry per person per
// project per site-local day; evidential-lite: locks on submit (or the
// auto-lock sweep), amendments are append-only events, dual entered/received
// stamps keep offline submission honest.

export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    // Site-local date, always client-supplied — never derived server-side.
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("draft"),
    // Dual stamps: what the phone claimed vs when the server received it.
    enteredAt: timestamp("entered_at", { withTimezone: true, mode: "date" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    // Permanent "entered next day" flag.
    late: boolean("late").notNull().default(false),
    // Block 4 scalars (people & safety).
    visitorsCount: integer("visitors_count").notNull().default(0),
    inspectionsCount: integer("inspections_count").notNull().default(0),
    toolboxTalk: boolean("toolbox_talk").notNull().default(false),
    toolboxTopic: text("toolbox_topic"),
    incidentsCount: integer("incidents_count").notNull().default(0),
    safetyNote: text("safety_note"),
    workNote: text("work_note"),
    // Diary additions (package 3b, from the VFL shift report). NULL when the
    // project has the addition off or the foreman left it blank.
    // contractors: [{ company, discipline, headcount }]
    contractors: jsonb("contractors"),
    plannedWorks: text("planned_works"),
    nextDayImpact: text("next_day_impact"),
    // AUTO Open-Meteo snapshot frozen at submit.
    weather: jsonb("weather"),
    // Map of scalar field -> provenance stamp (auto/carried/edited/you).
    provenance: jsonb("provenance").notNull().default({}),
    // ◆ flag; the amendment history lives in diary_events.
    amendedAt: timestamp("amended_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    unique("diary_entries_project_author_date_unique").on(
      t.projectId,
      t.authorId,
      t.entryDate
    ),
    index("diary_entries_project_date_idx").on(t.projectId, t.entryDate),
    index("diary_entries_author_idx").on(t.authorId),
    check(
      "diary_entries_status_check",
      sql.raw(`${t.status.name} IN (${quotedList(DIARY_ENTRY_STATUSES)})`)
    ),
  ]
).enableRLS();

export const diaryWorkLines = pgTable(
  "diary_work_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => diaryEntries.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    source: text("source").notNull(),
    provenance: text("provenance").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    // Evidence ids backing a pre-drafted line (photos stay in evidence).
    evidenceIds: jsonb("evidence_ids"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("diary_work_lines_entry_idx").on(t.entryId),
    check(
      "diary_work_lines_source_check",
      sql.raw(`${t.source.name} IN (${quotedList(DIARY_WORK_SOURCES)})`)
    ),
    check(
      "diary_work_lines_provenance_check",
      sql.raw(`${t.provenance.name} IN (${quotedList(DIARY_PROVENANCE)})`)
    ),
  ]
).enableRLS();

export const diaryResources = pgTable(
  "diary_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => diaryEntries.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    // v1 UI uses one row per kind (label ""); schema future-proofs named trades.
    label: text("label").notNull().default(""),
    qty: real("qty").notNull().default(0),
    note: text("note"),
    provenance: text("provenance").notNull(),
  },
  (t) => [
    unique("diary_resources_entry_kind_label_unique").on(
      t.entryId,
      t.kind,
      t.label
    ),
    check(
      "diary_resources_kind_check",
      sql.raw(`${t.kind.name} IN (${quotedList(DIARY_RESOURCE_KINDS)})`)
    ),
    check(
      "diary_resources_provenance_check",
      sql.raw(`${t.provenance.name} IN (${quotedList(DIARY_PROVENANCE)})`)
    ),
  ]
).enableRLS();

// Multi-day delay thread head — a one-day hold-up is a closed thread with
// a single day row. The PM ledger is SUM(hours) over day rows by cause.
export const diaryHoldups = pgTable(
  "diary_holdups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    cause: text("cause").notNull(),
    note: text("note"),
    evidenceId: uuid("evidence_id").references(() => evidence.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("open"),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    closedOn: date("closed_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("diary_holdups_project_status_idx").on(t.projectId, t.status),
    index("diary_holdups_project_started_idx").on(t.projectId, t.startedOn),
    check(
      "diary_holdups_cause_check",
      sql.raw(`${t.cause.name} IN (${quotedList(HOLDUP_CAUSES)})`)
    ),
    check(
      "diary_holdups_status_check",
      sql.raw(`${t.status.name} IN (${quotedList(HOLDUP_STATUSES)})`)
    ),
  ]
).enableRLS();

export const diaryHoldupDays = pgTable(
  "diary_holdup_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdupId: uuid("holdup_id")
      .notNull()
      .references(() => diaryHoldups.id, { onDelete: "cascade" }),
    // Denormalised for ledger queries.
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Attached at ritual confirm; null while logged mid-day.
    entryId: uuid("entry_id").references(() => diaryEntries.id, {
      onDelete: "set null",
    }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    hoursLost: real("hours_lost").notNull(),
    note: text("note"),
    // Moment-of-logging honesty: what the phone claimed vs server receipt.
    loggedAt: timestamp("logged_at", { withTimezone: true, mode: "date" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    provenance: text("provenance").notNull().default("you"),
  },
  (t) => [
    unique("diary_holdup_days_holdup_date_unique").on(t.holdupId, t.occurredOn),
    index("diary_holdup_days_project_date_idx").on(t.projectId, t.occurredOn),
    check(
      "diary_holdup_days_provenance_check",
      sql.raw(`${t.provenance.name} IN (${quotedList(DIARY_PROVENANCE)})`)
    ),
  ]
).enableRLS();

// Append-only lifecycle + amendment history; originals preserved here.
export const diaryEvents = pgTable(
  "diary_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").references(() => diaryEntries.id, {
      onDelete: "cascade",
    }),
    holdupId: uuid("holdup_id").references(() => diaryHoldups.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Null for system actions (auto_locked).
    actorId: uuid("actor_id").references(() => users.id),
    kind: text("kind").notNull(),
    // Amendments carry {field, previous, next}.
    payload: jsonb("payload").notNull().default({}),
    clientAt: timestamp("client_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("diary_events_entry_idx").on(t.entryId),
    index("diary_events_project_created_idx").on(t.projectId, t.createdAt),
    check(
      "diary_events_kind_check",
      sql.raw(`${t.kind.name} IN (${quotedList(DIARY_EVENT_KINDS)})`)
    ),
  ]
).enableRLS();

export const diaryEntriesRelations = relations(diaryEntries, ({ one, many }) => ({
  project: one(projects, {
    fields: [diaryEntries.projectId],
    references: [projects.id],
  }),
  author: one(users, {
    fields: [diaryEntries.authorId],
    references: [users.id],
  }),
  workLines: many(diaryWorkLines),
  resources: many(diaryResources),
}));

export const diaryWorkLinesRelations = relations(diaryWorkLines, ({ one }) => ({
  entry: one(diaryEntries, {
    fields: [diaryWorkLines.entryId],
    references: [diaryEntries.id],
  }),
  task: one(tasks, {
    fields: [diaryWorkLines.taskId],
    references: [tasks.id],
  }),
}));

export const diaryResourcesRelations = relations(diaryResources, ({ one }) => ({
  entry: one(diaryEntries, {
    fields: [diaryResources.entryId],
    references: [diaryEntries.id],
  }),
}));

export const diaryHoldupsRelations = relations(diaryHoldups, ({ one, many }) => ({
  project: one(projects, {
    fields: [diaryHoldups.projectId],
    references: [projects.id],
  }),
  author: one(users, {
    fields: [diaryHoldups.authorId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [diaryHoldups.taskId],
    references: [tasks.id],
  }),
  days: many(diaryHoldupDays),
}));

export const diaryHoldupDaysRelations = relations(diaryHoldupDays, ({ one }) => ({
  holdup: one(diaryHoldups, {
    fields: [diaryHoldupDays.holdupId],
    references: [diaryHoldups.id],
  }),
  entry: one(diaryEntries, {
    fields: [diaryHoldupDays.entryId],
    references: [diaryEntries.id],
  }),
}));

export const diaryEventsRelations = relations(diaryEvents, ({ one }) => ({
  entry: one(diaryEntries, {
    fields: [diaryEvents.entryId],
    references: [diaryEntries.id],
  }),
  holdup: one(diaryHoldups, {
    fields: [diaryEvents.holdupId],
    references: [diaryHoldups.id],
  }),
}));

// ─── Inspection (defects) ────────────────────────────────────────────────────
// Permanent register of defects/snags per inspection project. Items keep a
// stable per-project reference (DEF-0001) for life; every change is an
// append-only event; photos are ordinary `evidence` rows tagged with a role.
// Progress projects never write here. See
// Research/Sitefile_Defects_Inspection_FINAL_TEMPLATE.md.

export const inspectionVisits = pgTable(
  "inspection_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("defects"),
    stage: text("stage").notNull(),
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    weather: text("weather"),
    // [{ name, org, role, authority }]
    attendees: jsonb("attendees").notNull().default([]),
    scopeNote: text("scope_note"),
    methodLine: text("method_line"),
    // [{ area, reason, owner, followUp }]
    notInspected: jsonb("not_inspected").notNull().default([]),
    urgentConcerns: text("urgent_concerns"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    unique("inspection_visits_project_date_stage_unique").on(
      t.projectId,
      t.visitDate,
      t.stage
    ),
    index("inspection_visits_project_date_idx").on(t.projectId, t.visitDate),
    check(
      "inspection_visits_kind_check",
      sql.raw(`${t.kind.name} IN (${quotedList(INSPECTION_VISIT_KINDS)})`)
    ),
    check(
      "inspection_visits_stage_check",
      sql.raw(`${t.stage.name} IN (${quotedList(INSPECTION_VISIT_STAGES)})`)
    ),
  ]
).enableRLS();

export const inspectionItems = pgTable(
  "inspection_items",
  {
    // Client-suppliable so offline-queued photos can reference the item
    // before the server has seen it; itemCreate is idempotent on id.
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    ref: text("ref").notNull(),
    type: text("type").notNull().default("defect"),
    title: text("title").notNull(),
    finding: text("finding").notNull(),
    suspectedCause: text("suspected_cause"),
    acceptanceBasis: text("acceptance_basis"),
    interimAction: text("interim_action"),
    accessNote: text("access_note"),
    locationScheme: text("location_scheme").notNull(),
    // { description (always), block/level/room/element | alignment/chainage/side/offset | grid }
    location: jsonb("location").notNull(),
    // Server-derived, scheme-aware sort key so the register orders by
    // location then ref without a JSONB expression index.
    locationSort: text("location_sort"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    accuracyM: real("accuracy_m"),
    category: text("category"),
    priority: text("priority"),
    responsibleOrg: text("responsible_org"),
    responsibleUserId: uuid("responsible_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    repairTarget: date("repair_target", { mode: "string" }),
    // Formal notification is an explicit act, never implied by recording.
    notifiedAt: date("notified_at", { mode: "string" }),
    notifiedBy: text("notified_by"),
    notifiedTo: text("notified_to"),
    notificationRef: text("notification_ref"),
    // notified_at + project default correction period; printed as
    // "computed — confirm with contract".
    correctionDue: date("correction_due", { mode: "string" }),
    status: text("status").notNull().default("open"),
    // { disputed?, access_blocked?, awaiting_test? } each { reason, since, by }
    flags: jsonb("flags").notNull().default({}),
    nextAction: text("next_action"),
    nextActionOwner: text("next_action_owner"),
    nextActionDue: date("next_action_due", { mode: "string" }),
    firstVisitId: uuid("first_visit_id").references(() => inspectionVisits.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
    // Who marked Ready for review — the verifier must be someone else.
    readyMarkedBy: uuid("ready_marked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    // accepted_as_is / void need a reference and an authorised actor.
    dispositionRef: text("disposition_ref"),
    dispositionBy: uuid("disposition_by").references(() => users.id, {
      onDelete: "set null",
    }),
    dispositionAt: timestamp("disposition_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    unique("inspection_items_project_seq_unique").on(t.projectId, t.seq),
    unique("inspection_items_project_ref_unique").on(t.projectId, t.ref),
    index("inspection_items_project_status_idx").on(t.projectId, t.status),
    index("inspection_items_project_location_idx").on(t.projectId, t.locationSort),
    index("inspection_items_project_first_visit_idx").on(t.projectId, t.firstVisitId),
    check(
      "inspection_items_type_check",
      sql.raw(`${t.type.name} IN (${quotedList(INSPECTION_ITEM_TYPES)})`)
    ),
    check(
      "inspection_items_status_check",
      sql.raw(`${t.status.name} IN (${quotedList(INSPECTION_ITEM_STATUSES)})`)
    ),
    check(
      "inspection_items_location_scheme_check",
      sql.raw(`${t.locationScheme.name} IN (${quotedList(LOCATION_SCHEMES)})`)
    ),
  ]
).enableRLS();

export const inspectionItemEvents = pgTable(
  "inspection_item_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inspectionItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id").references(() => inspectionVisits.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id),
    kind: text("kind").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    evidenceIds: jsonb("evidence_ids"),
    clientAt: timestamp("client_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inspection_item_events_item_created_idx").on(t.itemId, t.createdAt),
    index("inspection_item_events_visit_idx").on(t.visitId),
    check(
      "inspection_item_events_kind_check",
      sql.raw(`${t.kind.name} IN (${quotedList(INSPECTION_EVENT_KINDS)})`)
    ),
  ]
).enableRLS();

export const inspectionItemPhotos = pgTable(
  "inspection_item_photos",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => inspectionItems.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    unique("inspection_item_photos_item_evidence_unique").on(t.itemId, t.evidenceId),
    index("inspection_item_photos_evidence_idx").on(t.evidenceId),
    check(
      "inspection_item_photos_role_check",
      sql.raw(`${t.role.name} IN (${quotedList(INSPECTION_PHOTO_ROLES)})`)
    ),
  ]
).enableRLS();

export const inspectionVisitsRelations = relations(inspectionVisits, ({ one, many }) => ({
  project: one(projects, { fields: [inspectionVisits.projectId], references: [projects.id] }),
  creator: one(users, { fields: [inspectionVisits.createdBy], references: [users.id] }),
  events: many(inspectionItemEvents),
}));

export const inspectionItemsRelations = relations(inspectionItems, ({ one, many }) => ({
  project: one(projects, { fields: [inspectionItems.projectId], references: [projects.id] }),
  creator: one(users, { fields: [inspectionItems.createdBy], references: [users.id] }),
  responsibleUser: one(users, {
    fields: [inspectionItems.responsibleUserId],
    references: [users.id],
    relationName: "inspectionItemResponsible",
  }),
  verifier: one(users, {
    fields: [inspectionItems.verifiedBy],
    references: [users.id],
    relationName: "inspectionItemVerifier",
  }),
  firstVisit: one(inspectionVisits, {
    fields: [inspectionItems.firstVisitId],
    references: [inspectionVisits.id],
  }),
  events: many(inspectionItemEvents),
  photos: many(inspectionItemPhotos),
}));

export const inspectionItemEventsRelations = relations(inspectionItemEvents, ({ one }) => ({
  item: one(inspectionItems, {
    fields: [inspectionItemEvents.itemId],
    references: [inspectionItems.id],
  }),
  visit: one(inspectionVisits, {
    fields: [inspectionItemEvents.visitId],
    references: [inspectionVisits.id],
  }),
  actor: one(users, { fields: [inspectionItemEvents.actorId], references: [users.id] }),
}));

export const inspectionItemPhotosRelations = relations(inspectionItemPhotos, ({ one }) => ({
  item: one(inspectionItems, {
    fields: [inspectionItemPhotos.itemId],
    references: [inspectionItems.id],
  }),
  evidence: one(evidence, {
    fields: [inspectionItemPhotos.evidenceId],
    references: [evidence.id],
  }),
}));

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const insertOrganisationSchema = createInsertSchema(organisations);
export const selectOrganisationSchema = createSelectSchema(organisations);

export const insertProjectSchema = createInsertSchema(projects, {
  name: z.string().min(1, "Project name is required"),
});
export const selectProjectSchema = createSelectSchema(projects);

export const insertTaskSchema = createInsertSchema(tasks, {
  name: z.string().min(1, "Task name is required"),
  progressPct: z.number().min(0).max(100).optional(),
});
export const selectTaskSchema = createSelectSchema(tasks);

export const insertEvidenceSchema = createInsertSchema(evidence);
export const selectEvidenceSchema = createSelectSchema(evidence);

// ─── Commercial register (package 4) ────────────────────────────────────────
// EW / CE registers imported from CEMAR CSV exports. Each import REPLACES
// the project's rows of that kind (the CSV is the source of truth); the
// import row keeps the provenance. Additive: progress rows never enter
// this code path unless a register is imported.
export const commercialImports = pgTable(
  "commercial_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'ew' | 'ce'
    filename: text("filename"),
    rowCount: integer("row_count").notNull().default(0),
    importedBy: uuid("imported_by").references(() => users.id),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("commercial_imports_project_idx").on(t.projectId, t.importedAt),
    check("commercial_imports_kind_check", sql.raw(`${t.kind.name} IN ('ew','ce')`)),
  ]
).enableRLS();

export const commercialEvents = pgTable(
  "commercial_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => commercialImports.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // 'ew' | 'ce'
    eventId: integer("event_id"),
    ref: text("ref").notNull(),
    crossRef: text("cross_ref"),
    title: text("title").notNull(),
    fromParty: text("from_party"),
    author: text("author"),
    status: text("status"),
    // EW: Communicated · CE: Notification Date
    notifiedOn: date("notified_on", { mode: "string" }),
    // EW only
    replyDue: date("reply_due", { mode: "string" }),
    replyDate: date("reply_date", { mode: "string" }),
    avoidedOn: date("avoided_on", { mode: "string" }),
    score: integer("score"),
    // CE only
    price: numeric("price", { precision: 14, scale: 2 }),
    days: integer("days"),
    implementedOn: date("implemented_on", { mode: "string" }),
    tba: boolean("tba"),
    ceType: text("ce_type"),
    category: text("category"),
    quotationDue: date("quotation_due", { mode: "string" }),
    assessmentDue: date("assessment_due", { mode: "string" }),
    // Both (CEMAR exports usually redact these to "Content unavailable")
    description: text("description"),
    decision: text("decision"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("commercial_events_project_kind_idx").on(t.projectId, t.kind, t.notifiedOn),
    check("commercial_events_kind_check", sql.raw(`${t.kind.name} IN ('ew','ce')`)),
  ]
).enableRLS();

export const commercialImportsRelations = relations(commercialImports, ({ one, many }) => ({
  project: one(projects, { fields: [commercialImports.projectId], references: [projects.id] }),
  importer: one(users, { fields: [commercialImports.importedBy], references: [users.id] }),
  events: many(commercialEvents),
}));

export const commercialEventsRelations = relations(commercialEvents, ({ one }) => ({
  project: one(projects, { fields: [commercialEvents.projectId], references: [projects.id] }),
  import: one(commercialImports, { fields: [commercialEvents.importId], references: [commercialImports.id] }),
}));
