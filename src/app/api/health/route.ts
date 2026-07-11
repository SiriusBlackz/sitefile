import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Public health check for external uptime monitors (UptimeRobot /
 * cron-job.org, pinged every ~5 min). Doubles as a Supabase keep-alive:
 * the free-tier idle timer never fires as long as something touches the
 * DB, and the daily /api/cron/db-ping alone didn't prevent the 2026-07-06
 * pause.
 *
 * Deliberately unauthenticated — free monitor tiers can't send custom
 * headers. Response is a constant-shape JSON with no internals; the query
 * is SELECT 1, so abuse costs are bounded by function invocations.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      { ok: true, elapsedMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        type: "health",
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
