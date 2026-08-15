CREATE TABLE "report_share_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"event" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "report_share_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"token" text NOT NULL,
	"recipient_label" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"revoked_at" timestamp with time zone,
	CONSTRAINT "report_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "report_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_report_due" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "programme_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_share_events" ADD CONSTRAINT "report_share_events_share_id_report_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."report_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_share_events_share_id_idx" ON "report_share_events" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "report_shares_report_id_idx" ON "report_shares" USING btree ("report_id");