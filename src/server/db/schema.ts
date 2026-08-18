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
  // Programme-as-living-document ritual: stamped by programme import and
  // by the per-period "no change this period" confirmation.
  programmeConfirmedAt: timestamp("programme_confirmed_at", {
    withTimezone: true,
    mode: "date",
  }),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  status: text("status").default("active"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("projects_org_id_idx").on(t.orgId),
  index("projects_status_idx").on(t.status),
  check(
    "projects_status_check",
    sql.raw(`${t.status.name} IN (${quotedList(PROJECT_STATUSES)})`)
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
  status: text("status").default("generating"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
}, (t) => [
  index("reports_project_id_idx").on(t.projectId),
  // Two reports in the same project must not share a report number — makes
  // the MAX+1 race in report.generate fail at the DB level instead of
  // creating duplicate-numbered rows.
  unique("reports_project_report_number_unique").on(
    t.projectId,
    t.reportNumber
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
