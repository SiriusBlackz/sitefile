/**
 * Browser-side environment variable validation. Only NEXT_PUBLIC_* vars
 * are inlined into the client bundle, so this is the only thing the
 * browser can see. Importing this module validates them at module load.
 */

import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// Next.js inlines NEXT_PUBLIC_* at build time, but only the literal
// references — destructuring `process.env` doesn't survive the inlining.
// So we list each var explicitly here.
const raw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
};

const parsed = clientSchema.safeParse(raw);
if (!parsed.success) {
  const issues = parsed.error.flatten().fieldErrors;
  const message = Object.entries(issues)
    .map(([key, errs]) => `  - ${key}: ${(errs ?? []).join(", ")}`)
    .join("\n");
  throw new Error(`Invalid client environment variables:\n${message}`);
}

export const clientEnv: ClientEnv = parsed.data;
