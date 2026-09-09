CREATE TABLE "inspection_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"visit_id" uuid,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"evidence_ids" jsonb,
	"client_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_item_events_kind_check" CHECK (kind IN ('created', 'updated', 'status_change', 'not_accepted', 'flag_set', 'flag_cleared', 'photo_added', 'notified', 'reopened', 'disposition'))
);
--> statement-breakpoint
ALTER TABLE "inspection_item_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inspection_item_photos" (
	"item_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inspection_item_photos_item_evidence_unique" UNIQUE("item_id","evidence_id"),
	CONSTRAINT "inspection_item_photos_role_check" CHECK (role IN ('defect', 'during', 'rectified', 'verified'))
);
--> statement-breakpoint
ALTER TABLE "inspection_item_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inspection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"ref" text NOT NULL,
	"type" text DEFAULT 'defect' NOT NULL,
	"title" text NOT NULL,
	"finding" text NOT NULL,
	"suspected_cause" text,
	"acceptance_basis" text,
	"interim_action" text,
	"access_note" text,
	"location_scheme" text NOT NULL,
	"location" jsonb NOT NULL,
	"location_sort" text,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" real,
	"category" text,
	"priority" text,
	"responsible_org" text,
	"responsible_user_id" uuid,
	"repair_target" date,
	"notified_at" date,
	"notified_by" text,
	"notified_to" text,
	"notification_ref" text,
	"correction_due" date,
	"status" text DEFAULT 'open' NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_action" text,
	"next_action_owner" text,
	"next_action_due" date,
	"first_visit_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"ready_marked_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"disposition_ref" text,
	"disposition_by" uuid,
	"disposition_at" timestamp with time zone,
	CONSTRAINT "inspection_items_project_seq_unique" UNIQUE("project_id","seq"),
	CONSTRAINT "inspection_items_project_ref_unique" UNIQUE("project_id","ref"),
	CONSTRAINT "inspection_items_type_check" CHECK (type IN ('defect', 'snag', 'outstanding_work', 'observation')),
	CONSTRAINT "inspection_items_status_check" CHECK (status IN ('open', 'in_progress', 'ready_for_review', 'verified_closed', 'reopened', 'accepted_as_is', 'void')),
	CONSTRAINT "inspection_items_location_scheme_check" CHECK (location_scheme IN ('building', 'linear', 'grid'))
);
--> statement-breakpoint
ALTER TABLE "inspection_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inspection_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text DEFAULT 'defects' NOT NULL,
	"stage" text NOT NULL,
	"visit_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"weather" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_note" text,
	"method_line" text,
	"not_inspected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgent_concerns" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inspection_visits_project_date_stage_unique" UNIQUE("project_id","visit_date","stage"),
	CONSTRAINT "inspection_visits_kind_check" CHECK (kind IN ('defects')),
	CONSTRAINT "inspection_visits_stage_check" CHECK (stage IN ('initial_walkthrough', 'interim_reinspection', 'end_of_defects_period'))
);
--> statement-breakpoint
ALTER TABLE "inspection_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "project_type" text DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_form" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_correction_period_days" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "location_scheme" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "priority_scheme" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_dates" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "report_kind" text DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_item_events" ADD CONSTRAINT "inspection_item_events_item_id_inspection_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inspection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_events" ADD CONSTRAINT "inspection_item_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_events" ADD CONSTRAINT "inspection_item_events_visit_id_inspection_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."inspection_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_events" ADD CONSTRAINT "inspection_item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_photos" ADD CONSTRAINT "inspection_item_photos_item_id_inspection_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inspection_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_photos" ADD CONSTRAINT "inspection_item_photos_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_item_photos" ADD CONSTRAINT "inspection_item_photos_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_first_visit_id_inspection_visits_id_fk" FOREIGN KEY ("first_visit_id") REFERENCES "public"."inspection_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_ready_marked_by_users_id_fk" FOREIGN KEY ("ready_marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_disposition_by_users_id_fk" FOREIGN KEY ("disposition_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_visits" ADD CONSTRAINT "inspection_visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_visits" ADD CONSTRAINT "inspection_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_item_events_item_created_idx" ON "inspection_item_events" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "inspection_item_events_visit_idx" ON "inspection_item_events" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "inspection_item_photos_evidence_idx" ON "inspection_item_photos" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "inspection_items_project_status_idx" ON "inspection_items" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "inspection_items_project_location_idx" ON "inspection_items" USING btree ("project_id","location_sort");--> statement-breakpoint
CREATE INDEX "inspection_items_project_first_visit_idx" ON "inspection_items" USING btree ("project_id","first_visit_id");--> statement-breakpoint
CREATE INDEX "inspection_visits_project_date_idx" ON "inspection_visits" USING btree ("project_id","visit_date");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_type_check" CHECK (project_type IN ('progress', 'inspection', 'condition_survey'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_form_check" CHECK (contract_form IS NULL OR contract_form IN ('nec4_ecc', 'nec3_ecc', 'jct', 'other'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_location_scheme_check" CHECK (location_scheme IS NULL OR location_scheme IN ('building', 'linear', 'grid'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_report_kind_check" CHECK (report_kind IN ('progress', 'inspection', 'condition_survey'));