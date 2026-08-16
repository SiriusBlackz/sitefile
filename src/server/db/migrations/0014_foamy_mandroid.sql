CREATE TABLE "programme_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now(),
	"source" text DEFAULT 'first-import' NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "programme_baselines_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "programme_baselines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programme_baselines" ADD CONSTRAINT "programme_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programme_baselines" ADD CONSTRAINT "programme_baselines_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;