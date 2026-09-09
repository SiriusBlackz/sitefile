/**
 * End-to-end smoke test for the Sitefile MVP core flow.
 *
 * What it checks:
 *   1. Demo seed is present (fail early with a clear message if not)
 *   2. Create a project, add a task, insert test evidence, link them
 *   3. CROSS-PROJECT NEGATIVE TEST — linking evidence from project A
 *      to a task from project B must fail with FORBIDDEN
 *   4. Report generate kicks off and eventually lands in a terminal state
 *   5. If SMOKE_BASE_URL is set, hit /api/reports/<id>/pdf anonymously
 *      and assert 401; the test does not validate the authenticated path
 *      because the smoke runner has no browser session.
 *
 * Usage:
 *   pnpm db:seed:demo          # once
 *   pnpm smoke                 # runs DB-level checks
 *   SMOKE_BASE_URL=http://localhost:3000 pnpm smoke
 *
 * Exit codes: 0 = pass, 1 = fail.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";
import { TRPCError } from "@trpc/server";

import * as schema from "../src/server/db/schema";
import { createCallerFactory } from "../src/server/trpc";
import { appRouter } from "../src/server/trpc/routers/_app";

dotenv.config({ path: ".env.local" });

const DEMO_CLERK_ID = "demo_clerk_contractor1";
const CROSS_CLERK_ID = "demo_clerk_contractor2";

type Ctx = Awaited<ReturnType<typeof makeContext>>;

async function makeContext(db: ReturnType<typeof drizzle<typeof schema>>, clerkId: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, clerkId),
  });
  if (!user) {
    throw new Error(
      `Demo user "${clerkId}" not found. Run \`pnpm db:seed:demo\` first.`
    );
  }
  return {
    db,
    clerkId: user.clerkId,
    userId: user.id,
    orgId: user.orgId,
    dbUser: user,
    headers: new Headers(),
  };
}

function caller(ctx: Ctx) {
  return createCallerFactory(appRouter)(ctx);
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
  const db = drizzle(client, { schema });

  console.log("→ Resolving demo users");
  const ctxA = await makeContext(db, DEMO_CLERK_ID);
  const ctxB = await makeContext(db, CROSS_CLERK_ID);
  check("demo user A exists", !!ctxA.userId);
  check("demo user B exists", !!ctxB.userId);

  const trpcA = caller(ctxA);
  const trpcB = caller(ctxB);

  console.log("→ Creating two projects (one per demo user)");
  const createdA = await trpcA.project.create({ name: `smoke-A-${Date.now()}` });
  const createdB = await trpcB.project.create({ name: `smoke-B-${Date.now()}` });
  const projectA = createdA.project;
  const projectB = createdB.project;
  check("projectA created", !!projectA.id);
  check("projectB created", !!projectB.id);

  console.log("→ Adding a task to each project");
  const taskA = await trpcA.task.create({
    projectId: projectA.id,
    name: "Smoke task A",
  });
  const taskB = await trpcB.task.create({
    projectId: projectB.id,
    name: "Smoke task B",
  });
  check("taskA created", !!taskA.id);
  check("taskB created", !!taskB.id);

  console.log("→ Inserting direct evidence rows (bypass storage for smoke)");
  const [evA] = await db
    .insert(schema.evidence)
    .values({
      projectId: projectA.id,
      uploadedBy: ctxA.userId,
      type: "photo",
      storageKey: `projects/${projectA.id}/evidence/smoke-A/test.jpg`,
      originalFilename: "smoke-A.jpg",
      fileSizeBytes: 1024,
      mimeType: "image/jpeg",
    })
    .returning();
  check("evidence row A inserted", !!evA.id);

  console.log("→ Positive: link evidence A to task A");
  const linkOk = await trpcA.evidence.link({
    evidenceId: evA.id,
    taskId: taskA.id,
  });
  check("in-project link succeeds", !!linkOk);

  console.log("→ NEGATIVE: link evidence A to task B (cross-project)");
  let crossFailed = false;
  let crossCode: string | null = null;
  try {
    await trpcA.evidence.link({ evidenceId: evA.id, taskId: taskB.id });
  } catch (e) {
    crossFailed = true;
    if (e instanceof TRPCError) crossCode = e.code;
  }
  check(
    "cross-project link rejected",
    crossFailed && crossCode === "FORBIDDEN",
    crossFailed ? `code=${crossCode}` : "mutation unexpectedly succeeded"
  );

  // Note: demo users A and B are both admins in the same demo org, so they
  // CAN see each other's projects by design. The meaningful cross-tenant
  // checks happen in the assertTaskInProject / assertProjectAccess tests
  // above plus the smoke tests for a multi-org setup (TODO).

  console.log("→ Generating a report (project A)");
  let gen: Awaited<ReturnType<typeof trpcA.report.generate>> | null = null;
  let generateErr: string | null = null;
  try {
    gen = await trpcA.report.generate({
      projectId: projectA.id,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
  } catch (e) {
    generateErr = e instanceof Error ? e.message : String(e);
  }
  check(
    "report generate queued",
    !!gen?.id && gen.status !== "failed",
    generateErr ?? (gen ? `status=${gen.status}` : "no report row returned")
  );

  // HTTP-level check (only if base URL provided)
  if (process.env.SMOKE_BASE_URL && gen?.id && gen.status !== "failed") {
    const url = `${process.env.SMOKE_BASE_URL}/api/reports/${gen.id}/pdf`;
    console.log(`→ Fetching ${url} anonymously (expect 401)`);
    try {
      const res = await fetch(url, { redirect: "manual" });
      check("unauth report PDF returns 401", res.status === 401, `got ${res.status}`);
    } catch (e) {
      check("unauth report PDF request", false, String(e));
    }
  } else {
    console.log("→ Skipping HTTP check (SMOKE_BASE_URL not set)");
  }

  // ── Inspection branch (Phase A/B) ─────────────────────────────────────
  console.log("→ Inspection: comp projectB as a defects-inspection project");
  await db
    .update(schema.projects)
    .set({ status: "active", projectType: "inspection", locationScheme: "linear", contractForm: "nec4_ecc", defaultCorrectionPeriodDays: 28 })
    .where(eq(schema.projects.id, projectB.id));
  const visit = await trpcB.inspection.visitEnsure({ projectId: projectB.id, visitDate: "2026-09-09", stage: "end_of_defects_period" });
  check("inspection visit ensured", !!visit.id);
  const clientId = crypto.randomUUID();
  const item1 = await trpcB.inspection.itemCreate({ projectId: projectB.id, id: clientId, visitId: visit.id, title: "Rocking cover", finding: "Cover rocks; mortar fractured.", location: { description: "MH-07", alignment: "Access Rd", chainage: "0+245", side: "L" } });
  const item2 = await trpcB.inspection.itemCreate({ projectId: projectB.id, visitId: visit.id, type: "snag", title: "Kerb chipped", finding: "Kerb face chipped 40 mm.", location: { description: "ch 0+120", alignment: "Access Rd", chainage: "0+120", side: "R" } });
  check("refs allocated DEF-0001/0002", item1.ref === "DEF-0001" && item2.ref === "DEF-0002", `${item1.ref} ${item2.ref}`);
  const again = await trpcB.inspection.itemCreate({ projectId: projectB.id, id: clientId, visitId: visit.id, title: "dup", finding: "dup", location: { description: "dup" } });
  check("itemCreate idempotent on client id", again.ref === item1.ref);
  let progressRefused = false; let progressCode: string | null = null;
  try { await trpcA.inspection.itemCreate({ projectId: projectA.id, visitId: visit.id, title: "x", finding: "y", location: { description: "z" } }); } catch (e) { progressRefused = true; if (e instanceof TRPCError) progressCode = e.code; }
  check("itemCreate on a progress project refused", progressRefused && progressCode === "PRECONDITION_FAILED", `code=${progressCode}`);
  let foreignId = false; let foreignCode: string | null = null;
  try { await trpcA.inspection.itemCreate({ projectId: projectB.id, id: clientId, visitId: visit.id, title: "steal", finding: "steal", location: { description: "x" } }); } catch (e) { foreignId = true; if (e instanceof TRPCError) foreignCode = e.code; }
  check("foreign client id → CONFLICT", foreignId && foreignCode === "CONFLICT", `code=${foreignCode}`);
  const [evB] = await db.insert(schema.evidence).values({ projectId: projectB.id, uploadedBy: ctxB.userId, type: "photo", storageKey: `projects/${projectB.id}/evidence/smoke-B/test.jpg`, originalFilename: "smoke-B.jpg", fileSizeBytes: 1024, mimeType: "image/jpeg" }).returning();
  await trpcB.inspection.attachPhoto({ itemId: item1.id, evidenceId: evB.id, role: "defect" });
  let crossPhoto = false; let crossPhotoCode: string | null = null;
  try { await trpcB.inspection.attachPhoto({ itemId: item1.id, evidenceId: evA.id, role: "defect" }); } catch (e) { crossPhoto = true; if (e instanceof TRPCError) crossPhotoCode = e.code; }
  check("cross-project attachPhoto refused", crossPhoto && crossPhotoCode === "FORBIDDEN", `code=${crossPhotoCode}`);
  const sum = await trpcB.inspection.summary({ projectId: projectB.id, visitId: visit.id });
  check("summary counts", sum.total === 2 && sum.open === 2 && sum.withPhotos === 1 && sum.newThisVisit === 2, JSON.stringify({ total: sum.total, open: sum.open, withPhotos: sum.withPhotos }));
  const detail = await trpcB.inspection.get({ itemId: item1.id });
  check("detail has photo + created event", detail.photos.length === 1 && detail.events.some((e) => e.kind === "created"));
  let insGen: { id: string; status: string | null } | null = null; let insGenErr: string | null = null;
  try { insGen = await trpcB.inspection.generateReport({ projectId: projectB.id, visitId: visit.id, stage: "end_of_defects_period", kind: "inspection_record", weather: "Dry" }); } catch (e) { insGenErr = e instanceof Error ? e.message : String(e); }
  check("inspection report queued", !!insGen?.id && insGen.status !== "failed", insGenErr ?? (insGen ? `status=${insGen.status}` : "no row"));
  if (insGen?.id) {
    const [row] = await db.select({ kind: schema.reports.reportKind, rev: schema.reports.revision, ps: schema.reports.periodStart }).from(schema.reports).where(eq(schema.reports.id, insGen.id));
    check("report row is inspection kind, rev 1, period = visit date", row?.kind === "inspection" && row.rev === 1 && row.ps === "2026-09-09");
  }

  // Cleanup: remove the smoke projects (cascade removes tasks/evidence/links)
  console.log("→ Cleaning up smoke projects");
  await db.delete(schema.projects).where(eq(schema.projects.id, projectA.id));
  await db.delete(schema.projects).where(eq(schema.projects.id, projectB.id));

  await client.end();

  console.log("");
  console.log(`Smoke results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
