-- Map any legacy project status values that aren't in the new enum.
-- "completed" was never assigned by code paths but exists in some rows
-- (likely from a removed lifecycle or DB Studio edit). Treat as archived.
UPDATE "projects" SET status = 'archived' WHERE status = 'completed';--> statement-breakpoint

-- Heal stale generating-state rows before the partial unique index goes
-- live. A row has been "generating" for 24h+ has crashed or been
-- abandoned by Inngest — promoting them to failed is safe and unblocks
-- the constraint.
UPDATE "reports" SET status = 'failed'
  WHERE status = 'generating'
    AND created_at < NOW() - INTERVAL '24 hours';--> statement-breakpoint
-- If any project still has more than one "generating" row, keep the most
-- recent and fail the older ones — partial unique requires uniqueness.
UPDATE "reports" SET status = 'failed'
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY project_id ORDER BY created_at DESC
      ) AS rn
      FROM "reports" WHERE status = 'generating'
    ) ranked WHERE rn > 1
  );--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_generating_per_project_idx" ON "reports" USING btree ("project_id") WHERE status = 'generating';--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_report_number_unique" UNIQUE("project_id","report_number");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_type_check" CHECK (type IN ('photo', 'video'));--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_link_method_check" CHECK (link_method IN ('manual', 'ai_suggested', 'auto'));--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_check" CHECK (role IN ('admin', 'member'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK (status IN ('active', 'archived', 'pending_payment', 'payment_failed'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK (status IN ('generating', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK (status IN ('not_started', 'in_progress', 'completed', 'delayed'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('admin', 'member'));