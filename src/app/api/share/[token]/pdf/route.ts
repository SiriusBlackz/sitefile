import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { reportShares, reportShareEvents } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { fetchFromStorage } from "@/server/services/storage";

/**
 * Public PDF download behind a share token. The token is the credential;
 * a passworded report's PDF is itself AES-256 encrypted, so the file is
 * safe to hand over — opening it still needs the out-of-band password.
 * Each fetch logs a "downloaded" receipt event.
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const share = await db.query.reportShares.findFirst({
    where: eq(reportShares.token, token),
    with: { report: { columns: { status: true, pdfStorageKey: true, reportNumber: true } } },
  });
  if (
    !share ||
    share.revokedAt ||
    share.report.status !== "completed" ||
    !share.report.pdfStorageKey
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const pdf = await fetchFromStorage(share.report.pdfStorageKey);
  if (!pdf) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  await db.insert(reportShareEvents).values({
    shareId: share.id,
    event: "downloaded",
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${share.report.reportNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
