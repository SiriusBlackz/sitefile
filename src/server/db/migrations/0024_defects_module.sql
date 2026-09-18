ALTER TABLE "projects" ADD COLUMN "defects_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "defects_enabled_by" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_defects_enabled_by_users_id_fk" FOREIGN KEY ("defects_enabled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;