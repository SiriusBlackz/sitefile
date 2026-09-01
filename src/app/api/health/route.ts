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
 * Three checks, each with its own flag so the console log names the
 * culprit (the response stays internals-free):
 *   db    — SELECT 1 through the pooler.
 *   api   — self-fetch of a real tRPC route, asserting the response is
 *           JSON (an auth-rejection JSON error is healthy; Next's HTML
 *           /500 page is not). Catches module-init crashes in the tRPC
 *           graph — the 2026-09-01 outage returned 200 here for 3 days
 *           while every tRPC call served HTML 500s.
 *   sharp — dynamic import + 1×1 PNG decode, proving the native binary
 *           and its libvips shared library load in the deployed runtime.
 *           Local/CI never exercise the Linux binaries, so this is the
 *           only automated signal for that failure class.
 *
 * Deliberately unauthenticated — free monitor tiers can't send custom
 * headers. Response is a constant-shape JSON with no internals; the work
 * is bounded (SELECT 1, one self-fetch, one tiny decode), so abuse costs
 * are bounded by function invocations.
 */

// 1×1 transparent PNG.
const CANARY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(req: Request) {
  const startedAt = Date.now();
  const errors: string[] = [];

  const [dbOk, apiOk, sharpOk] = await Promise.all([
    db
      .execute(sql`SELECT 1`)
      .then(() => true)
      .catch((err) => {
        errors.push(`db: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }),
    fetch(new URL("/api/trpc/project.list?batch=1&input=%7B%7D", req.url), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
      .then((res) => {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) return true;
        errors.push(`api: non-JSON response (${res.status}, ${ct || "no content-type"})`);
        return false;
      })
      .catch((err) => {
        errors.push(`api: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }),
    import("sharp")
      .then(async (mod) => {
        await mod.default(CANARY_PNG).metadata();
        return true;
      })
      .catch((err) => {
        errors.push(`sharp: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }),
  ]);

  const ok = dbOk && apiOk && sharpOk;
  const body = { ok, db: dbOk, api: apiOk, sharp: sharpOk, elapsedMs: Date.now() - startedAt };

  if (!ok) {
    console.error(
      JSON.stringify({ type: "health", ...body, errors, ts: new Date().toISOString() })
    );
  }

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
