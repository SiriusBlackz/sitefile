import { NextResponse } from "next/server";
import { isDemoMode, getDemoUserKeys } from "@/lib/demo";

/**
 * No-JS demo sign-in: /demo/enter?u=contractor-1 sets the demo cookie
 * server-side and redirects into the app. Exists for phone-on-LAN
 * testing where the picker's client JS may not hydrate (dev mode).
 * 404s outside DEMO_MODE, same as /demo itself.
 */
export function GET(req: Request) {
  if (!isDemoMode()) {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const valid = (getDemoUserKeys() as readonly string[]).includes(u);
  if (!valid) {
    return NextResponse.redirect(new URL("/demo", url.origin));
  }
  const res = NextResponse.redirect(new URL("/", url.origin));
  res.cookies.set("demo_user", u, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}
