ALTER TABLE "diary_entries" ADD COLUMN "contractors" jsonb;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "planned_works" text;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD COLUMN "next_day_impact" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "diary_extras" jsonb DEFAULT '{}'::jsonb NOT NULL;