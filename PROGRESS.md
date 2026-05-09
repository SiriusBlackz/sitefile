# Sitefile (formerly SiteProof) — Progress Log

## Completed Phases

### Phase 1 — Core Loop ✅
1. **Scaffold** — Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui v4 (Base UI), Clerk, Drizzle ORM, tRPC v11, postgres.js
2. **Database schema** — 11 tables (organisations, users, projects, projectMembers, tasks, gpsZones, evidence, evidenceLinks, reports, auditLog), relations, Zod schemas, initial migration
3. **Project CRUD** — list, get, create, update, archive with org-scoped queries
4. **Task list CRUD** — tree hierarchy with sortOrder, add/edit/delete/reorder, parent-child with depth rendering
5. **Evidence upload** — R2 presigned URLs with local file fallback, client-side EXIF extraction (exifr), XHR upload progress, upload queue component
6. **Evidence gallery** — responsive grid, cursor-based pagination, filters (task, date range), infinite scroll
7. **Manual task linking** — evidence-to-task link/unlink via Select dropdown, linked task badges on cards

### Phase 2 — Intelligence ✅
8. **GPS zone map editor** — Mapbox GL + Draw plugin (dynamic import, SSR disabled), polygon drawing, zone CRUD, default task per zone, stub page if no Mapbox token
9. **AI task suggestion** — heuristic scoring: GPS zone match (50pts), time overlap (30pts), recency (20pts), confidence badges in task linker
10. **MS Project XML import** — fast-xml-parser, auto-detect MS Project vs P6 format, preview before import, hierarchical task creation in transaction

### Phase 3 — Reports ✅
11. **Report HTML templates** — 7 pages with inline styles for Puppeteer: cover, executive summary, Gantt timeline with evidence markers, evidence gallery grouped by task, before/after comparison, verification metrics, sign-off
12. **PDF generation** — Puppeteer headless Chromium, renderToStaticMarkup, Inngest background job with sync fallback
13. **Report management** — generate dialog (period + optional password), report list with status badges, password-verified download
14. **Before/after pairing** — auto-match earliest + latest evidence per task per GPS zone

### Phase 4 — Polish ✅ (except Stripe)
15. **PWA setup** — manifest.json, service worker (network-first nav, cache-first static), IndexedDB offline queue, usePWA hook (online status + install prompt), PWA meta tags
16. **Mobile capture flow** — full-screen camera with flash/switch/GPS/haptic, batch photo review with per-photo task linking + notes, XHR upload progress, offline IndexedDB fallback
17. **Stripe integration** — Checkout flow, webhook handler, billing banner, portal session, dev bypass (coded, uncommitted)
18. **Audit log UI** — chronological feed with user avatars, action badges, filters (action type, date), CSV export
19. **Gantt chart** ✅ — interactive standalone view on tasks page with list/gantt toggle, zoom (months/weeks/days), evidence markers, today line, progress bars, tooltips

### Phase 5 — Security & Launch Hardening ✅
20. **Auth on all endpoints** — all 26 tRPC endpoints switched to protectedProcedure, assertProjectAccess() verifies org ownership
21. **Audit logging wired** — writeAuditLog() called in 14 mutations across all 6 routers (create/update/delete/link/unlink/upload/import/generate)
22. **Dashboard stats** — stats cards (projects, tasks, evidence, completion %), recent activity feed from audit log, delayed tasks alert

### Phase 6 — 360 Review & Hardening ✅ (2026-04-05)

#### Security Hardening
23. **DEMO_MODE production guard** — `isDemoMode()` returns false + logs warning when NODE_ENV=production
24. **Auth gap fixes** — task.update, zone.update, zone.delete always throw NOT_FOUND before assertProjectAccess (was skipping on null)
25. **SQL injection fix** — raw SQL in evidence.bulkLink replaced with Drizzle `inArray()`
26. **Error standardisation** — all `throw new Error()` replaced with `TRPCError` + proper HTTP codes across all routers
27. **Security headers** — middleware sets X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy
28. **bcrypt passwords** — report password hashing switched from unsalted SHA-256 to bcrypt (10 rounds)
29. **Rate limiting** — per-IP rate limit (20/min) on /api/upload with Retry-After header

#### Workflow Fixes
30. **Clerk webhook** — `/api/webhooks/clerk` handles user.created/user.updated with svix signature verification
31. **process-upload Inngest** — thumbnail generation (sharp 400x400 JPEG) triggered from evidence.confirm
32. **Report sync fallback removed** — fails immediately if Inngest unavailable (was risking 504 timeouts)
33. **Report query optimisation** — evidence filtered by period at DB level (was loading all into memory)
34. **Report failure recovery** — onFailure handler marks report as "failed" after 3 retries (was 1 retry, no failure status)

#### UX Improvements
35. **Camera permission handling** — detects PermissionDeniedError/NotFoundError with specific messages + retry button
36. **Accessibility** — ARIA labels on all icon-only buttons in capture page, video element labelled
37. **Confirmation dialogs** — alert-dialog for zone delete, toast confirmation for evidence unlink
38. **Dashboard onboarding** — empty state with workflow guide (Capture → Link → Report) when no projects exist
39. **Project sub-navigation** — tabbed nav (Overview/Tasks/Evidence/Zones/Reports/Settings) on all project pages

#### Performance & Logic
40. **Report idempotency** — rejects generation if another report already "generating" for same project
41. **AI linker improvements** — minimum 0.4 confidence threshold, uses actualStart/actualEnd when available

#### Report Quality (7/10 → 9/10)
42. **Data integrity** — before/after pairs filtered by period (was all-time), verification stats scoped to period
43. **Uploader info** — gallery shows uploader name + role (was null TODO)
44. **Audit trail** — verification page populated from auditLog with user names (was empty TODO)
45. **Cover page** — client name shown when available
46. **Table of contents** — page 2 with section names, dotted leaders, accurate page numbers
47. **Template polish** — footer safe zone (24mm padding), notes word-wrapped, system font stack, empty sections skip blank pages
48. **Page breaks** — page-break-inside:avoid on evidence cards and before-after pairs
49. **Thumbnails** — gallery uses thumbnailKey when available (reduces PDF size)
50. **Digital signatures** — sign-off blocks accept typed signatures with green "Digitally Signed" badge

### Phase 7 — Beta-Test Review ✅ (2026-04-11)

Comprehensive review against `betatest.md` (consolidated security /
correctness / architecture pass). Static analysis → runtime walkthrough
→ deployed. **7 commits, all live in production.**

#### Phase A — Security hardening (`a46aa19`)

51. **Sibling access helpers** — `assertTaskInProject`,
    `assertEvidenceInProject`, `assertZoneInProject` in
    `src/server/trpc/helpers.ts`. Wired into every mutation that takes a
    related ID (`evidence.link/bulkLink`, `task.create/update/reorder`,
    `zone.create/update`). Closed cross-project ID-juggling holes.
52. **Task cycle / self-parent guards** — `task.update` walks ancestors
    to detect cycles, rejects self-parenting.
53. **`task.reorder` project-scoped predicate** — pre-validates every
    referenced ID belongs to the project, scopes UPDATE clauses with
    `and(eq(id), eq(projectId))`.
54. **PDF route lockdown** —
    `src/app/api/reports/[id]/pdf/route.ts` now requires resolved user +
    project access + `status === "completed"`, and bcrypt-compares the
    password if `passwordHash` is set. Streams PDF bytes through the
    auth handler instead of serving via filesystem path.
55. **Generic `/api/uploads/[...path]` lockdown** — strict canonical
    path shape, refuses anything under `projects/*/reports/` (forces
    PDF downloads through dedicated route), requires auth + project
    access via `assertProjectAccess`.
56. **`upload_intents` table** (migration `0002_known_prowler.sql`) —
    `evidence.getUploadUrl` records an intent; `evidence.confirm` and
    `/api/upload` verify the storage key was minted for the same
    user+project, single-use, with 1h expiry. Closes the upload trust
    boundary that previously trusted client-supplied keys.
57. **Local `/api/upload` fallback hardening** — auth + intent lookup
    + project access check.
58. **Report password cleanup** — stripped plaintext password from
    Inngest event payload, removed unused `password` parameter from
    `htmlToPdf`, renamed UI copy "PDF password" → "Download password"
    with honest caveat ("does not encrypt the file itself").
59. **Safe production tRPC error formatter** — strips `cause`/stack
    from non-dev responses, replaces generic 500 messages with a
    static safe string. Logs full details server-side only.
60. **Deterministic demo mode** — new `lookupDemoUser` that does NOT
    auto-provision; throws `DemoNotSeededError` if seed missing. Plus
    `scripts/seed-demo.ts` for idempotent demo org/users seeding.
    Shared `resolveCurrentUser` factored out so tRPC context and route
    handlers use one identity path.

#### Phase B — Polish + deps (`d843134`)

61. **Dependency upgrades** — `next 16.2.1 → 16.2.3` (DoS advisory),
    `drizzle-orm ^0.45.1 → ^0.45.2` (SQL identifier injection
    advisory). `pnpm audit --prod` is clean after the bumps.
62. **`evidence.count` tRPC procedure** — replaces the `1+` placeholder
    on the project overview page with a real count.
63. **Task list a11y** — controls always visible on touch /
    `md:opacity-0 md:group-hover:opacity-100` on desktop, plus
    `aria-label` on every move/edit/delete button.
64. **`scripts/smoke.ts`** — end-to-end smoke that creates two
    projects via tRPC callers, asserts cross-project evidence linking
    is rejected with FORBIDDEN, queues a report, optionally hits
    `/api/reports/[id]/pdf` anonymously to assert 401 when
    `SMOKE_BASE_URL` is set. `pnpm smoke`.

#### Runtime walkthrough fixes (`491082e`)

65. **Local-dev auth bypass closed** — `getPublicUrl` was returning
    plain `/uploads/...` paths in local dev which Next served
    statically from `public/uploads/`, bypassing the entire Phase A
    PDF lockdown. All non-R2 writes now go to `.local-uploads/`
    (gitignored) and `getPublicUrl` always routes through
    `/api/uploads/`. Cleaned up the leaked `public/uploads/projects/`
    tree. Production was unaffected (writes to `/tmp`) but dev testing
    was missing the hardened path.
66. **`audit_log` cascade** (migration `0003_sweet_justice.sql`) —
    `audit_log.project_id` had no `ON DELETE` action, blocking project
    deletion. Now `ON DELETE CASCADE` on project, `SET NULL` on
    user_id.
67. **`report.generate` error surfacing** — was swallowing Inngest
    failures, returning the report row as if everything was fine.
    Now throws a TRPCError so the client knows.
68. **Inngest placeholder fallback** — client now treats
    `INNGEST_EVENT_KEY=PLACEHOLDER` (or any value <12 chars) as unset,
    so `INNGEST_DEV=1` mode kicks in for local dev without manual env
    surgery.

#### Final P0s + transactional bug (`bd16a18`)

69. **Stripe webhook idempotency** (migration `0004_bent_firebrand.sql`) —
    new `stripe_events` table keyed by `event.id`. Webhook handler
    refactored into a single transaction: insert event id with
    `ON CONFLICT DO NOTHING`, throw `DuplicateEventError` if 0 rows
    (returns 200 ack without re-running), otherwise process event in
    the same tx. On any non-duplicate error returns 500 so Stripe
    retries with the rolled-back state. Verified at runtime against
    four scenarios (bogus / valid / replayed / new event id).
70. **`report-list.tsx` setState-in-effect refactor** — was calling
    `setState` in render-phase branches and (after first fix) in
    `useEffect`, both flagged by React 19's
    `react-hooks/set-state-in-effect` rule. Refactored to use
    `trpc.useUtils().report.download.fetch()` as an imperative event
    handler. No `useEffect`, no handled-id ref, no error-message
    string matching inside render.
71. **`writeAuditLog` transactional bug fix** — discovered while
    testing Stripe idempotency. The helper was swallowing its own
    errors with try/catch, which silently corrupted postgres
    transaction semantics: a failing audit insert would abort the tx,
    the helper would catch it, the outer code thought everything was
    fine, Drizzle's COMMIT was silently rolled back, and the route
    returned 200 with **zero rows committed**. Split into:
    - `writeAuditLog(db, entry)` — throws, safe inside a tx
    - `writeAuditLogAsync(db, entry)` — fire-and-forget for tRPC
      mutations that already committed their work
    Migrated all non-tx callers in task / evidence / project / zone /
    report routers to `writeAuditLogAsync`.

#### UX polish + auto-login fix (`798dcb3`)

72. **Demo auto-login fallback closed** — `getDemoUser(null)` was
    defaulting to `contractor-1`, so any API client without the
    `demo_user` cookie got an implicit contractor-1 session. Now
    returns `null`, and `resolveCurrentUser` surfaces it as
    unauthenticated. Verified: `curl /api/trpc/project.list` with no
    cookie now → 401, with bogus cookie → 401, with valid cookie → 200.
73. **`task-form` parent filter walks descendants** — was only
    excluding the task being edited, not its subtree. Server-side
    cycle guard caught it, but the user saw a backend error instead
    of the option being hidden. Now does a fixed-point descendant
    walk on the flat tree.
74. **`task-form` no reset on error** — `handleFormSubmit` was
    calling `reset()` unconditionally, clearing the form on mutation
    failure too. Now relies on the parent closing the dialog (which
    unmounts DialogContent and clears state) on success.
75. **Settings member removal AlertDialog** — single-click trash icon
    used to remove team members with no confirmation. Now uses the
    same `AlertDialog` pattern as task delete, with accessible
    `aria-label`.
76. **Manage Billing button consistency** — replaced inline-styled
    raw `<button>` on the settings page with the shadcn `<Button>`
    component for focus ring + disabled state consistency.
77. **CLAUDE.md doc drift** — corrected `project.members.list` →
    `project.memberList`, `dashboard.projectSummary` →
    `dashboard.summary`. Documented `project.orgUsers`.

#### R2 + reportNumber + sharp (`9aafb96` + `22fdd16`)

78. **Report PDFs now upload to R2** — was writing to `/tmp/uploads`
    which evaporated between Vercel function invocations, silently
    breaking report downloads in production. New `uploadToStorage`
    and `fetchFromStorage` helpers in `storage.ts` switch between R2
    `PutObject` / `GetObject` and `.local-uploads/` based on
    `isR2Configured`. `generate-report.ts` and `process-upload.ts`
    use them; the PDF route and `/api/uploads/` route read via them.
    Report PDFs NEVER hand out a public R2 URL — they always stream
    through the auth+password-aware route.
79. **`reportNumber` race fixed** — `gatherReportData` was recomputing
    `max+1` after the tRPC mutation had already inserted the row, so
    DB row's `reportNumber` and `pdfStorageKey` filename disagreed by
    1. Now Inngest looks up the inserted row's `reportNumber` and
    passes it in via the new `reportNumber` field on
    `GenerateReportInput`.
80. **`sharp` pinned as explicit dep** (`^0.34.5`) — was being pulled
    in transitively via Next.js (which uses it for image
    optimization), and `pnpm` hoisted it locally so dev builds
    passed. Vercel's stricter typecheck failed on
    `let sharp: typeof import("sharp")`. Pinning unblocks the deploy
    and removes the latent fragility.

#### Production deploy

- Deployment ID `dpl_BZPjVdMdzbCrZtR1WKsz9xwhUbLL`
- Stable alias: **https://siteproof-ashy.vercel.app** (the working URL)
- Custom domain `www.siteproof.app` is **still parked at Namecheap** —
  Vercel has the alias registered but DNS doesn't reach Vercel.
- Hash deployment URLs (`siteproof-<hash>-…vercel.app`) have
  Deployment Protection enabled → return 401. Test against the stable
  alias.

#### Production runtime verification (after deploy)

- `siteproof-ashy.vercel.app/api/inngest` → `mode:cloud`,
  `has_event_key:true`, `has_signing_key:true`, `function_count:3` ✓
- Anonymous `project.list` → 401 UNAUTHORIZED "Not signed in" ✓
- Anonymous `/api/reports/<id>/pdf` → 401 "Not signed in" ✓
- `/api/uploads/projects/*/reports/*` → 403 "Use /api/reports/[id]/pdf" ✓

### Phase 8 — Rebrand: SiteProof → Sitefile (in progress, 2026-04-20)

Branch: `rename/sitefile`. Domain `sitefile.app` purchased at Namecheap.
DNS strategy: **registrar @ Namecheap, DNS delegated to Cloudflare** (so
`media.sitefile.app` → R2 is a one-click bind in CF when we want it).

#### Brand checks done before purchase
- Google / LinkedIn / Companies House / trademark — all clean on "Sitefile"
- `.app` picked over `.com` (aftermarket too expensive at this stage)
- Considered and rejected: "LogZeroSite" (awkward, ambiguous)

#### Code rename landed on branch (22 edits, 15 files)
UI brand: `layout.tsx`, `sidebar`, `mobile-nav`, `(dashboard)/page`,
`(auth)/demo/page`, report templates (`cover-page`, `sign-off`).
PWA: `manifest.json`, `sw.js` cache bumped to `sitefile-v1` (forces
client re-cache on deploy), `offline-queue` IndexedDB name.
Email fallbacks: `current-user`, `clerk` webhook, `seed`, `seed-demo`,
`demo.ts`. Meta: `package.json` name, smoke script header. Docs:
`CLAUDE.md`, `PROGRESS.md`. Build passes, 23 routes, zero warnings.

#### Intentionally NOT changed
- R2 bucket `siteproof-media` — env var only, not user-facing;
  bucket rename requires full object migration for zero benefit
- Inngest app `id: "siteproof"` in `src/server/inngest/client.ts` —
  changing requires re-sync + risks orphaning in-flight jobs
- Historical deploy URLs / verification logs in this doc
- `betatest.md` — point-in-time artifact
- On-disk repo folder `siteproof/` — IDE + Vercel link reference it;
  defer until brand cutover is stable

#### Rebrand cutover — COMPLETE 2026-04-26

All steps executed and verified live:
1. ✅ `sitefile.app` added as Cloudflare zone (Free plan)
2. ✅ DNS records added (A `@ → 76.76.21.21`, CNAME `www → cname.vercel-dns.com`, both grey-cloud)
3. ✅ Cloudflare assigned NS: `gigi.ns.cloudflare.com` + `stanley.ns.cloudflare.com`
4. ✅ Namecheap nameservers switched to Custom DNS → CF
5. ✅ NS propagation completed quickly (within minutes)
6. ✅ Vercel domain bound: `sitefile.app` (apex 307→www) + `www.sitefile.app` primary
7. ✅ Branch `rename/sitefile` (commit `70579cb`) merged to main, pushed to origin (13-commit batch)
8. ✅ Production deployed `dpl_BaLdhL7p8yjv5caZKCT8EVg68nLy` — `<title>Sitefile</title>` confirmed live
9. ✅ Cosmetic dashboard renames done (Vercel project, Clerk app name, Stripe product per user)
10. ✅ Old `siteproof.app` removed from Vercel Domains (dead entry — DNS never reached Vercel anyway)

### Phase 9 — Pre-beta validation (in progress, paused 2026-04-27)

Working through the remaining two pre-beta blockers (Stripe + Clerk E2E).
Hit a real-world infrastructure issue first.

#### Supabase free-tier auto-pause — CRITICAL gotcha discovered + fixed
- DB went `INACTIVE` (Supabase free tier auto-pauses after ~7 days of inactivity)
- Symptom: all DB connections fail with `PostgresError: Tenant or user not found`
- Same error appears in `betatest.md` historical findings — was misattributed to demo seed back then
- **Restored via Supabase MCP** (`mcp__claude_ai_Supabase__restore_project` → free unpause, ~30s)
- Status now: `ACTIVE_HEALTHY`
- **MUST add keep-alive monitoring before opening to beta** — Vercel Cron pinging DB once a day prevents repeat. Free tier limit is 500 invocations/mo so daily ping is trivial.
- Alternative: Supabase Pro at ~£25/mo permanently disables auto-pause.

#### Clerk E2E test — IN PROGRESS, blocked on diagnosis
- Production using `pk_test_*` (Development Clerk instance `proud-bluejay-8`).
  Functions correctly for invite-only beta but **must swap to a Production Clerk instance with `pk_live_*` before real public launch.**
- Clerk restrictions toggled OFF temporarily (under **Configure → Protect → Restrictions**, NOT under "User & Authentication" — Clerk dashboard reorganised)
- User signed up with `derian.jackson@stanstedairport.com`
- **DB query confirms NO user row was created** — only the 4 pre-existing rows (2 demo, 1 seed, 1 old test from 2026-03-27)
- Cause not yet diagnosed. Hypotheses:
  1. Clerk webhook signature mismatch (CLERK_WEBHOOK_SECRET stale — set 26d ago)
  2. Webhook secret correct but webhook endpoint URL still pointed at old siteproof.app domain
  3. ensureUser lazy fallback never fired because user didn't navigate to a tRPC-calling page after sign-in
  4. Sign-in redirect went somewhere unexpected
- **Need from user on resume (3 questions):**
  1. Sign UP or sign IN today? (Yesterday's signup attempt was during DB outage — Clerk would have created the auth-side account but webhook would have failed)
  2. What URL did the browser show after submit?
  3. Did the page show app content (sidebar, "Welcome to Sitefile") or Clerk hosted page / blank / 500?

#### Helper script added (uncommitted)
- `scripts/watch-users.ts` — queries DB for recent users + org + memberships + audit-log for a given email. Loads from `.env.production-snapshot` (created by `vercel env pull --environment=production`). Run as `npx tsx scripts/watch-users.ts <email>`.
- Useful for any future Clerk/auth debugging. Should be committed.
- **Update 2026-05-04:** committed in `c46eb2c`. The "uncommitted" note was stale.

### Phase 10 — UX upgrade pass (2026-05-04 → 2026-05-05) ✅

Triggered by a real-browser E2E walkthrough using `agent-browser` against
local dev with `DEMO_MODE=true`. Bug findings shipped first, then a
three-tier UX upgrade. Five auto-deploys landed across the session
(`1b6a89e`, `f61eb34`, `710b29c`, `e91b16a`, plus the webhook test
commits). All live on `www.sitefile.app`.

#### Bug fixes from E2E (`1b6a89e`)
- **Dashboard at `/` was unreachable** — root `src/app/page.tsx`
  redirected authenticated users to `/projects`, bypassing
  `(dashboard)/page.tsx` (319 lines of stats + activity feed). The
  sidebar's "Dashboard" link silently went to Projects. Fix: deleted
  the root redirector; `(dashboard)/layout.tsx` already handles
  auth-gating.
- **UserMenu took the Clerk path in demo mode** — static
  `Boolean(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)` check rendered Clerk's
  `<UserButton />` (which drops an empty placeholder when no Clerk
  session) instead of the demo dropdown. Fix: runtime cookie check
  via `useEffect`.
- **Mapbox `pk.PLACEHOLDER` not detected** — `!== "PLACEHOLDER"` only
  caught the literal string. Switched to case-insensitive
  `/placeholder/i` regex.
- **Task form Status select showed raw `not_started`** — Base UI
  `Select.Value` displays the value, not the SelectItem's children.
  Extended `lib/project-status.ts` with `TASK_STATUS_LABELS` +
  `getTaskStatusLabel`; rendered the label explicitly in the trigger.
- **Theme toggle invisible against dark sidebar** — switched ghost
  variant to outline.

#### Tier 1 — quick UX wins (`f61eb34`)
- **Reports promoted to hero card** on project detail. Lifted out of
  the "Intelligence" nav group into a dedicated card above the work
  sections, showing latest report number + status badge + period, with
  a primary "Generate report" CTA. Reports is the £99/mo deliverable;
  it should be unmissable.
- **Dedupe "New Project"** — removed the duplicate from the dashboard
  Quick Actions card. Header CTA stays as the single entry.
- **BillingBanner visual weight** — `payment_failed` swapped from soft
  pastel to `border-l-4` red with an `AlertCircle` icon. Same border
  treatment for `pending_payment` and `cancelled` for consistency.
- **Account page + sidebar shortcut** — new
  `(dashboard)/account/page.tsx` rendering Clerk `<UserProfile />` in
  Clerk mode and a "Demo session" / "Switch user" card in demo mode.
  Sidebar + mobile nav now have an "Account" link.
- **AI suggestions header** — renamed the TaskLinker "Suggestions"
  section to "AI suggestions" with a Sparkles icon. The heuristic
  linker was already well-rendered; the title now signals it's the
  product's actual differentiator.

#### Tier 2 — IA tightening + onboarding (`710b29c`)
- **Global `+ Capture` launcher** — new
  `src/components/capture/capture-launcher.tsx` (icon + primary
  variants). Wired into the sidebar (primary button above nav) and
  mobile-nav (icon in top bar + primary button at top of menu sheet).
  Smart routing: 0 projects → `/projects/new`; 1 active project → skip
  picker; many → picker dialog filtered to active projects only.
  Closes the discoverability gap where capture was reachable only via
  a specific project's overview link.
- **Project detail page tightening** — replaced the three-section
  navSections grid (5–7 cards) with two zones: "Work" (3 prominent
  cards: Capture, Tasks, Evidence) and "More" (3 compact horizontal
  pills: GPS Zones, Audit Log, Settings) below a thin separator. Same
  destinations, half the visual real estate, clearer "do work" vs
  "configure" hierarchy.
- **Post-create onboarding nudges** — new
  `src/components/projects/next-step-banner.tsx` rendered above the
  project header. Picks the next workflow step from counts:
  `tasks=0 → "Start with your programme"`, `tasks>0 evidence=0 → "Capture
  site evidence"`. Reports nudge omitted (Tier 1.2 hero already covers
  it). Per-project sessionStorage dismissal.

#### Tier 3 — strategic helpers (`e91b16a`)
- **⌘K command palette** — new
  `src/components/layout/command-palette.tsx` mounted globally in
  `(dashboard)/layout.tsx`. ⌘K / Ctrl+K opens; Esc closes. Items:
  Dashboard / Projects / Account / New project / project list (jump
  to project) / "Capture for X" actions for every active project.
  Filterable by name, reference, client. Sidebar gets a small "Press
  ⌘K to search" hint.
- **PWA install banner** — new
  `src/components/layout/pwa-install-banner.tsx` on the dashboard.
  Hooks into the existing `usePWA()` `canInstall` + `promptInstall`
  path that was capturing `beforeinstallprompt` but never surfaced
  in the UI. Click "Install" triggers the native prompt;
  localStorage + sessionStorage flags prevent re-pestering.

#### GitHub → Vercel webhook saga
- After the GitHub repo rename `siriusblackz/siteproof` → `SiriusBlackz/sitefile`,
  the Vercel auto-deploy webhook silently broke. Pushes succeeded
  via redirect but no builds fired.
- **Two reconnect attempts** in Vercel Settings → Git. First reconnect
  appeared to save but `vercel project inspect` showed no Git section
  and a test commit didn't deploy. Second reconnect (after explicitly
  picking the renamed repo + saving) took. Verified working with
  empty test commits; `sitefile-git-main-…` alias appeared on
  subsequent auto-deploys (only generated by Git-triggered builds).
- Local origin URL also updated to match
  (`git remote set-url origin https://github.com/SiriusBlackz/sitefile.git`).

#### Local dev gotcha — PWA service worker
- The PWA service worker (`public/sw.js`, network-first nav,
  cache-first static) runs in dev too and aggressively caches
  `/_next/static/chunks/` JS bundles. After a code change, even with
  `.next/` cleared and dev restarted, the SW served stale JS for the
  user-menu component for ~15 minutes before diagnosis.
- Fix used during agent-browser E2E:
  ```
  agent-browser eval 'await Promise.all([
    ...(await navigator.serviceWorker.getRegistrations()).map(r=>r.unregister()),
    ...(await caches.keys()).map(k=>caches.delete(k))
  ])'
  ```
- Now captured in `~/.claude/projects/-Users-derianj-projects-sitefile/memory/project_state.md`.

#### Plan parking lot
A formal upgrade plan was written and is preserved at
`/Users/derianj/.claude/plans/create-a-plan-to-robust-matsumoto.md`.
Three Tier 3 items were scoped but **deferred — each needs design
input, not just execution**:
1. **Field-friendly density pass** — audit every interactive element
   for ≥44px touch targets, gloved-finger spacing, contrast for
   outdoor-construction context. Current density is desk-software
   density.
2. **True cross-resource search** in ⌘K — searching task names and
   evidence note text. Needs new tRPC endpoints with full-text search
   on `tasks.name` + `evidence.note`. Backend work, not just UI.
3. **Evidence-as-workspace reframe** — make Evidence the project home
   for projects with non-zero evidence count, demote Overview. Bigger
   IA decision.

Plus two smaller polish items queued in TaskCreate (#1 tooltips on
icon-only buttons, #2 `aria-live` regions on async status changes).

#### Phase 9 status — unchanged
The original Phase 9 launch blockers from 2026-04-27 remain open
(Stripe webhook secret, Clerk `pk_live_*` swap, Supabase Pro for
auto-pause prevention). The Supabase free-tier auto-pause hit again
mid-session and was restored via Supabase MCP — symptom is
`tenant/user postgres.* not found` and the recurring nature of this
gotcha is now memorised.

---

## Current State (2026-04-11, brand unchanged as of that deploy)

### What's Working
- `npm run build` — zero errors, zero lint warnings, 23 routes
- Deployed at https://siteproof-ashy.vercel.app (aliased to www.siteproof.app)
- Clerk auth with webhook sync + lazy ensureUser fallback
- DEMO_MODE blocked in production
- All endpoints protected + org-isolated + project-member-scoped
- Security headers on all responses
- bcrypt password hashing, per-IP rate limiting
- 7 tRPC routers: project, task, evidence, zone, report, audit, dashboard
- Mobile capture with GPS, permission handling, ARIA labels
- Evidence uploads to R2 with thumbnail generation (Inngest)
- Evidence metadata search (type, text, uploader, date filters)
- Video playback in evidence cards + detail dialog
- Project member management (add/remove via settings page)
- Offline queue status indicator (IndexedDB polling, shown in nav)
- PDF reports at 9/10 quality: TOC, uploader info, audit trail, canvas signatures, period-scoped data
- Project sub-navigation tabs
- Dashboard onboarding for new users
- Interactive Gantt chart with list/gantt toggle, zoom, evidence markers
- Audit trail for all mutations with CSV export
- PWA installable with offline capture queue
- Stripe billing coded (bypassed in demo mode)
- Landing page at / (redirects to /projects or /sign-in)

### Infrastructure on Vercel
- **Clerk:** `proud-bluejay-8` instance, webhook + publishable key + secret key
- **Database:** Supabase pooler (aws-1-eu-central-1)
- **R2 Storage:** Cloudflare bucket `siteproof-media`, WEUR region, public dev URL enabled
- **Inngest:** synced, 3 functions (generate-report, failure handler, process-upload)
- **Not configured:** Stripe, Mapbox, Anthropic API

### Security Review (2026-04-10)
- assertProjectAccess checks project membership (org admins bypass, members required)
- Demo cookie validated against allowlist
- Upload limit reduced to 100MB
- Date validation on project + task forms
- Storage key sanitized against path traversal
- GPS callback guarded against unmounted state updates
- JPEG capture quality increased to 0.95

### Vercel-Specific Adaptations
- Uploads: R2 presigned URLs (fallback: `/tmp` + `/api/uploads/[...path]`)
- PDFs: R2 storage (fallback: base64 in `report_data` JSONB, served via `/api/reports/[id]/pdf`)
- Chromium: `@sparticuz/chromium-min` + `puppeteer-core` with remote binary download
- tRPC route: `maxDuration = 60` for report generation
- proxy.ts (Next.js 16 convention)

### Phase 11 — Multi-format programme import + UX walk-back (2026-05-08 → 2026-05-09) ✅

Two unrelated threads landed in this session: (a) extending the
programme/schedule import beyond XML to also accept Excel and PDF —
the most-requested onboarding fix; and (b) walking back several of
the cumulative Phase-10 IA changes after a real-browser E2E
walkthrough revealed they were too loud taken together. Plus one real
bug — the dashboard stats SQL was failing silently and showing "—"
placeholders.

#### Cert diagnosis (`https://sitefile.app` apex) — non-incident
- User screenshot showed Edge rejecting the apex with
  `NET::ERR_CERT_AUTHORITY_INVALID`. Diagnosed as **H4 — airport
  WiFi TLS interception** (Stansted Airport network). Confirmed by:
  apex DNS resolves to `76.76.21.21` (Vercel anycast, not
  Cloudflare), no CAA records blocking, `openssl s_client` from a
  different network shows a valid Let's Encrypt R13 cert with the
  correct CN. Nothing to fix on our side; user's airport network
  injects its own root CA. Captured in
  `~/.claude/plans/create-a-plan-to-robust-matsumoto.md` as a
  reusable runbook.

#### Phase 11.A — Excel (.xlsx) programme import (`8bfcbb5`)
- New `src/server/services/excel-import.ts` (exceljs-based) with
  two entry points:
  * `inspectExcel(buf)` — returns headers + 5 sample rows + a
    heuristic-suggested ColumnMapping for the user to confirm.
    Heuristic uses case-insensitive regex on header text
    (`task|activity` → name, `start|begin` → plannedStart, etc.).
  * `parseExcelWithMapping(buf, mapping)` — returns the existing
    ParsedTask[] shape so the DB-insert path is unchanged.
- Hierarchy: prefers WBS column (`1.2.3` → parent `1.2`); falls
  back to parent-by-name match.
- Date parsing handles JS Date objects, Excel epoch numbers (via
  exceljs auto-conversion), ISO strings, and DD/MM/YYYY (UK
  default).
- tRPC `previewImport` and `import` extended to discriminated
  unions: `{kind:"xml"} | {kind:"xlsx-inspect"} | {kind:"xlsx-parse"}`
  for preview, `{kind:"xml"} | {kind:"xlsx"}` for import.
- import-dialog.tsx rewritten as a 3-step wizard: file picker →
  column mapping (xlsx only, with auto-suggested defaults +
  sample rows disclosure) → existing preview table → commit.
- End-to-end verified locally with an 11-row WBS-hierarchical
  fixture: auto-mapping detected all 5 columns, preview
  rendered hierarchy correctly, commit created tasks with
  status badges derived from %Complete.

#### Phase 11.B — PDF programme import via Claude vision (`2291604`)
- New `src/server/services/claude-client.ts` — singleton Anthropic
  client; throws a user-friendly error when
  `ANTHROPIC_API_KEY` is missing or still set to the
  `sk-ant-PLACEHOLDER` value from `.env.example`.
- New `src/server/services/pdf-import.ts` — sends the PDF bytes
  to Sonnet 4.6 via the messages API with a `submit_programme`
  tool that pins JSON output. The tool input_schema declares
  `tasks[]` with sourceRef/name/parentSourceRef/start/end/pct
  plus a `confidence` float (0-1).
- System prompt requires ISO-8601 dates, falls back to DD/MM/YYYY
  on ambiguous strings (UK construction default), and tells the
  model NOT to invent tasks.
- import-dialog.tsx extended for `.pdf`: 10-30s "Extracting from
  PDF…" loader, "AI extracted" sparkles badge on preview, amber
  warning banner if confidence < 0.7, **fully editable preview
  rows** (name as Input, dates as date inputs, % as number,
  trash icon to drop bad rows). The user's edits are what gets
  committed; the original LLM extraction is not re-used.
- `task.import` mutation accepts a `{kind:"pdf", tasks}` source
  so the client can ship corrected rows back without re-running
  inference.
- Error path verified locally with placeholder API key: upload
  → tRPC roundtrip → `getAnthropicClient` throws → dialog
  displays "ANTHROPIC_API_KEY is not configured. PDF programme
  import requires a real Anthropic API key." Real extraction
  needs a non-placeholder key in Vercel env. Cost expectation:
  ~$0.05–0.30 per import depending on PDF size.

#### Phase 11.C — Accessibility polish (`4351828`)
- Tooltips on icon-only buttons:
  * theme-toggle, user-menu (DemoUserMenu) — `title=""` HTML
    attribute on the inner span (dropdown click reveals options
    so a real Tooltip would conflict)
  * CaptureLauncher icon variant — real Tooltip primitive
  * task-list reorder/edit/delete (4 buttons) — each wrapped in
    Tooltip with appropriate label using base-ui's `render` prop
  * Mobile capture review skipped (touch UI, no hover)
  * OfflineQueueIndicator skipped (already shows visible text)
- aria-live regions: upload-queue counter, report-list
  StatusBadge cell, mobile capture review counter — all
  `role=status aria-live=polite` so screen readers announce
  async state changes.

#### Phase 11.D — UX walk-back from a real-browser E2E (`ca00fdd`)
A second `agent-browser` walkthrough (with the user pushing back
that "site UI/dashboard layout & workflow have changed and not for
the better") surfaced that the cumulative Phase-10 IA changes were
too aggressive. Reverted:
- **PWA install banner removed from dashboard** — was ~200px tall
  on every dashboard visit, dominated the top of the page, pushed
  the actual stats grid below the fold. The PWAInstallBanner
  component file stays in the codebase for a future less-prominent
  placement.
- **Sidebar slimmed back** — dropped the desktop "Capture Photos"
  primary CTA (capture is a phone action; mobile-nav still has it)
  and the "Press ⌘K to search" hint. Sidebar is back to
  Dashboard / Projects / Account + footer cluster.
- **Project detail page**: next-step nudge banner moved BELOW the
  project header + stats (was rendering ABOVE, so users saw a CTA
  before they knew what page they were on for projects in the
  tasks-but-no-evidence middle state). Reports hero card removed
  (it duplicated the Reports stat count immediately above it).
  Restored the 3-section nav (Work / Intelligence / Admin) with
  full-size cards instead of compact "More" pills — the pills
  demoted GPS Zones / Audit Log / Settings too much.

Kept (not reverted): ⌘K palette (still global, just no longer
advertised), Account page, Dashboard reachable at `/`, status
label centralisation, dark mode, billing-failed visual weight,
AI suggestions header, Excel/PDF import, a11y polish.

#### Phase 11.E — Dashboard stats SQL bug (real bug, in `ca00fdd`)
Surfaced during the E2E walkthrough — every stat card on the
dashboard showed "—" even for users with data. Root cause:
`src/server/trpc/routers/dashboard.ts` was passing a JS `Date`
object directly into a `sql\`\`` template inside a postgres
`FILTER (where ... >= ${date})` clause. The drizzle → postgres-js
parameter binding was failing silently — the whole
`dashboard.summary` endpoint returned 500, which the StatCards
rendered as "—" placeholders.

Fix: convert the cutoff to `.toISOString()` before binding. Two
lines. Verified by running the literal SQL via Supabase MCP first
to confirm the syntax is fine, then watching the endpoint return
real data (7 active projects / 19 tasks / 4 evidence) for
contractor-1 after the fix.

This bug had probably been live since Phase 5/6 — it just
manifested clearly once contractor-1 had non-trivial data
through the multi-format import work.

### Phase 12 — Beta-test round 2 + Phase 9 unblock (2026-05-09) ✅

Two threads landed in one session: (a) full remediation of a second
beta-test review (consolidated security / data-integrity / offline /
devops feedback), and (b) closing both Phase-9 launch blockers
(Clerk webhook sync + Supabase free-tier auto-pause). All committed
+ pushed + verified live. Two commits, both on `main`:

- `a7dc08d` — beta-feedback Phase A–D (34 files)
- `efa37bc` — Supabase keep-alive cron (3 files)

Plus out-of-tree: Vercel env updates (`CLERK_WEBHOOK_SECRET`,
`CRON_SECRET`), Clerk webhook endpoint creation, migration applied
to Supabase, and a redeploy.

#### Phase 12.A — Critical security (in `a7dc08d`)

Verified each beta-test claim against the code with parallel Explore
agents before acting. Held five push-backs with reasons documented in
the plan file:

- **Evidence URL leak closed** — `getPublicUrl` always returns the
  auth-checked `/api/uploads/...` path regardless of `R2_PUBLIC_URL`.
  Puppeteer gets new `getInlineDataUrl` (base64 inlined into the
  rendered HTML) since it has no Clerk session and can't authenticate
  against `/api/uploads/`. `R2_PUBLIC_URL` is no longer used as a
  CDN endpoint for evidence.
- **Report download tokens** — new `src/server/services/report-tokens.ts`
  signs HMAC tokens (60s TTL, bound to user + report). `report.download`
  is now a mutation that returns `?t=<token>`; the PDF route validates
  the token instead of `?p=<password>`. The password never leaves the
  mutation. URL leakage via referrer/history is bounded to 60s.
- **Project access consistency** — `project.get` now calls
  `assertProjectAccess` (matches every other router); `project.list`
  scopes to membership for non-admins (admins see full org list);
  `dashboard.summary` + `dashboard.recentActivity` mirror the same.
  Previously the list/get pair allowed any org member to load any
  project even if they weren't a project member.
- **Clerk webhook 500 on failure** — `/api/webhooks/clerk` now
  returns 500 on any processing error so Clerk retries the delivery.
  Was silently swallowing every error and returning 200, hiding all
  user-sync failures.
- **R2 HEAD check on confirm** — new `statStoredObject` HEADs the R2
  object before `evidence.confirm` consumes the upload intent. Rejects
  if the object is missing or its size differs from the declared size.
  Closes the gap where a client could confirm an upload that never
  landed in storage.

#### Phase 12.B — Data integrity (in `a7dc08d`, migration `0005_thin_king_cobra.sql`)

- **Insert-safe report numbering** — new unique index on
  `reports(project_id, report_number)` and partial unique on
  `reports(project_id) WHERE status='generating'`. The race-prone
  read-then-insert in `report.generate` is replaced with
  insert-then-catch-23505 with a 3-attempt retry loop. Concurrent
  generate calls now conflict at the DB and resolve cleanly.
- **CHECK constraints + shared TS unions** — new
  `src/server/db/enums.ts` is the single source of truth for status /
  role / type / link_method values. Drizzle defaults and Zod schemas
  both import from there. Migration adds CHECK constraints on
  `users.role`, `project_members.role`, `projects.status`,
  `tasks.status`, `reports.status`, `evidence.type`,
  `evidence_links.link_method`. Bad states now fail at the DB layer
  instead of silently writing.
- **Self-healing migration** — `0005` includes pre-steps that map
  legacy `projects.status='completed'` → `archived` (one row in
  prod), and that fail any `reports.status='generating'` rows older
  than 24h or duplicated per-project, so the partial unique index
  doesn't trip on existing data.
- **Server-side date validation** — `endDate >= startDate` and
  `periodEnd >= periodStart` `.refine()`s on the server Zod schemas
  (client form already had this; server didn't).
- **Audit failure observability** — `writeAuditLogAsync` now emits a
  structured JSON line (`type=audit_failure`) instead of a plain
  `console.error`. New `setAuditFailureReporter` hook lets the app
  bootstrap wire to Sentry / Inngest DLQ later. Kept fire-and-forget
  by design (push-back: blocking audit writes for marginal compliance
  gain is the wrong tradeoff).

#### Phase 12.C — Offline reliability (in `a7dc08d`)

The biggest UX hole — the offline capture queue stored blobs but
nothing ever drained them.

- **`offline-queue-processor.ts`** — single-flight mutex, runs the
  same `getUploadUrl → PUT → confirm → link` pipeline against pending
  IndexedDB blobs. Classifies 4xx as permanent (mark item `error`,
  surface in UI) and 5xx + network as transient (leave `pending`,
  retry on next trigger). `use-pwa.ts` calls it on `online`,
  service-worker background-sync, `visibilitychange`, and on mount
  for tabs that opened with stale items.
- **Capture → review handoff via IndexedDB** — sessionStorage data
  URLs (~5 MB cliff for big batches) replaced with a `capture-staging`
  IndexedDB store. Capture page bumps DB version, stashes blobs by
  session ID, passes `?session=<uuid>` to review. Review hydrates,
  uses `URL.createObjectURL` for preview, revokes on unmount.
- **Indicator polish** — Syncing/Pending/Failed states; retry button
  resets errored items back to `pending` and re-runs the processor;
  toast on `online` ("Re-syncing N…") + on `queue-sync-end`
  ("N synced" / "N failed").

#### Phase 12.D — DevOps + hygiene (in `a7dc08d`)

- **Typed env validation** — `src/lib/env.ts` (server) +
  `src/lib/env-client.ts` (browser) both Zod-validated. Imported from
  `db/index.ts` so misconfigured deploys fail at boot rather than
  inside an unrelated request.
- **Lockfile cleanup** — `package-lock.json` deleted (pnpm canonical
  per recent commits + project memory), `packageManager: pnpm@10.0.0`
  pinned in `package.json`, `outputFileTracingRoot` pinned in
  `next.config.ts` to silence the workspace-root inference warning.
- **Real Sitefile README** — replaced the create-next-app default
  with feature overview, dev setup, env vars, deploy notes, project
  structure, architecture decisions.
- **CI workflow** — `.github/workflows/ci.yml` runs `lint + typecheck
  + build` on push + PR. Test job is wired but disabled (no tests
  today; placeholder makes the matrix ready when tests land).

#### Push-backs explicitly held

- Did not replace `next/font/google` — sandbox issue, not an app defect
- Did not add a full test suite — wrong shape for this stage; CI pipe
  + 2-3 logic-unit tests when pain justifies, not now
- Did not make audit logging blocking — UX latency cost > marginal
  compliance gain; instrument failures instead
- Did not switch to Postgres enums — CHECK constraints + TS unions
  evolve more cleanly (no painful `ALTER TYPE`)
- Did not ship Upstash Redis rate-limiter today — flagged as
  Phase D-optional; in-memory limiter is fine until traffic justifies
- Demoted `react-hooks/set-state-in-effect` from error to warning so
  CI didn't start in the red on five pre-existing components
  (`user-menu`, `next-step-banner`, `account/page`, `capture-launcher`,
  `pwa-install-banner`). Each is a one-line lazy-`useState` fix when
  next touching the file.

#### Phase 12.E — Phase 9 Clerk-sync blocker closed (out-of-tree)

Inspection of Vercel env + the Clerk dashboard found the actual bug,
which differed from the Phase 9 hypotheses:

- **No Clerk webhook endpoint had ever been configured** at all
  (Webhooks page showed 0 endpoints), AND
- **`CLERK_WEBHOOK_SECRET` was missing from Vercel env entirely**
  (not stale — never set). The handler at
  `src/app/api/webhooks/clerk/route.ts` returns 500 immediately when
  the secret is missing, so even if Clerk had been firing webhooks,
  every delivery would have been rejected.

Fix:
1. Created Clerk webhook endpoint
   `https://www.sitefile.app/api/webhooks/clerk` (Development
   instance, `user.created` + `user.updated` events)
2. Added the generated `whsec_…` to Vercel `CLERK_WEBHOOK_SECRET`
   (production env)
3. Redeployed via `vercel redeploy` so the new env loaded
4. Verified end-to-end: bogus signature → 400 "Invalid signature"
   (confirms env is loaded + svix verification runs); previously
   would have been 500 "Webhook not configured"

Existing 4 Clerk users (j.alexander, derian.jackson, thelocaltrader1,
xavier.bot.dj) can be backfilled via Clerk's "Send Example" feature
on the endpoint, or by having them sign in once (the `ensureUser`
lazy fallback creates the DB row on first tRPC call).

**When the production Clerk instance is created with `pk_live_*`
keys**, this whole config has to be redone on that separate instance:
new endpoint, new signing secret, separate env var rotation.

#### Phase 12.F — Supabase keep-alive cron (in `efa37bc`)

Closes the Phase 9 free-tier auto-pause gotcha without paying for
Supabase Pro (~£25/mo).

- `vercel.json` — 1 cron at `0 4 * * *` (04:00 UTC, off-peak for UK
  construction users). Fits within Hobby's 2-cron daily-granularity
  allowance — total infra cost: £0/month.
- `src/app/api/cron/db-ping/route.ts` — GET handler runs `SELECT 1`,
  rejects callers without the bearer `CRON_SECRET` (so the endpoint
  can't be DoS'd into rack-up function invocations). Logs are
  greppable JSON (`{"type":"db_ping",...}`) for alerting on elapsedMs
  spikes.
- `CRON_SECRET` set in Vercel production env (32-byte hex, generated
  via `crypto.randomBytes`). Vercel auto-injects this as
  `Authorization: Bearer ${CRON_SECRET}` on cron-triggered requests.

Verified live: `curl -H "Authorization: Bearer $CRON_SECRET"
https://www.sitefile.app/api/cron/db-ping` → `{"ok":true,"elapsedMs":94}`.

---

## What's Outstanding (2026-05-09)

### Active blockers — your side, no code work needed
1. **`STRIPE_WEBHOOK_SECRET`** — handler is fully wired up + idempotent
   (mig 0004), waiting on a real Stripe account + secret.
2. **Clerk `pk_test_*` → `pk_live_*` swap** — production currently uses
   the Clerk Development instance (`proud-bluejay-8`). Functions for
   invite-only beta but must swap to a Production Clerk instance before
   real public launch. The Phase 12.E webhook config will need to be
   redone on the Production instance (new endpoint URL, new signing
   secret in `CLERK_WEBHOOK_SECRET`).

### Optional polish
- **Mapbox token** — enables GPS zone editor
- **Anthropic key** — placeholder in current Vercel env. PDF programme
  import (Phase 11.B) errors cleanly until set
- **Custom R2 domain** (`media.sitefile.app`) — currently using
  `pub-4059c4c9c3a8464eb90e87b52033bd04.r2.dev`
- **App logo/tagline** — design work
- **Sentry / observability** — no external monitoring yet. Phase 12.B
  added `setAuditFailureReporter` hook for one-line Sentry wiring
- **PDF encryption** — pdf-lib installed but unused (current "password"
  is download-gating only, UI copy correctly says so)

### Code-side items deferred (no urgency)
- **Upstash Redis rate-limiter** — Phase 12.D-optional; in-memory
  is leaky on Vercel multi-isolate but fine for current traffic
- **XML import guardrails** (size + count limits)
- **`/api/upload` raw POST replay protection** — low impact
- **5 pre-existing setState-in-effect warnings** in `user-menu`,
  `next-step-banner`, `account/page`, `capture-launcher`,
  `pwa-install-banner` — one-line lazy-`useState` fixes when next
  touching the file. Demoted to warning today so CI doesn't fail

### Bigger design calls (Phase 10 deferred Tier-3)
1. **Field-friendly density pass** — ≥44px touch targets, gloved-finger
   spacing, outdoor contrast. Current density is desk-software density.
2. **Cross-resource search in ⌘K** — full-text on tasks/evidence
   (needs new tRPC endpoints + indexes)
3. **Evidence-as-workspace reframe** — bigger IA decision (demote
   Overview when project has evidence)
