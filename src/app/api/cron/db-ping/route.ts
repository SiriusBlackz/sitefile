import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Daily Supabase keep-alive ping. Runs at 04:00 UTC via Vercel Cron
 * (configured in vercel.json). Issues a trivial SELECT 1 so Supabase's
 * free-tier idle timer (currently ~7 days) never fires and pauses the
 * project.
 *
 * Auth: Vercel automatically sets `Authorization: Bearer ${CRON_SECRET}`
 * on cron-triggered requests when CRON_SECRET is configured. Reject any
 * request that doesn't carry the matching token — without this anyone
 * could DoS the endpoint and rack up function invocations.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const elapsedMs = Date.now() - startedAt;
    // Single greppable JSON line — easy to alert on if elapsedMs spikes
    // (typical cold-start ping is <500ms; sustained >2s = something off).
    console.log(
      JSON.stringify({
        type: "db_ping",
        ok: true,
        elapsedMs,
        ts: new Date().toISOString(),
      })
    );
    return NextResponse.json({ ok: true, elapsedMs });
  } catch (err) {
    console.error(
      JSON.stringify({
        type: "db_ping",
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
