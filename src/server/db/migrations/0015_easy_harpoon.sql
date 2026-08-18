ALTER TABLE "organisations" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
-- Existing orgs predate the setup wizard — backfill so nobody already
-- using the product gets trapped in /onboarding.
UPDATE "organisations" SET "onboarding_completed_at" = now();