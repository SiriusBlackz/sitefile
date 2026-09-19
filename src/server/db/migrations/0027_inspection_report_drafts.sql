CREATE TABLE "inspection_report_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inspection_report_drafts_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "inspection_report_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inspection_report_drafts" ADD CONSTRAINT "inspection_report_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_report_drafts" ADD CONSTRAINT "inspection_report_drafts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;