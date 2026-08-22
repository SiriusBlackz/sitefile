# Sitefile Report Output and Go-Live Readiness Review

**Review date:** 16 August 2026  
**Scope:** Architecture, frontend, backend, workflow, security, report generation, construction reporting practice, automation opportunities, priorities, and go-live readiness.  
**Reference report:** TRS Report.pdf (third-party sample report, kept local-only at repo root, not committed)

## Executive conclusion

Sitefile has a strong product concept and a sensible modern architecture. Its best capability is the phone-first capture, linking, and presentation of photographic evidence. It could already support a controlled customer pilot as an evidence-backed progress report drafting platform.

It is not yet ready to claim that it automatically produces contract-grade contractor progress reports without qualified human review. The principal limitations are the programme model, progress calculations, missing construction-management registers, evidence-verification claims, and report approval controls.

| Area | Assessment |
| --- | ---: |
| Product concept | 8/10 |
| Capture workflow | 8/10 |
| Architecture | 7/10 |
| Frontend usability | 7/10 |
| Security implementation | 6/10 |
| Report presentation | 6/10 |
| Reporting data model | 4/10 |
| Programme/progress methodology | 4/10 |
| Contractual defensibility | 4/10 |
| Broad go-live readiness | Controlled pilot only |

## What works well

- Next.js, TypeScript, tRPC, PostgreSQL/Drizzle, Clerk, R2, Inngest, and asynchronous PDF generation form an appropriate modular architecture.
- Project membership checks, upload intents, file-size limits, short-lived authenticated downloads, high-entropy share tokens, and encrypted PDFs are good security foundations.
- The capture workflow is well matched to real construction behaviour: mobile camera, offline queue, batch review, GPS zones, and programme-task linking.
- The readiness dashboard detects unlinked photographs, uncaptured activities, contradictory task statuses, and stale programmes.
- The generated document is visually more professional than many small-contractor reports.
- Preview, contractor branding, client delivery links, and open/download tracking provide a coherent end-to-end workflow.
- Human confirmation remains part of evidence linking and narrative approval, reducing the risk of unreviewed automation.

## Critical report weaknesses

### 1. Progress methodology is not professionally defensible

Actual progress is calculated as a simple average of every task's percentage, including summary tasks. Planned progress is an unweighted average of linearly elapsed activity durations. It is not weighted by quantities, cost, duration, labour, or an approved work breakdown structure.

This can produce a precise-looking percentage that does not represent physical or earned progress. The chosen methodology must be project-specific, disclosed in the report, and consistently applied.

### 2. The first programme import is assumed to be the accepted baseline

Upload order does not establish contractual acceptance. A first uploaded programme might be a tender programme, working copy, recovery programme, or unaccepted revision.

Re-baselining currently replaces the only baseline record. Although the action is audit logged, the baseline history is not preserved as a proper series of immutable programme revisions.

### 3. Programme updates are unsafe

The default import behaviour appends activities, potentially creating duplicates. Clearing existing activities deletes them and can cascade deletion of evidence links.

Programme imports should instead create immutable revisions and reconcile activities using stable identities. Sitefile should show added, removed, renamed, moved, or resequenced tasks before a revision is accepted.

### 4. The programme model is too shallow

The task model does not include the information needed for credible programme analysis, including:

- Predecessors and successors
- Logic relationships and lags
- Critical path
- Total and free float
- Constraints
- Remaining duration
- Separate current-plan and forecast dates
- Resources and productivity
- Quantities and progress weights
- Delay cause, responsible party, and recovery action

Without these fields, Sitefile can highlight possible slippage but cannot perform a reliable delay, critical-path, or recovery assessment.

### 5. Reports are not generated from a frozen approved snapshot

The preview reads live project data and final generation reads the data again later. Tasks, evidence, notes, or programme information can change between preview, approval, and PDF creation.

The final report should be generated from an immutable source snapshot containing every input, source revision, calculation method, approval, and evidence identifier. The final PDF should have a retained document hash.

### 6. Formal contract terminology is conflated

The title "Key Issues & Early Warnings" mixes ordinary project issues with formal NEC early warnings. Similarly, zero-duration programme activities are treated as Key Dates even though a contractual Key Date is not simply an ordinary milestone.

Sitefile should keep the following distinct:

- General risks
- Issues
- Actions and decisions
- NEC early warnings
- Compensation events or changes
- Contractual Key Dates
- Programme milestones

It should not recommend re-baselining merely because a programme is stale. The first response should be to obtain the latest accepted or submitted programme and state its status accurately.

### 7. The lookahead is not a proper forecast

The lookahead derives future work from planned dates and incomplete activities. It does not contain forecast dates, work fronts, constraints, responsible owners, resources, required information, or recovery commitments.

A professional lookahead should identify what is genuinely expected to happen, what could prevent it, and who must act.

### 8. Evidence assurance is overstated

Mobile browser capture does not necessarily preserve original camera EXIF. Some capture time and GPS information is supplied by the client application rather than independently extracted and verified on the server.

Statements such as "EXIF Preserved," "Zone Verified," and automatic capture-time assertions are stronger than the underlying evidence supports.

Sitefile should record and disclose:

- Capture source: Sitefile camera, original upload, forwarded file, or imported file
- Timestamp source: application clock, original EXIF, upload time, or manual entry
- GPS source and reported accuracy
- Server receipt time
- Original and processed file hashes
- Server-side metadata extraction result
- Whether a coordinate falls within a configured zone

"Located within configured zone" is more accurate than "verified."

### 9. Electronic sign-off is not identity-bound

A typed name can be converted into a cursive image and labelled "Digitally Signed." The report does not bind the approval to an authenticated identity, authority, exact report snapshot, document hash, or signing method.

Sitefile should retain a structured approval event containing the authenticated user, role, organisation, timestamp, approval statement, report snapshot ID, and PDF hash. Until then, "electronically approved" is safer than "digitally signed."

### 10. Readiness gates are advisory

Reports can be generated without photographs, an approved narrative, a current programme, or a signature. This conflicts with UI wording suggesting that signing or readiness blocks issue.

Each project should have configurable minimum issue requirements. High-risk gaps should either block generation or require a recorded exception and approver.

## Missing professional report content

A client-facing contractor report should support proportionate versions of the following sections:

- Contract particulars, reporting period, data date, and information basis
- Accepted programme revision, current revision, and forecast completion
- Progress by work package with a declared measurement method
- Critical and near-critical activities, float movement, delay causes, and recovery actions
- Four-to-six-week lookahead with constraints, owners, and resources
- Risk, issue, action, and decision registers
- Formal early warnings and compensation events, where relevant
- Quality inspections, test results, non-conformance reports, defects, and close-out
- Design information, requests for information, submittals, and approvals
- Procurement, long-lead items, manufacturing status, and deliveries
- Labour, subcontractors, major plant, quantities, and productivity
- Commercial and payment position where contractually appropriate
- Health and safety narrative, hours worked, events, corrective actions, and RIDDOR status
- Environmental, sustainability, and social-value information where required
- Evidence schedule with stable photograph identifiers and cross-references

Not every project needs every section. The project setup should determine which sections are required and the report should state when a section is not applicable, not simply omit it without explanation.

## Highest-value new feature: supervisor site diaries

The strongest way to improve report substance while preserving Sitefile's low-input objective is a structured daily or weekly supervisor diary.

### Recommended experience

The diary should take approximately 60 to 90 seconds for a routine submission:

1. Sitefile preselects the project, reporting date, weather, location, likely programme activities, and recently captured photographs.
2. The supervisor confirms work completed, work location, approximate quantities, and progress movement.
3. Labour, subcontractors, and major plant use quick counters with remembered defaults.
4. A voice note is converted into structured progress, blockers, instructions, decisions, and next actions.
5. Additional questions appear only when Sitefile detects a delay, contradiction, incident, missing evidence, or incomplete action.
6. The supervisor reviews and approves the factual record.
7. Multiple supervisors' submissions roll up by work package, subcontractor, or site area.
8. The office team reviews exceptions and commercial or contractual wording rather than reconstructing the month from photographs.
9. The approved diary records form the factual basis of the monthly client report.

### Suggested diary fields

- Work completed and work area
- Activity or work-package link
- Quantity completed and unit
- Progress change or remaining duration
- Labour by contractor or trade
- Major plant used and downtime
- Deliveries and inspections
- Quality issues, tests, NCRs, and defects
- H&S events, briefings, observations, and corrective actions
- Instructions, decisions, and RFIs
- Blockers and constraints
- Planned work for the next shift or week
- Linked photographs and documents

The system should infer as much as possible from the programme, GPS, weather, previous diary, project defaults, and captured evidence. Human attention should be reserved for changes, exceptions, and professional judgement.

## One-time project setup pack

Rather than asking for more information every month, Sitefile should request a more complete setup once and reuse it throughout the project.

The setup pack should include:

- Contract or subcontract document
- Scope and reporting requirements
- Client report template, if applicable
- Accepted programme and revision status
- Contract type and relevant amendments
- Contract value and commercial-reporting permissions
- Completion date, sectional dates, and contractual Key Dates
- Parties, contacts, roles, and approval authority
- Site location, work areas, and GPS zones
- Work breakdown structure and work packages
- Required H&S, quality, environmental, and social-value measures
- Client recipients and distribution rules

AI can extract candidate information, but high-risk fields such as dates, contract status, notices, values, and acceptance status must be confirmed by an authorised user.

## Integration strategy

Direct integration with every contract-administration platform should not be the first implementation step. The data model and report controls should be corrected first.

The recommended progression is:

1. Import programme files, contract documents, registers, and spreadsheet exports.
2. Add a dedicated project email inbox for instructions, notices, RFIs, and delivery documents.
3. Support scheduled read-only imports from common document and programme exports.
4. Add API integrations where customer demand justifies them.

Potential systems include P6, Powerproject, Procore, Autodesk Construction Cloud, Aconex, Asite, Viewpoint, and CEMAR. Integrations should be read-only initially, permission-scoped, source-labelled, and fully traceable.

## Architecture assessment

The modular web application and managed-service architecture are appropriate for the product's current scale. Asynchronous media processing and PDF generation are sensible, and the application has clear service, routing, data, and presentation layers.

The main architectural weakness is that the database structure reflects an evidence tracker more than a construction reporting system. Important construction concepts are stored as free text or are absent entirely. Adding more PDF templates without first improving the domain model would increase presentation breadth without improving reliability.

The recommended architectural direction is:

- Immutable programme and report revisions
- Structured construction registers
- Explicit source provenance
- Calculation-method configuration
- Approval and issue workflows
- Event-driven report compilation from approved records
- Tenant-isolation defence in depth
- Production observability and automated regression testing

## Frontend and workflow assessment

The frontend is strongest on mobile capture and evidence triage. Offline capture, batch workflows, status prompts, visual readiness indicators, and client-facing report sharing are appropriate for users working between site and office.

Areas requiring refinement include:

- The report builder and generation dialog overlap and can communicate contradictory rules.
- Readiness percentage weights cosmetic, optional, and critical requirements equally.
- Final-stage forms require information that should have been collected through diaries or project setup.
- Team onboarding depends on users already belonging to the same organisation, which can obstruct site adoption.
- Signing language and controls imply stronger approval than the system currently records.
- Generated PDF layout requires automated visual checks for clipping, overflow, missing images, and pagination errors.

The target workflow should be capture facts continuously, review exceptions weekly, approve the monthly snapshot, preview the exact final document, issue it, and record delivery separately from client acceptance.

## Security assessment

### Positive controls

- Clerk authentication
- Organisation and project membership checks
- Restricted project access helpers
- Upload intents, path validation, and size limits
- Safe production error responses
- High-entropy public share tokens
- Revocable report links
- Short-lived authenticated download tokens
- Password hashing and encrypted PDFs
- Security headers including HSTS, frame denial, and content-type protection

### Security and governance gaps

- Rate limiting is held in process memory and is unreliable across serverless instances.
- No Content Security Policy was found.
- Row-level security is enabled in the schema, but no database policies were found in the migrations. Tenant isolation appears to depend primarily on application-layer checks and should be independently verified.
- Report passwords remain recoverable by the server after successful generation.
- Public open events may include mail scanners or automated security tools and should not be described as proof of human or contractual receipt.
- GPS coordinates, site photographs, names, and audit records require explicit retention, deletion, privacy, and access policies.
- Metadata supplied by client devices is not consistently verified server-side.
- Audit writes can be asynchronous and failure-tolerant, so the audit trail should not be described as complete or immutable.
- No established automated unit, integration, security, or PDF visual-regression suite was found.
- No production observability or error-monitoring integration was identified during the review.

## Priorities

### P0 - Required before broad go-live

1. Replace the current progress averages with a configurable, disclosed, and auditable measurement method.
2. Introduce immutable programme revisions and explicitly identify accepted, current, submitted, and forecast programmes.
3. Reconcile programme updates without duplicating tasks or deleting evidence associations.
4. Freeze the approved report source snapshot before final generation and retain its document hash.
5. Correct EXIF, GPS, verification, receipt, and digital-signature claims.
6. Separate risks, issues, actions, early warnings, compensation events, milestones, and contractual Key Dates.
7. Add configurable readiness gates and recorded approval of exceptions.
8. Bind report approval to authenticated identities and the exact frozen snapshot.
9. Add automated calculation tests, access-control tests, import tests, and PDF visual-regression tests.
10. Complete production security hardening, observability, privacy, retention, and backup verification.

### P1 - Principal product differentiators

1. Deliver daily and weekly supervisor diaries with speech-to-text and conditional prompts.
2. Add the one-time project setup pack with AI-assisted extraction and human confirmation.
3. Introduce structured quantities, resources, constraints, actions, quality, H&S, design, procurement, and change records.
4. Provide contract- and client-specific report profiles rather than one universal report.
5. Roll up multiple supervisors, subcontractors, work packages, and site areas into one reporting period.
6. Add progress confidence and data-quality indicators rather than presenting unsupported precision.
7. Provide a professional four-to-six-week lookahead and recovery-action workflow.

### P2 - Extended automation and integrations

1. Add read-only ingestion from programme, CDE, and contract-administration systems.
2. Add a project email intake channel with source classification and duplicate detection.
3. Import client registers and reporting templates from controlled exports.
4. Add client review, acknowledgement, comments, and authenticated remote approval.
5. Add portfolio benchmarking for evidence coverage, reporting timeliness, productivity, risk ageing, and action close-out.
6. Add optional commercial, sustainability, and social-value modules for customers that require them.

## Standards and professional benchmark

The recommendations are consistent with the following industry and public-sector principles:

- [NEC guidance on maintaining an up-to-date Accepted Programme](https://www.neccontract.com/news/why-an-up-to-date-accepted-programme-is-essential-for-success)
- [Government Functional Standard GovS 002: Project Delivery](https://projectdelivery.gov.uk/govs-002-project-delivery-functional-standard/)
- [The Construction Playbook](https://www.gov.uk/government/publications/the-construction-playbook)
- [ISO 19650-1 information-management principles](https://www.iso.org/standard/68078.html)
- [ISO 21508:2026 earned value management guidance](https://www.iso.org/standard/87899.html)
- [HSE RIDDOR guidance](https://www.hse.gov.uk/riddor/key-definitions.htm)

These references do not prescribe one universal contractor report. They reinforce the need for controlled information, clear responsibilities, traceable sources, reliable programme and progress methods, timely risk reporting, and proportionate governance.

## Go-live decision

### Controlled pilot

**Decision: Yes.**

Sitefile is suitable for selected pilot customers where every report is reviewed by a competent contractor representative or contract administrator before issue. The product should be positioned as producing an evidence-backed professional draft rather than independently verified contractual truth.

### Automated evidence-backed report drafting

**Decision: Yes, with careful wording and safeguards.**

The current product already offers meaningful value by organising evidence, identifying reporting gaps, drafting narrative, and producing a well-presented PDF. Claims must accurately describe the source and limitations of the information.

### Broad, unsupervised contract-grade reporting

**Decision: No, not yet.**

Sitefile should not currently be promoted as an unsupervised contract-grade reporting system across NEC, JCT, FIDIC, or bespoke contracts. The P0 controls are required before that claim becomes defensible.

## Final recommendation

Sitefile should retain its evidence-first identity but evolve from a photo-to-PDF tool into a controlled reporting system built from three layers:

1. **Continuous site facts:** photographs, supervisor diaries, quantities, resources, events, and constraints.
2. **Controlled project information:** contract profile, programme revisions, formal registers, reporting requirements, and approved calculations.
3. **Governed report issue:** frozen snapshot, human review, authenticated approval, exact PDF generation, delivery tracking, and client acknowledgement.

The supervisor diary is the most valuable next product feature because it fills the largest information gap without transferring substantial month-end work to the contractor. Combined with the P0 programme, calculation, verification, and approval improvements, it would materially raise the report from a polished evidence pack toward a credible professional contractor progress report.
