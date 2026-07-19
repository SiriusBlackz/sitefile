# Sitefile Go-Live Plan

Drafted 19 Jul 2026 from GO-LIVE-BRIEF.md + Phase 16/16.5 state. Decisions below were made by Derian in the planning session; everything else follows from them.

## Decisions (locked 19 Jul 2026)

1. **Definition of "live":** one contractor, on a real live programme, using Sitefile **unsupervised** for a full reporting cycle, as a **free pilot**. Converts to £99/project/mo after the pilot proves value.
2. **T&T IP gate: CLEARED.** Contract reviewed; Stansted contractors are usable as pilot candidates. (Constraint that remains: zero departure signals in any comms until resignation.)
3. **Production DB:** stay on Supabase free tier; `trade-journal` paused to free the slot, `siteproof` restored. Revisit Pro ($25/mo) the day a pilot signs — a pausable DB is acceptable for pre-pilot, not for a paying/active pilot.

## What "genuinely live" unlocks (from the brief)

The LinkedIn flagship post ("contractors on a live programme now report through a tool I built") fires only when the pilot contractor is actually using it unsupervised — not at deploy, not at pitch. Nothing before that point names Sitefile publicly.

## Current state (verified 19 Jul)

**Working end-to-end in prod:** signup (Clerk FAPI healthy, email delivery working since 7/16 E2E) → create project → tasks → browser photo upload (R2 CORS fixed) → link evidence → generate report → download PDF. UptimeRobot monitors `/api/health`.

**Not done, customer-visible:** evidence delete (missing entirely, API + UI); sign-off badge ("DIGITALLY SIGNED" renders for any typed name — credibility risk on a legal-ish page).

**Not needed for a free pilot:** Stripe (app runs free-mode safely with no STRIPE_* vars), Mapbox token, Anthropic key, custom R2 domain, Sentry, PDF encryption.

**Housekeeping owed:** delete test user `sitefile-e2e-9407@maildrop.cc` + its data.

## The plan

Scoped to the hours that exist: evening/weekend sessions, LinkedIn routines untouched.

### Week of 21 Jul — pilot-ready build (2–3 evening sessions)

- [ ] **DB swap verified** — `/api/health` 200, UptimeRobot green. *(done in planning session — verify it stayed green)*
- [ ] **Evidence delete** — tRPC mutation (soft delete per schema) + UI on evidence card/grid. Audit-logged.
- [ ] **Sign-off badge fix** — badge only renders with a real signature event (name + explicit confirm + timestamp); otherwise show an "unsigned" state. No fake-signed states on a legal-ish page.
- [ ] Both verified on localhost → Derian signs off → commit + push (per working agreement).
- [ ] **Test-user cleanup** — remove `sitefile-e2e-9407@maildrop.cc` from Clerk + DB.
- [ ] **Full prod smoke test** (Derian, ~10 min, incognito): fresh-email signup → project → tasks → photo upload → link → report → PDF download. This is the "a stranger could use it" gate.

### Week of 28 Jul — pilot recruitment (Derian, no code)

- [ ] Pick the pilot contractor (Stansted route now open). Criteria: currently produces weekly/monthly progress reports manually, has a smartphone-using site team, relationship warm enough to tolerate rough edges.
- [ ] The pitch (15 min, in person): "free for the pilot, you get your reporting time back, I get feedback." No mention of consultancy transition, pricing plans, or anything that signals departure.
- [ ] One-page onboarding sheet: sign-up link, capture-on-phone / report-on-laptop workflow, who to WhatsApp when stuck (Derian).

### Aug — pilot runs one full reporting cycle

- [ ] Contractor onboarded: project created, programme tasks entered (or imported), site team uploading.
- [ ] Derian's role: respond to stuck-points, watch UptimeRobot, **do not drive the tool for them** — unsupervised use is the success bar.
- [ ] Log every friction point; fix only what blocks report delivery, park the rest.

**Pilot success criteria (all three):**
1. Contractor generates and sends ≥2 reports (or 1 monthly) to their client without Derian touching the tool.
2. The client actually receives/opens the report (ask).
3. Contractor answers yes to: "would you pay £99/month to keep this?"

### Sep — convert + announce

- [ ] If criteria met: set up real Stripe account + prod env vars (handler already wired + idempotent), upgrade Supabase to Pro, convert pilot to £99/mo.
- [ ] **Then** the LinkedIn flagship post fires (Sitefile now nameable publicly per voice guide).
- [ ] Monetization detail (self-serve vs sales-led, tiering) decided *after* pilot learnings — deliberately deferred per brief.

## Kill / pivot triggers

- Contractor stops uploading for 2+ weeks despite nudges → the workflow doesn't fit site reality; interview, don't push.
- Free-tier DB pauses during the pilot despite UptimeRobot → upgrade to Pro immediately (don't debug, pay).
- Any T&T optics wobble (someone asks "whose tool is this?") → have the prepared answer: personally-built tool, disclosed, free pilot.

## Deferred (explicitly not in scope for go-live)

Mapbox zone editor, AI PDF import (Anthropic key), custom R2 domain, Sentry, PDF encryption, rate limiter, field-density UI pass, ⌘K search, marketing page, repo rename `siteproof/`→`sitefile/`.
