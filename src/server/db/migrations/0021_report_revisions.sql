ALTER TABLE "reports" DROP CONSTRAINT "reports_project_report_number_unique";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "supersedes_report_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_report_number_unique" UNIQUE("project_id","report_number","revision");