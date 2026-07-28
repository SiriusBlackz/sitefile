import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Daily Supabase keep-alive ping. Runs at 04:00 UTC via Vercel Cron
 * (configured in vercel.json), plus a redundant GitHub Actions schedule
 * (.github/workflows/keepalive.yml).
 *
 * Supabase's free-tier idle timer counts activity on the PLATFORM API
 * (REST/auth/storage) — a direct Postgres SELECT through the pooler does
 * not reliably reset it, which is why the project kept pausing despite
 * this cron. So we do both: a SQL ping (proves the DB answers) and a
 * REST API ping (resets the idle timer).
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
  let dbOk = false;
  let restOk = false;
  let restStatus: number | null = null;
  let errorMsg: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: supabaseKey },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      restStatus = res.status;
      // Any authenticated response (even 4xx from RLS) proves the request
      // reached the platform API, which is what resets the idle timer.
      restOk = res.status < 500;
    } catch (err) {
      errorMsg =
        (errorMsg ? `${errorMsg}; ` : "") +
        (err instanceof Error ? err.message : String(err));
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const ok = dbOk && (restOk || !supabaseUrl);
  const payload = {
    type: "db_ping",
    ok,
    dbOk,
    restOk,
    restStatus,
    elapsedMs,
    ...(errorMsg ? { error: errorMsg } : {}),
    ts: new Date().toISOString(),
  };
  // Single greppable JSON line — easy to alert on if elapsedMs spikes
  // (typical cold-start ping is <500ms; sustained >2s = something off).
  if (ok) {
    console.log(JSON.stringify(payload));
  } else {
    console.error(JSON.stringify(payload));
  }
  return NextResponse.json(payload, { status: ok ? 200 : 500 });
}
