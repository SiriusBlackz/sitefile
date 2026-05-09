/**
 * Server-side environment variable validation. Importing this module
 * validates `process.env` at boot — misconfigured deploys fail loudly
 * rather than crashing later inside an unrelated request.
 *
 * Always reach for the typed `env` export in new code. Existing
 * `process.env.X` reads are still valid (Node populates the same global
 * regardless), but they bypass the type narrowing and the boot-time check.
 *
 * Pre-existing call sites are intentionally left untouched — refactoring
 * all ~25 of them at once is churn for no behaviour change. Convert them
 * opportunistically when you're already editing the file.
 *
 * The corresponding browser-side schema lives in `env-client.ts`.
 */

import { z } from "zod";

const isProd =
  process.env.NODE_ENV === "production" && !process.env.VERCEL_URL?.includes("preview");

const envSchema = z.object({
  // Always required for the app to function.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Clerk: required for auth. Webhook secret only required if you've
  // wired the webhook (some dev environments skip it).
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),

  // R2 / Cloudflare: optional in dev (local fallback writes to /tmp or
  // .local-uploads). All four must be set together; storage.ts treats
  // partial config as "not configured" via isR2Configured().
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Anthropic: required for AI link suggestions and PDF programme import.
  ANTHROPIC_API_KEY: z.string().optional(),

  // Inngest: required only when running background jobs through Vercel.
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Stripe: optional in DEMO_MODE; required for billing.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),

  // Report download token signing. Falls back to CLERK_SECRET_KEY at use
  // time if unset; declaring it here so a deliberate rotation is possible
  // without taking Clerk down.
  REPORT_TOKEN_SECRET: z.string().optional(),

  // Vercel Cron secret. Set in Vercel project settings; Vercel injects it
  // as `Authorization: Bearer ${CRON_SECRET}` on cron-triggered requests.
  // Optional — if unset, the cron route accepts any caller (fine for dev,
  // not for production).
  CRON_SECRET: z.string().optional(),

  // Demo mode flag — accepts the literal "true". Anything else is treated
  // as not-demo by the call sites.
  DEMO_MODE: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  VERCEL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    const message = Object.entries(issues)
      .map(([key, errs]) => `  - ${key}: ${(errs ?? []).join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}`);
  }

  // Sanity warning — if Stripe is half-configured it'll explode at request
  // time. Surface it at boot in production only (dev intentionally allows
  // partial config to support working on non-billing features).
  if (isProd) {
    const stripeKeys = [
      parsed.data.STRIPE_SECRET_KEY,
      parsed.data.STRIPE_WEBHOOK_SECRET,
      parsed.data.STRIPE_PRICE_ID,
    ];
    const stripeSet = stripeKeys.filter(Boolean).length;
    if (stripeSet > 0 && stripeSet < stripeKeys.length) {
      throw new Error(
        "Stripe env vars are partially configured. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_ID together."
      );
    }
  }

  return parsed.data;
}

export const env: Env = loadEnv();
