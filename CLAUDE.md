# Sitefile — CLAUDE.md

> This file is the project instruction spec. Read it fully before starting any work.
>
> **Note on the repo directory name:** the folder is still `siteproof/` — renaming the working tree is a larger operation (IDE / Vercel link / scripts all reference the path) and happens after the brand cutover is stable. The product is "Sitefile"; the local path is historical.

## Project overview

Sitefile is a **Contractor Progress Evidence Tracker** — a web app where construction contractors upload photos/videos from site, AI-links them to programme tasks, and generates branded, password-protected PDF progress reports.

**Workflow:** Capture (phone) → Link (AI-assisted) → Report (laptop)
**Pricing:** £99 per project / month

**Current mode (Jul 2026): go-live.** The forward roadmap is `GO-LIVE-PLAN.md` (repo root; context in `GO-LIVE-BRIEF.md`); the phase log is `PROGRESS.md`. Target: one free pilot contractor on a real programme, unsupervised, converting to paid after one reporting cycle.

---

## Build rules

- Always use TypeScript with strict mode
- Use the Next.js 14+ App Router (not Pages Router)
- Use server components by default, mark client components explicitly with "use client"
- All database queries go through Drizzle ORM — never raw SQL in route handlers
- Use tRPC for all API communication between client and server
- Use Zod for all input validation (tRPC + forms)
- Follow the exact project structure defined below — don't invent new directories
- Use shadcn/ui components — install them via the CLI as needed
- Use Tailwind CSS for all styling — no CSS modules, no styled-components
- Test that pages render before moving to the next task
- Commit logical units of work — don't build everything in one pass

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui v4 (Base UI) |
| API | tRPC |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Supabase) |
| Auth | Clerk |
| Storage | Cloudflare R2 (S3-compatible) |
| Background jobs | Inngest |
| PDF generation | Puppeteer (headless Chromium) |
| Image processing | Sharp + exifr |
| Maps | Mapbox GL JS |
| Payments | Stripe |
| AI | Claude API (Sonnet) for v2 image recognition |
| Hosting | Vercel |

---

## Database schema

```sql
-- Organisations (multi-tenant root)
CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  subscription_tier TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Users (linked to Clerk)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL,
  reference TEXT,
  client_name TEXT,
  contract_type TEXT,
  schedule_mode TEXT NOT NULL DEFAULT 'manual',
  reporting_frequency TEXT DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active',
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Project members (many-to-many)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  UNIQUE(project_id, user_id)
);

-- Tasks (programme activities)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES tasks(id),
  name TEXT NOT NULL,
  description TEXT,
  planned_start DATE,
  planned_end DATE,
  actual_start DATE,
  actual_end DATE,
  progress_pct INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  sort_order INTEGER DEFAULT 0,
  source_ref TEXT,
  status TEXT DEFAULT 'not_started',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GPS zones (polygons drawn on map)
CREATE TABLE gps_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  polygon JSONB NOT NULL,
  default_task_id UUID REFERENCES tasks(id),
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Evidence (photos/videos)
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'photo',
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  original_filename TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  captured_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  exif_data JSONB,
  note TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Evidence-to-task links (many-to-many with metadata)
CREATE TABLE evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_method TEXT NOT NULL DEFAULT 'manual',
  ai_confidence REAL,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(evidence_id, task_id)
);

-- Reports (generated PDFs)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL REFERENCES users(id),
  report_number INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pdf_storage_key TEXT,
  password_hash TEXT,
  report_data JSONB,
  status TEXT DEFAULT 'generating',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log (immutable)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Project structure

```
sitefile/  (on-disk path is still `siteproof/` — rename deferred)
├── CLAUDE.md                       ← this file
├── .env.example
├── .env.local
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── drizzle.config.ts
├── next.config.ts
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/
│   │   │   ├── sign-in/page.tsx
│   │   │   └── sign-up/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── projects/
│   │   │       ├── new/page.tsx
│   │   │       └── [projectId]/
│   │   │           ├── page.tsx
│   │   │           ├── tasks/page.tsx
│   │   │           ├── evidence/page.tsx
│   │   │           ├── zones/page.tsx
│   │   │           ├── reports/page.tsx
│   │   │           └── settings/page.tsx
│   │   ├── (mobile)/
│   │   │   ├── layout.tsx
│   │   │   ├── capture/page.tsx
│   │   │   └── upload/page.tsx
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts
│   │       ├── webhooks/
│   │       │   ├── clerk/route.ts
│   │       │   └── stripe/route.ts
│   │       └── inngest/route.ts
│   │
│   ├── server/
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── trpc/
│   │   │   ├── index.ts
│   │   │   ├── context.ts
│   │   │   └── routers/
│   │   │       ├── project.ts
│   │   │       ├── task.ts
│   │   │       ├── evidence.ts
│   │   │       ├── zone.ts
│   │   │       ├── report.ts
│   │   │       └── dashboard.ts
│   │   ├── services/
│   │   │   ├── storage.ts
│   │   │   ├── exif.ts
│   │   │   ├── ai-linker.ts
│   │   │   ├── programme-import.ts
│   │   │   ├── report-generator.ts
│   │   │   └── audit.ts
│   │   └── inngest/
│   │       ├── client.ts
│   │       └── functions/
│   │           ├── process-upload.ts
│   │           └── generate-report.ts
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   └── project-header.tsx
│   │   ├── projects/
│   │   │   ├── project-card.tsx
│   │   │   └── project-form.tsx
│   │   ├── tasks/
│   │   │   ├── task-list.tsx
│   │   │   ├── task-form.tsx
│   │   │   ├── gantt-chart.tsx
│   │   │   └── import-dialog.tsx
│   │   ├── evidence/
│   │   │   ├── evidence-grid.tsx
│   │   │   ├── evidence-card.tsx
│   │   │   ├── camera-capture.tsx
│   │   │   ├── upload-queue.tsx
│   │   │   └── task-linker.tsx
│   │   ├── zones/
│   │   │   └── zone-map-editor.tsx
│   │   └── reports/
│   │       ├── report-list.tsx
│   │       ├── generate-dialog.tsx
│   │       └── templates/
│   │           ├── report-shell.tsx
│   │           ├── cover-page.tsx
│   │           ├── executive-summary.tsx
│   │           ├── programme-timeline.tsx
│   │           ├── evidence-gallery.tsx
│   │           ├── before-after.tsx
│   │           ├── verification.tsx
│   │           └── sign-off.tsx
│   │
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── geo.ts
│   │   ├── dates.ts
│   │   └── trpc.ts
│   │
│   └── types/
│       ├── project.ts
│       ├── evidence.ts
│       └── report.ts
│
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
│
└── scripts/
    ├── seed.ts
    └── migrate.ts
```

---

## API routes (tRPC)

### Projects
- `project.list` — List projects for org (paginated, filtered by status)
- `project.get` — Get project by ID
- `project.create` — Create project
- `project.update` — Update project settings
- `project.archive` — Archive project
- `project.memberList` — List project members
- `project.memberAdd` — Add member to project
- `project.memberRemove` — Remove member
- `project.orgUsers` — List users in the caller's organisation

### Tasks
- `task.list` — List tasks for project (tree structure)
- `task.create` — Create task manually
- `task.update` — Update task
- `task.delete` — Delete task
- `task.reorder` — Reorder tasks
- `task.import` — Import from MS Project XML / P6 XML

### Evidence
- `evidence.getUploadUrl` — Generate presigned R2 upload URL
- `evidence.confirm` — Confirm upload, trigger processing
- `evidence.list` — List evidence (paginated, filtered)
- `evidence.get` — Get single evidence item
- `evidence.updateNote` — Add/edit annotation
- `evidence.delete` — Soft delete
- `evidence.link` — Link evidence to task
- `evidence.unlink` — Remove link
- `evidence.suggest` — Get AI task suggestions

### GPS zones
- `zone.list` — List zones for project
- `zone.create` — Create zone
- `zone.update` — Update zone
- `zone.delete` — Delete zone

### Reports
- `report.list` — List reports for project
- `report.generate` — Trigger report generation
- `report.get` — Get report metadata
- `report.download` — Get presigned download URL

### Dashboard
- `dashboard.summary` — Aggregated stats
- `dashboard.recentActivity` — Recent activity feed

---

## Implementation phases

### Phase 1 — Core loop (build first)
1. ~~Scaffold Next.js + Tailwind + shadcn/ui + Clerk + Drizzle + Supabase~~ ✅
2. ~~Database schema + migrations~~ ✅
3. ~~Project CRUD (create, list, view)~~ ✅
4. ~~Manual task list (add, edit, reorder, delete)~~ ✅
5. ~~Evidence upload (presigned URL → R2, EXIF extraction, thumbnails)~~ ✅
6. ~~Evidence gallery (grid view, filters)~~ ✅
7. ~~Manual task linking (dropdown)~~ ✅

### Phase 2 — Intelligence
8. ~~GPS zone map editor (Mapbox)~~ ✅
9. ~~AI task suggestion (GPS + time + recency)~~ ✅
10. ~~MS Project / P6 XML import~~ ✅

### Phase 3 — Reports
11. ~~Report HTML templates (7 pages)~~ ✅
12. ~~PDF generation (Puppeteer + password protection)~~ ✅
13. ~~Report management (generate, list, download)~~ ✅
14. ~~Before/after photo pairing~~ ✅

### Phase 4 — Polish & billing
15. ~~PWA setup (manifest, service worker)~~ ✅
16. ~~Mobile capture flow~~ ✅
17. ~~Stripe integration~~ ✅ (coded, uncommitted)
18. ~~Audit log UI~~ ✅
19. ~~Gantt chart with evidence markers~~ ✅

### Phase 5 — Security & launch hardening ✅
20. ~~Auth on all endpoints (protectedProcedure + org isolation)~~ ✅
21. ~~Audit logging wired into all mutations~~ ✅
22. ~~Dashboard stats page (project counts, activity feed)~~ ✅

---

## Environment variables

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=sitefile-media
R2_PUBLIC_URL=https://media.sitefile.app
ANTHROPIC_API_KEY=sk-ant-...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
```

---

## Key design decisions

- **R2 over S3:** Zero egress fees — critical for photo-heavy app at scale
- **Presigned URLs:** Upload direct to R2, skip the server (avoids Vercel 10s timeout)
- **Inngest:** Serverless job queue — no Redis, works on Vercel
- **Puppeteer for PDF:** HTML/CSS gives full design control for complex 7-page reports
- **Heuristic AI linking (not LLM):** GPS zone + time + recency gets 80%+ accuracy, zero API cost
- **Drizzle over Prisma:** Lighter, faster, better for geospatial queries
- **evidence_links as join table:** One photo can link to multiple tasks; tracks link method (manual/AI/auto)
- **shadcn v4 (Base UI):** No `asChild` prop on Button — use `buttonVariants()` with Link/anchor elements instead. Select uses Base UI primitives (value can be `string | null`).
- **postgres.js driver:** Using `postgres` (postgres.js), not `pg` (node-postgres) — lighter, recommended pairing with Drizzle

---

## Report template (7 pages)

1. **Cover** — Logo, contractor name, project ref, contract type, report number, period, generation timestamp
2. **Executive summary** — Planned vs actual %, variance, tasks completed/in-progress/delayed, evidence count, key risks
3. **Programme timeline** — Gantt bars with evidence markers (amber dots) pinned to capture dates
4. **Evidence gallery** — Photos grouped by task; each with timestamp, GPS coords, uploader name/role, annotation
5. **Before/after** — AI-paired earliest + latest photos per task per GPS zone
6. **Verification** — EXIF preservation status, GPS verification rate, upload vs capture time analysis, audit trail summary
7. **Sign-off** — Contractor, PM, Client signature blocks + legal disclaimer
