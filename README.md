# Sitefile

> Contractor Progress Evidence Tracker. Capture site photos on a phone, link them to programme tasks, generate branded password-protected progress reports.

**Workflow.** Capture (phone) → Link (AI-assisted) → Report (laptop).
**Pricing.** £99 per project / month.

## What it does

- **Mobile capture (PWA).** Take photos directly in-browser, with EXIF/GPS preservation and an offline IndexedDB queue that auto-uploads when the network returns.
- **Programme import.** MS Project XML, Primavera P6 XML, Excel (with column mapping), and PDF (Claude vision) all map to a hierarchical task tree.
- **Heuristic AI linking.** Suggests evidence → task links from GPS zones, capture time, and recency. No per-call LLM cost.
- **GPS zone editor.** Draw polygons on a Mapbox map; evidence inside a zone gets task-suggested automatically.
- **Branded PDF reports.** 7-page layout (cover, executive summary, programme timeline, evidence gallery, before/after, verification, sign-off). Password-protected downloads via short-lived signed tokens.
- **Audit trail.** Immutable log of every mutation, used in the verification report page.
- **Multi-tenant.** Org → users → projects → project members. Org admins see every project; non-admin members only see what they're added to.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui v4 (Base UI) |
| API | tRPC v11 |
| ORM | Drizzle (postgres-js driver) |
| Database | PostgreSQL (Supabase) |
| Auth | Clerk |
| Storage | Cloudflare R2 (S3-compatible) |
| Background jobs | Inngest |
| PDF | Puppeteer (headless Chromium via @sparticuz/chromium-min on Vercel) |
| Image | Sharp + exifr |
| Maps | Mapbox GL JS |
| Payments | Stripe |
| AI | Claude (Sonnet) — PDF programme import, image-recognition linking |

## Getting started

Prerequisites: Node 20+, pnpm 10+, a Postgres database (Supabase free tier is fine).

```bash
pnpm install
cp .env.example .env.local        # then fill in the required vars below
pnpm db:migrate                   # run drizzle migrations against DATABASE_URL
pnpm dev                          # start at http://localhost:3000
```

### Minimum env vars to boot

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The full set lives in [`CLAUDE.md`](./CLAUDE.md). Validation is centralised in `src/lib/env.ts` (server) and `src/lib/env-client.ts` (browser) — a misconfigured deploy fails at boot rather than inside an unrelated request.

### Demo / dev mode (no R2, no Stripe)

If R2 isn't configured, uploads fall back to `/tmp/uploads` (Vercel) or `.local-uploads/` (local). If `STRIPE_SECRET_KEY` isn't set, projects are created `active` immediately and never hit Checkout. Both modes route through the same auth-checked `/api/uploads/[...path]` and `/api/reports/[id]/pdf` handlers as production, so dev exercises the production code paths.

`DEMO_MODE=true` additionally treats `pending_payment` projects as `active` for display.

## Project structure

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Clerk sign-in/up
│   ├── (dashboard)/          # Org + project workspace
│   ├── (mobile)/capture/     # PWA capture + review
│   └── api/                  # Webhooks, tRPC, uploads, reports
├── server/
│   ├── db/                   # Drizzle schema, migrations, shared enums
│   ├── trpc/                 # Routers (project/task/evidence/zone/report/dashboard)
│   ├── services/             # Storage, AI linker, programme import,
│   │                         # report generator, audit, report tokens
│   └── inngest/functions/    # process-upload, generate-report
├── components/               # UI (ui/, layout/, evidence/, reports/, ...)
├── lib/                      # env, trpc client, offline queue + processor
└── types/
```

## Common tasks

| Task | Command |
|---|---|
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Build | `pnpm build` (needs network during the `next/font` Geist fetch) |
| Generate migration | `pnpm db:generate` (writes to `src/server/db/migrations/`) |
| Apply migrations | `pnpm db:migrate` |
| Drizzle Studio | `pnpm db:studio` |
| Seed dev data | `pnpm db:seed` (or `pnpm db:seed:demo` for demo mode) |
| Smoke test | `pnpm smoke` |

## Deploy

Hosted on Vercel.

- Set every env var from `.env.example` in the Vercel project settings.
- `pnpm-lock.yaml` is the canonical lockfile (npm is not used).
- The `outputFileTracingRoot` in `next.config.ts` pins the workspace root so Turbopack doesn't infer a parent directory.
- Inngest runs background jobs (thumbnail processing, PDF generation). Wire the `INNGEST_*` env vars and the Inngest UI to the deployed `/api/inngest` route.
- Clerk webhook → `/api/webhooks/clerk` (uses svix signature verification, retries on 5xx).
- Stripe webhook → `/api/webhooks/stripe`.

## Architecture notes

- **Evidence is never served from a public R2 URL.** Every read goes through `/api/uploads/[...path]`, which re-checks auth + project membership. The `R2_PUBLIC_URL` env var is *not* used as a CDN endpoint.
- **PDF reports use inline base64 images.** Puppeteer has no Clerk session, so `getInlineDataUrl` reads the bytes server-side and embeds them in the rendered HTML.
- **Report downloads use HMAC-signed tokens** (60s TTL, bound to user + report). The password is validated by `report.download` and never appears in the URL.
- **CHECK constraints + shared TS literal unions.** Status/role/type columns are enforced at the DB layer (`src/server/db/enums.ts` is the single source of truth, consumed by both Drizzle defaults and Zod schemas).
- **Report numbers + in-flight reports** are protected by unique indexes — race-prone application logic was replaced with insert-then-catch-23505.
- **Offline capture** uses IndexedDB blobs (no sessionStorage size cliff). The processor is single-flight and triggered by `online` / SW background sync / `visibilitychange` / mount.
- **Audit logging is fire-and-forget** by design (UX latency > marginal compliance gain). Failures emit a structured JSON log line and call any registered reporter (set via `setAuditFailureReporter`).

See [`CLAUDE.md`](./CLAUDE.md) for the full design spec, including the database schema and tRPC API surface.

## Reporting issues

Open an issue with the structured-log line for any audit failure (`type=audit_failure`) plus reproduction steps.
