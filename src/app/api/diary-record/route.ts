import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { projectMembers } from "@/server/db/schema";
import { resolveCurrentUser, DemoEnsureUserError } from "@/server/services/current-user";
import { assertProjectAccess } from "@/server/trpc/helpers";
import { gatherDiaryRecord, renderDiaryRecordHTML, diaryRecordCsv } from "@/server/services/diary-record";
import { writeAuditLogAsync } from "@/server/services/audit";
import { TRPCError } from "@trpc/server";

// Puppeteer renders a page per diary day; a month with photos needs
// longer than the default function budget.
export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PM_ROLES = new Set(["admin", "project_manager", "construction_manager"]);
const MAX_DAYS = 62;

/**
 * GET /api/diary-record?projectId=&from=&to=&format=pdf|csv
 * Authenticated download of the Site Diary Record. Managers get every
 * author's entries; anyone else gets their own entries only.
 */
export async function GET(req: NextRequest) {
  let resolved;
  try {
    resolved = await resolveCurrentUser(req.headers);
  } catch (e) {
    if (e instanceof DemoEnsureUserError) return NextResponse.json({ error: "Session unavailable" }, { status: 401 });
    throw e;
  }
  if (!resolved.userId || !resolved.orgId || !resolved.dbUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("projectId") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const format = sp.get("format") === "csv" ? "csv" : "pdf";
  if (!/^[0-9a-f-]{36}$/.test(projectId) || !DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: "projectId, from and to (yyyy-mm-dd) are required" }, { status: 400 });
  }
  const span = (new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86_400_000 + 1;
  if (span > MAX_DAYS) return NextResponse.json({ error: `Choose a range of ${MAX_DAYS} days or fewer` }, { status: 400 });

  try {
    await assertProjectAccess(db, projectId, resolved.orgId, resolved.userId);
  } catch (e) {
    if (e instanceof TRPCError) return NextResponse.json({ error: "Access denied" }, { status: e.code === "NOT_FOUND" ? 404 : 403 });
    throw e;
  }
  let onlyAuthorId: string | null = resolved.userId;
  if (resolved.dbUser.role === "admin") onlyAuthorId = null;
  else {
    const m = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, resolved.userId)), columns: { role: true } });
    if (m && PM_ROLES.has(m.role)) onlyAuthorId = null;
  }

  const data = await gatherDiaryRecord(db, { projectId, from, to, generatedBy: resolved.userId, onlyAuthorId });
  const slug = `site-diary-record_${from}_${to}`;
  writeAuditLogAsync(db, { projectId, userId: resolved.userId, action: "generate", entityType: "project", entityId: projectId, metadata: { diaryRecord: true, from, to, format, scope: onlyAuthorId ? "own" : "all" } });

  if (format === "csv") {
    return new NextResponse(diaryRecordCsv(data), {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug}.csv"`, "cache-control": "private, no-store" },
    });
  }
  const html = await renderDiaryRecordHTML(data);
  const { htmlToPdf } = await import("@/server/services/report-generator");
  const pdf = await htmlToPdf(html);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${slug}.pdf"`, "cache-control": "private, no-store" },
  });
}
