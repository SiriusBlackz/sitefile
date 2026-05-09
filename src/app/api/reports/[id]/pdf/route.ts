import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { reports } from "@/server/db/schema";
import { resolveCurrentUser, DemoEnsureUserError } from "@/server/services/current-user";
import { assertProjectAccess } from "@/server/trpc/helpers";
import { fetchFromStorage } from "@/server/services/storage";
import { verifyReportToken } from "@/server/services/report-tokens";
import { TRPCError } from "@trpc/server";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let resolved;
  try {
    resolved = await resolveCurrentUser(req.headers);
  } catch (e) {
    if (e instanceof DemoEnsureUserError) {
      console.error("[reports pdf] demo user resolution failed:", e.cause);
      return json(401, { error: "Session unavailable" });
    }
    throw e;
  }
  if (!resolved.userId || !resolved.orgId) {
    return json(401, { error: "Not signed in" });
  }

  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
  });
  if (!report) {
    return json(404, { error: "Report not found" });
  }

  try {
    await assertProjectAccess(db, report.projectId, resolved.orgId, resolved.userId);
  } catch (e) {
    if (e instanceof TRPCError) {
      const status = e.code === "NOT_FOUND" ? 404 : 403;
      return json(status, { error: "Access denied" });
    }
    throw e;
  }

  if (report.status !== "completed") {
    return json(409, { error: "Report is not ready" });
  }

  // A short-lived signed token is required to access the PDF, regardless of
  // whether a password is set. The token is minted by report.download after
  // it has validated project access and the password (if any). The token is
  // bound to the requesting user, so a leaked URL cannot be replayed by a
  // different signed-in user. Tokens expire after 60s.
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return json(401, { error: "Download token required" });
  }
  const verified = verifyReportToken(token);
  if (!verified) {
    return json(401, { error: "Invalid or expired download token" });
  }
  if (verified.reportId !== id || verified.userId !== resolved.userId) {
    return json(403, { error: "Token does not match request" });
  }

  // Resolve the bytes — prefer inline base64, fall back to storage (R2 or disk).
  // Never hand out a public R2 URL for a report; always stream through this
  // auth+password-aware route.
  const reportData = report.reportData as Record<string, unknown> | null;
  const pdfBase64 = reportData?.pdfBase64 as string | undefined;
  let pdfBuffer: Buffer | null = null;
  if (pdfBase64) {
    pdfBuffer = Buffer.from(pdfBase64, "base64");
  } else if (report.pdfStorageKey) {
    pdfBuffer = await fetchFromStorage(report.pdfStorageKey);
  }
  if (!pdfBuffer) {
    return json(404, { error: "PDF not available" });
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="report-${report.reportNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
