CREATE TABLE "commercial_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"import_id" uuid,
	"kind" text NOT NULL,
	"event_id" integer,
	"ref" text NOT NULL,
	"cross_ref" text,
	"title" text NOT NULL,
	"from_party" text,
	"author" text,
	"status" text,
	"notified_on" date,
	"reply_due" date,
	"reply_date" date,
	"avoided_on" date,
	"score" integer,
	"price" numeric(14, 2),
	"days" integer,
	"implemented_on" date,
	"tba" boolean,
	"ce_type" text,
	"category" text,
	"quotation_due" date,
	"assessment_due" date,
	"description" text,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "commercial_events_kind_check" CHECK (kind IN ('ew','ce'))
);
--> statement-breakpoint
ALTER TABLE "commercial_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commercial_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "commercial_imports_kind_check" CHECK (kind IN ('ew','ce'))
);
--> statement-breakpoint
ALTER TABLE "commercial_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_events" ADD CONSTRAINT "commercial_events_import_id_commercial_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."commercial_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_imports" ADD CONSTRAINT "commercial_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_imports" ADD CONSTRAINT "commercial_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_events_project_kind_idx" ON "commercial_events" USING btree ("project_id","kind","notified_on");--> statement-breakpoint
CREATE INDEX "commercial_imports_project_idx" ON "commercial_imports" USING btree ("project_id","imported_at");