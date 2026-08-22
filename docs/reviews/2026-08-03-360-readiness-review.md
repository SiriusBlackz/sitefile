# Sitefile 360-Degree Go-Live Readiness Review

**Review date:** 3 August 2026  
**Scope:** Architecture, security, workflow, UI/design, operations, legal/privacy readiness, and current competitive position.  
**Method:** Read-only source review, production-site inspection, build and quality checks, dependency audit, and current market research. No application code was changed as part of the review.

## Executive Verdict

**Sitefile is not ready for a public or paid launch today.** The core product is credible and the end-to-end workflow works, but security maintenance, misleading evidence/security claims, legal compliance, operational resilience, and mobile presentation need attention.

**Recommendation:** Pause unsupervised onboarding. After the P0 items below, Sitefile is suitable for a tightly managed free pilot. It is not yet ready for self-service paid customers.

| Area | Readiness | Assessment |
|---|---:|---|
| Architecture | 7.5/10 | Well-structured, pragmatic SaaS architecture |
| Core workflow | 8/10 | Strong, differentiated capture-to-report loop |
| Security | 5.5/10 | Good access controls, but dependency and trust gaps |
| UI/design | 7/10 | Polished desktop; mobile and credibility issues |
| Operations | 5/10 | Basic monitoring, insufficient resilience/observability |
| Legal/privacy | 4/10 | Policies exist but are incomplete for commercial processing |
| Market position | 6.5/10 | Viable wedge, but increasingly competitive |
| **Overall today** | **6/10** | **Pilot-capable after remediation; not production-ready now** |

## Critical Findings

### 1. The PDFs are not password-protected PDFs

Sitefile hashes the password and checks it before an authenticated user downloads the report, but Puppeteer generates an ordinary unencrypted PDF. Once emailed or shared, it opens without a password. This directly contradicts multiple website and support claims.

Relevant code:

- `src/app/(marketing)/welcome/page.tsx:35`
- `src/server/trpc/routers/report.ts:201`
- `src/server/services/report-generator.ts:743`

### 2. "Tamper-evident" and "GPS-verified" overstate the evidence model

The API accepts timestamp, coordinates and EXIF values supplied by the authenticated client. "Zone verified" means those coordinates fall inside a user-drawn polygon; there is no capture signature, cryptographic hash chain, immutable storage, or independent location verification. The report disclaimer is more accurate than the website.

Relevant code:

- `src/server/trpc/routers/evidence.ts:66`
- `src/server/services/report-generator.ts:437`

### 3. The production dependency baseline is overdue for patching

The current audit reports 3 critical, 54 high, 49 moderate and 5 low advisories. That count is inflated by transitive and CLI dependencies, and several headline issues are not reachable in Sitefile's current design. Nevertheless, Next `16.2.3` has multiple patched security issues, and Clerk `7.0.12` is affected by authorization advisories. Upgrade and retest before onboarding.

Sources:

- [Clerk middleware advisory](https://github.com/advisories/GHSA-vqx2-fgx2-5wq9)
- [Next.js proxy-bypass advisory](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
- [protobuf advisory](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)

### 4. The privacy and commercial framework is incomplete

The privacy notice does not identify a legal entity/address or lawful bases and gives only generic international-transfer wording. There is no customer Data Processing Agreement or documented account-deletion workflow. The ICO requires controller-processor contracts and specific privacy information.

Sources:

- [ICO privacy-information requirements](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/?q=consent)
- [ICO processor-contract guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts/)

## High-Priority Findings

- The public mobile navigation is broken at 390px: the page becomes 481px wide and the primary CTA moves off-screen. The base `inline-flex` style defeats `hidden` in `src/app/(marketing)/marketing-ui.tsx:18`.
- `report.get` returns the complete database row, including `passwordHash`, to authorised project users, despite the list endpoint intentionally removing it. See `src/server/trpc/routers/report.ts:39`.
- The website claims users can "annotate from site", but no photo-annotation workflow exists.
- Clerk `user.deleted` events are not handled. Closing a Clerk account leaves Sitefile's database record and project data intact, conflicting with the stated 30-day deletion promise.
- Rate limiting is per serverless instance and therefore bypassable across instances. See `src/server/services/rate-limit.ts:1`.
- Most audit writes are fire-and-forget, the failure reporter is not connected to monitoring, and the audit table is not append-only. It is an activity log, not a defensible immutable audit trail.
- Security headers are a good baseline, but there is no Content Security Policy. See `src/proxy.ts:4`.
- Supabase free tier has already paused twice. The existing plan to upgrade when a pilot signs should be mandatory before pilot data arrives.
- There is no meaningful automated test suite or CI security gate. Production smoke testing is documented, but regression confidence depends heavily on manual scripts.
- Monitoring checks database availability, but not Clerk, R2 uploads, Inngest jobs, report generation, queue failures or frontend exceptions.

## Architecture Review

The architecture is appropriate for an early SaaS product: Next.js App Router, typed tRPC boundaries, Drizzle/Postgres, Clerk authentication, R2 direct uploads, Inngest background processing, and isolated organisation/project access.

Particularly strong areas include:

- Server-side project membership checks
- Single-use upload intents
- Object existence and size verification
- Signed Clerk and Stripe webhooks
- Stripe event idempotency
- Report concurrency controls
- Authenticated storage reads
- Deny-all Supabase anonymous RLS
- IndexedDB-backed offline capture and retry UX

Architectural weaknesses include:

- Application-owned database connections bypass RLS, making application authorization the main security boundary
- Audit writes are often asynchronous and not guaranteed to accompany the original transaction
- Environment validation requires only the database URL; several production-critical integrations remain optional
- No automated backup/restore verification
- No comprehensive application or job observability
- No meaningful automated test suite

## Workflow Review

The capture to task-link to report workflow is Sitefile's strongest asset. Imports, bulk linking, date/GPS suggestions, branded reports, before/after views and audit summaries form a coherent product rather than a collection of screens.

The mobile capture experience is thoughtfully designed:

- Camera-first interface
- GPS capture
- Batch review
- Per-photo task assignment and notes
- IndexedDB staging rather than fragile browser session storage
- Offline queuing and visible retry state

The office workflow is also sensible:

- Import or create programme tasks
- Review a central evidence gallery
- Filter by task, date, media type and uploader
- Accept suggestions or bulk-link evidence
- Generate a report for a defined period
- Download and distribute the PDF

Important workflow gaps compared with the market include:

- No client portal, read receipts or recipient analytics
- No controlled external report-sharing link
- No report approval or formal versioning workflow
- No daily logs, manpower, weather, plant, material or delay records
- No RFIs, issues, observations, inspections, forms or checklists
- No image annotation despite the website claim
- No client comments or questions
- No API or accounting/project-management integrations
- Limited permission granularity within a project

## Security Review

### Strengths

- Authentication is enforced again in server layouts and tRPC procedures rather than relying only on middleware.
- Organisation and project access are checked server-side.
- Task, evidence and GPS-zone relationships are checked before mutation.
- Upload intents are scoped to user/project, expire and are single-use.
- Uploaded objects are checked before evidence rows are confirmed.
- Storage proxy routes require authentication and project membership.
- Report downloads use short-lived HMAC tokens bound to a report and user.
- Stripe and Clerk webhook signatures are verified.
- Stripe webhook processing is idempotent.
- Database tables use deny-all RLS for anonymous Supabase access.
- HSTS, `nosniff`, frame denial, referrer and permissions policies are set.

### Weaknesses

- Next, Clerk and several transitive runtime libraries require security updates.
- A report query exposes password hashes to authorised project users.
- Report passwords do not encrypt the resulting PDF.
- Metadata used for evidence verification is client-supplied.
- The audit log is mutable and not cryptographically chained.
- Distributed rate limiting is absent.
- Content Security Policy is absent.
- Account deletion is not synchronised from Clerk.
- No Sentry or equivalent frontend/backend exception monitoring is configured.
- No automated dependency policy or CI gate prevents vulnerable releases.

The raw Clerk `createRouteMatcher` advisory is not directly exploitable through Sitefile's current authorization design because the application does not use that matcher and performs server-side checks. It should still be upgraded as part of normal security hygiene.

## UI And Design Review

Desktop presentation is restrained, professional and well suited to contractors. Information hierarchy, report visuals, dashboard navigation and empty/loading states are generally good.

Strengths:

- Clear product proposition
- Consistent typography and spacing
- Restrained monochrome palette with meaningful status colours
- Familiar dashboard navigation
- Useful loading, empty and failure states
- Dense but understandable evidence and programme views
- Professional report design and company/client branding
- Responsive evidence grid and horizontally scrollable project navigation

Weaknesses:

- Public mobile navigation overflows and hides the primary CTA.
- Many normal dashboard controls are approximately 32-36px rather than robust field touch targets.
- The programme/Gantt experience is inherently desktop-oriented.
- The marketing evidence screenshot uses flat-colour placeholder images instead of credible construction photographs.
- The public site makes stronger trust claims than the implementation supports.
- Landing-page steps use repeated cards and could communicate the real product workflow more directly.
- The marketing site claims photo annotation that does not exist.

## Operations Review

The production health endpoint, UptimeRobot monitor, Vercel deployment, Inngest retries and documented smoke test provide a useful minimum baseline.

They are not sufficient for paying customers because:

- Supabase free-tier pausing has already caused outages.
- The health check proves only that a basic database query succeeds.
- Inngest failures, thumbnail delays and report-generation failures are not proactively alerted.
- There is no documented restore test or recovery-time objective.
- There is no frontend error monitoring.
- There is no service status page or support SLA.
- Critical external dependencies are not included in synthetic monitoring.

Supabase Pro and verified backups should be considered launch requirements, not optional post-pilot improvements.

## Legal And Privacy Review

This section is a readiness assessment, not legal advice. The policies should receive professional UK legal/data-protection review before paid launch.

Current gaps include:

- No full legal entity name, registered address or company number
- No stated lawful basis for each processing purpose
- Incomplete categories of recipients and international-transfer details
- No customer Data Processing Agreement
- No documented list of subprocessors
- No explicit operational process for access, export or deletion requests
- Account deletion is not propagated from Clerk to the database
- No acceptance record tying customers to the Terms of Service
- No detailed suspension, renewal, refund, VAT, notice or service-level terms
- Security and evidence claims exceed the technical implementation

## Competitive Review

The market is active and increasingly segmented. Sitefile is not unique as a photo/reporting product, but the combination of programme-linked evidence, low-friction capture and a complete UK-style progress-report output remains a credible wedge.

### Competitive Ranking

Ranked by threat to Sitefile's intended UK contractor reporting position:

#### 1. SiteGlance

The closest direct competitor. It offers programme imports, photos, AI monthly reports, a client portal, costs, risks and email digests from £29-£149/month, substantially undercutting Sitefile for multi-project firms.

- [SiteGlance](https://www.siteglance.co.uk/)

#### 2. Site Samurai

A broad UK contractor platform from £99/month per organisation with unlimited projects/users. It covers programme, commercial, safety and client workflows. Photo geotagging is Enterprise-only.

- [Site Samurai pricing](https://www.sitesamurai.co.uk/pricing)

#### 3. Raken and Dashpivot

These provide considerably stronger daily reporting, forms, safety, manpower, subcontractor reports, offline capture and automated distribution.

- [Raken daily reporting](https://www.rakenapp.com/features/daily-reports)
- [Dashpivot photo documentation](https://sitemate.com/software/dashpivot/construction-progress-photo-documentation/)

#### 4. CompanyCam

A polished photo-first product with offline use, GPS, annotations, reports and more than 60 integrations. It lacks Sitefile's programme-centred reporting but is substantially more mature in photo management.

- [CompanyCam plans](https://help.companycam.com/en/articles/14477655-companycam-plans-explained)

#### 5. PlanRadar and Fieldwire

Broader plan, ticket, form, BIM and RFI platforms. They are less specialised around a monthly progress-report workflow but are established and competitively priced.

- [PlanRadar pricing](https://www.planradar.com/gb/pricing/)
- [Fieldwire pricing](https://www.fieldwire.com/pricing/)

#### 6. OpenSpace and Buildots

These are not direct price competitors, but they define the enterprise ceiling through 360 capture, BIM/schedule integration, objective progress measurement and delay prediction.

- [OpenSpace progress tracking](https://www.openspace.ai/products/progress-tracking/)
- [Buildots](https://buildots.com/product/)

### Positioning Assessment

Sitefile's most defensible position is:

> Programme-linked monthly evidence reporting for UK contractors without enterprise implementation.

It should not position itself as general construction management or as a source of independently verified evidence until those capabilities exist.

The strongest differentiators are:

- Direct MS Project XML, Primavera P6 XML, Excel and PDF programme import
- Evidence linked to actual programme activities rather than generic folders
- Low-friction browser/PWA deployment with offline capture
- Unlimited site-team users within the project price
- A complete branded progress report rather than a photo-only export
- UK contractor terminology and reporting orientation

The weakest commercial point is pricing. At £99 per project per month, Sitefile can become more expensive than SiteGlance or Site Samurai for contractors running several projects. The pilot must validate that programme-linked evidence and report-time savings justify that premium.

## Go-Live Gate

Before the first unsupervised pilot:

1. Resolve the PDF-password discrepancy and all unsupported marketing claims.
2. Patch Next, Clerk, Inngest/protobuf and rerun build, audit and full E2E.
3. Upgrade Supabase and confirm backups/restoration.
4. Fix the public mobile navigation.
5. Complete a pilot agreement, DPA, privacy notice and deletion procedure.
6. Remove the report hash exposure and add distributed rate limiting.
7. Add error/job monitoring and a small critical-path automated test suite.

## Recommended Priority Order

### P0: Required before pilot data

- Correct or implement true PDF password protection
- Qualify or remove "tamper-evident", "verified" and annotation claims
- Patch direct production dependencies
- Fix report hash exposure
- Upgrade Supabase and verify backup/restore
- Fix mobile marketing navigation
- Put a pilot agreement and DPA in place

### P1: Required before paid launch

- Distributed rate limiting
- Clerk deletion synchronisation and operational data-deletion tooling
- Content Security Policy
- Sentry or equivalent monitoring
- Critical-path automated tests in CI
- External sharing flow with access control
- Legal review of privacy and terms
- Automated health checks covering upload and report generation

### P2: Product-market improvements

- Client portal, comments and read receipts
- Report approval/versioning
- Photo annotation
- Tags and stronger cross-project search
- Daily logs, weather, manpower and delay records
- Integrations/API
- More granular permissions and SSO
- Cryptographic sealing if dispute-grade evidence becomes a central promise

## Verification Performed

- TypeScript type check: passed
- Production build: passed
- ESLint: zero errors, 11 warnings
- Production health endpoint: successful
- Live desktop landing page: inspected
- Live mobile landing and sign-in: inspected at 390px
- Live security headers: inspected
- Production dependency audit: completed
- Current competitor and UK GDPR research: completed
- Documented 22 July production E2E result: reviewed

The destructive production E2E workflow was not rerun because it would create production users and project data. There is currently no meaningful automated test suite to run independently of that smoke workflow.

## Final Assessment

Sitefile has moved beyond a prototype. Its architecture, core workflow and report output are sufficiently coherent to justify a real-world pilot. The launch risk is not that the central workflow is missing; it is that the product currently promises stronger security and evidential properties than it delivers, while operating on infrastructure and legal processes that are still pre-commercial.

After the P0 work, a controlled free pilot is reasonable. Public self-service signup, paid conversion and broader marketing should wait until the P1 controls are complete and the pilot demonstrates that contractors will consistently capture evidence and value the resulting reports at £99 per project per month.
