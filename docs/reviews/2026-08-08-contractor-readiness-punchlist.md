# Contractor-Readiness Punch List
**Audit date:** 8 Aug 2026 · HEAD `84f573e` · Full audit run by Claude (Explore agent, 43 tool calls over repo + live site)

## TOMORROW (18 Aug) — Account page cleanup before pilot demo

- [ ] **Disable Clerk "API keys" tab** — Clerk beta feature showing in the embedded `<UserProfile>`; Sitefile has no user-facing API, so keys created there are dead credentials. Dashboard-only fix: Clerk Dashboard → Configure → API Keys → off. No code change.
- [ ] **De-duplicate profile info on Account page** — own `ProfileCard` and Clerk's "Profile details" both show name + email on the same page (`src/app/(dashboard)/account/page.tsx:343` vs `:348`). Trim one (likely slim down our card to org/role only, or hide Clerk's profile section).
- [ ] **Restyle Clerk widget to match the Graft** — purple default avatar + "Secured by Clerk" footer clash with site-dust/tarmac/amber tokens; extend the `appearance` prop at `account/page.tsx:318`.
- [ ] **Derian's own change comments** — to be added 18 Aug (mentioned 17 Aug, not yet captured).

**State of play:** Live and deployed (www.sitefile.app, health check passing). Core loop is real: phone capture → programme linking → branded PDF (10 report templates). ~85% of a credible pilot, ~40% of a sellable product. The gap is connective tissue around a real customer, not the product itself.

---

## BLOCKERS — fix before a contractor touches it

- [ ] **B1 — Site team cannot get into the app.** Every signup auto-provisions its own empty org (`src/server/services/ensure-user.ts:100-120`, `src/app/api/webhooks/clerk/route.ts:73-85`); project settings can only add users already in your org (`src/server/trpc/routers/project.ts:276-281`); no invite mechanism exists anywhere (grep confirms zero hits). Foreman signs up → lands in empty org → dead end, no error shown.
  *Pilot hack (~3-4h):* both provisioning paths do email-lookup-first (`ensure-user.ts:74-98`), so an admin-only "add colleague by email" form that pre-seeds the user row with the right `org_id` unblocks the pilot without a full invite flow.
- [ ] **B3 — Supabase still on free tier; it already paused in prod (6 Jul).** Keepalive workflow dies after ~60 days of repo inactivity — i.e. exactly during a quiet pilot month. Upgrade to Pro + verify a restore. *Minutes of money, hours of verify.*
- [ ] **B2 — Nobody is told when report generation fails.** No Sentry; `setAuditFailureReporter` still unwired (PROGRESS.md:1345); `/api/health` only proves `SELECT 1`. Inngest `maxDuration = 300` may not cover a big photo-heavy PDF. *Hours.*
- [ ] **B4 — Marketing still overclaims vs the code.** Residue after the 4 Aug honesty sweep: "verifiable evidence" (`welcome/page.tsx:96`), "dispute" framing (`:248`), privacy page claims annotations exist (`privacy/page.tsx:47` — no annotation feature) and "verifiable" (`:51`), terms says "audit trail" (`terms/page.tsx:75`). Evidence metadata is client-supplied; audit writes are fire-and-forget into a mutable table. Make the website match the report's (more honest) disclaimer. *~30 min of copy edits.*
- [ ] **B5 — No pilot agreement, no DPA, no legal entity on the privacy notice.** Privacy page has no entity name/address/company number, no lawful basis, no subprocessor list. A contractor's compliance person may ask before the first upload. *Days or a lawyer's fee — run in parallel with recruitment.*
- [ ] **B6 — Zero automated tests; CI test job is `if: false`.** Only net is manual `scripts/smoke.ts` (which never covered multi-org — exactly B1's blind spot). Not a demo blocker; a blocker for changing anything while a pilot runs. *Days.*

## SECURITY / HYGIENE — do regardless of pilot

- [ ] `production key.png` at repo root (gitignored, never committed, but local/backup/screen-share exposure) — **rotate the key, delete the file**.
- [ ] `.env.production-snapshot` (26 Apr) — stale prod secrets on laptop; likely predates rotations. Delete or refresh.
- [ ] `beta test 2.0/` contains MAG Stansted programmes and LPL/VFP reports — real employer/client data inside a personally-owned commercial product's folder. Gitignored, but this is exactly the contamination risk GO-LIVE-BRIEF §Constraints 1 gates on. Move test data out deliberately.
- [ ] Untracked cruft to check for keys before any `git add .`: `scripts/qa-tmp/`, `scripts/tmp-qa-seed.ts`, `360.md`.
- [ ] Delete empty `src/app/api/debug-env/` dir.

## POLISH — survivable, do opportunistically

- [ ] P1 Clerk prod instance named "My Application" (sign-in card + first email) — 10 min, dashboard-only
- [ ] P2 First thumbnail ~2 min on cold Inngest start — the site team's literal first experience
- [ ] P3 Touch targets ~32px — gloved hands (`input.tsx:12`, `select.tsx:44`)
- [ ] P4 Marketing screenshots are placeholder blocks, not real construction shots
- [ ] P5 No CSP header on live site (verified)
- [ ] P6 In-memory rate limiter → Upstash
- [ ] P7 Media on raw `r2.dev` subdomain → custom domain
- [ ] P8 Confirm `support@sitefile.app` mailbox actually receives (published in 8 places)
- [ ] P9 Report delivery is download-only — no share link / read receipt (success criterion #2 is "client opened it")
- [ ] P10 Vercel project + folder still named `siteproof`
- [ ] P11 Clerk `user.deleted` unhandled → GDPR erasure is manual SQL (LATER tier, noted here so it isn't lost)

## Doc reconciliation (what the plans say vs git)

- GO-LIVE-PLAN week of 21 Jul: **genuinely done**. Week of 28 Jul (pick pilot, pitch, one-pager): **still open** — PILOT-PACK one-pager still contains `WhatsApp Derian: **[PHONE]**` placeholder; no pilot named anywhere.
- All four items the plan explicitly deferred (Mapbox, Anthropic key, PDF encryption, marketing page) **got built anyway** while pilot recruitment didn't start.
- PROGRESS.md "Outstanding (22 Jul)" stale: PDF encryption, Mapbox, Anthropic key all now done. Still open: Clerk name, R2 domain, Sentry, Upstash, XML guardrails, upload replay, 5 lint warnings.
- 360.md P0s: 4 of 7 closed on 4 Aug. Open: Supabase Pro/backups (B3), pilot agreement + DPA (B5), honest-claims residue (B4). All eight P1s open.

## Shortest honest path to "contractor uses this unsupervised in August"

**B1 → B3 → B2 → B4**, then **B5 in parallel with pilot recruitment** (the only item an evening of coding can't solve). B6 and all polish wait for the pilot to tell you what matters — which is what the pilot is for.
