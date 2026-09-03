ALTER TABLE "project_members" DROP CONSTRAINT "project_members_role_check";--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_check" CHECK (role IN ('admin', 'member', 'site_manager', 'project_manager', 'construction_manager', 'quantity_surveyor', 'supervisor'));--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "approval_chain" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "approval_state" jsonb;