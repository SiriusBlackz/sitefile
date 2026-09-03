ALTER TABLE "projects" ADD COLUMN "working_days" jsonb NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "timezone" text NOT NULL DEFAULT 'Europe/London';--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"author_id" uuid NOT NULL REFERENCES "users"("id"),
	"entry_date" date NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"entered_at" timestamptz,
	"received_at" timestamptz,
	"locked_at" timestamptz,
	"late" boolean NOT NULL DEFAULT false,
	"visitors_count" integer NOT NULL DEFAULT 0,
	"inspections_count" integer NOT NULL DEFAULT 0,
	"toolbox_talk" boolean NOT NULL DEFAULT false,
	"toolbox_topic" text,
	"incidents_count" integer NOT NULL DEFAULT 0,
	"safety_note" text,
	"work_note" text,
	"weather" jsonb,
	"provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"amended_at" timestamptz,
	"created_at" timestamptz DEFAULT now(),
	"updated_at" timestamptz DEFAULT now(),
	CONSTRAINT "diary_entries_project_author_date_unique" UNIQUE("project_id","author_id","entry_date"),
	CONSTRAINT "diary_entries_status_check" CHECK (status IN ('draft', 'locked', 'not_filled'))
);--> statement-breakpoint
ALTER TABLE "diary_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diary_entries_project_date_idx" ON "diary_entries" ("project_id","entry_date");--> statement-breakpoint
CREATE INDEX "diary_entries_author_idx" ON "diary_entries" ("author_id");--> statement-breakpoint
CREATE TABLE "diary_work_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL REFERENCES "diary_entries"("id") ON DELETE CASCADE,
	"task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"provenance" text NOT NULL,
	"confirmed" boolean NOT NULL DEFAULT false,
	"evidence_ids" jsonb,
	"sort_order" integer NOT NULL DEFAULT 0,
	CONSTRAINT "diary_work_lines_source_check" CHECK (source IN ('photo_link', 'manual', 'carried')),
	CONSTRAINT "diary_work_lines_provenance_check" CHECK (provenance IN ('auto', 'carried', 'edited', 'you'))
);--> statement-breakpoint
ALTER TABLE "diary_work_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diary_work_lines_entry_idx" ON "diary_work_lines" ("entry_id");--> statement-breakpoint
CREATE TABLE "diary_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL REFERENCES "diary_entries"("id") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"label" text NOT NULL DEFAULT '',
	"qty" real NOT NULL DEFAULT 0,
	"note" text,
	"provenance" text NOT NULL,
	CONSTRAINT "diary_resources_entry_kind_label_unique" UNIQUE("entry_id","kind","label"),
	CONSTRAINT "diary_resources_kind_check" CHECK (kind IN ('labour', 'plant', 'materials')),
	CONSTRAINT "diary_resources_provenance_check" CHECK (provenance IN ('auto', 'carried', 'edited', 'you'))
);--> statement-breakpoint
ALTER TABLE "diary_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "diary_holdups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"author_id" uuid NOT NULL REFERENCES "users"("id"),
	"task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
	"cause" text NOT NULL,
	"note" text,
	"evidence_id" uuid REFERENCES "evidence"("id") ON DELETE SET NULL,
	"status" text NOT NULL DEFAULT 'open',
	"started_on" date NOT NULL,
	"closed_on" date,
	"created_at" timestamptz DEFAULT now(),
	CONSTRAINT "diary_holdups_cause_check" CHECK (cause IN ('weather', 'awaiting_information', 'no_access', 'labour_shortage', 'materials_delay', 'plant_breakdown', 'design_change', 'rework', 'other')),
	CONSTRAINT "diary_holdups_status_check" CHECK (status IN ('open', 'closed'))
);--> statement-breakpoint
ALTER TABLE "diary_holdups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diary_holdups_project_status_idx" ON "diary_holdups" ("project_id","status");--> statement-breakpoint
CREATE INDEX "diary_holdups_project_started_idx" ON "diary_holdups" ("project_id","started_on");--> statement-breakpoint
CREATE TABLE "diary_holdup_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holdup_id" uuid NOT NULL REFERENCES "diary_holdups"("id") ON DELETE CASCADE,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"entry_id" uuid REFERENCES "diary_entries"("id") ON DELETE SET NULL,
	"reported_by" uuid NOT NULL REFERENCES "users"("id"),
	"occurred_on" date NOT NULL,
	"hours_lost" real NOT NULL,
	"note" text,
	"logged_at" timestamptz NOT NULL,
	"received_at" timestamptz NOT NULL DEFAULT now(),
	"provenance" text NOT NULL DEFAULT 'you',
	CONSTRAINT "diary_holdup_days_holdup_date_unique" UNIQUE("holdup_id","occurred_on"),
	CONSTRAINT "diary_holdup_days_provenance_check" CHECK (provenance IN ('auto', 'carried', 'edited', 'you'))
);--> statement-breakpoint
ALTER TABLE "diary_holdup_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diary_holdup_days_project_date_idx" ON "diary_holdup_days" ("project_id","occurred_on");--> statement-breakpoint
CREATE TABLE "diary_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid REFERENCES "diary_entries"("id") ON DELETE CASCADE,
	"holdup_id" uuid REFERENCES "diary_holdups"("id") ON DELETE CASCADE,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"actor_id" uuid REFERENCES "users"("id"),
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"client_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "diary_events_kind_check" CHECK (kind IN ('created', 'submitted', 'auto_locked', 'amended', 'holdup_logged', 'holdup_updated', 'holdup_closed'))
);--> statement-breakpoint
ALTER TABLE "diary_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "diary_events_entry_idx" ON "diary_events" ("entry_id");--> statement-breakpoint
CREATE INDEX "diary_events_project_created_idx" ON "diary_events" ("project_id","created_at");