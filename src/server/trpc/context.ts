import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import {
  resolveCurrentUser,
  DemoEnsureUserError,
  EnsureUserError,
} from "@/server/services/current-user";

export async function createTRPCContext(opts: { headers: Headers }) {
  let resolved;
  try {
    resolved = await resolveCurrentUser(opts.headers);
  } catch (e) {
    if (e instanceof DemoEnsureUserError) {
      console.error("[tRPC context] demo user resolution failed:", e.cause);
      // Surface a safe error; the tRPC error formatter strips internals.
      throw new Error("Demo session unavailable");
    }
    if (e instanceof EnsureUserError) {
      // The clerkId + cause are already logged in resolveCurrentUser. Send a
      // user-facing 503 so the UI can show "try again" rather than the
      // misleading "Not signed in" that protectedProcedure would emit.
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e.message,
        cause: e.cause,
      });
    }
    throw e;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[tRPC context]", {
      clerkId: resolved.clerkId,
      dbUserId: resolved.userId,
      orgId: resolved.orgId,
    });
  }

  return {
    db,
    clerkId: resolved.clerkId,
    userId: resolved.userId,
    orgId: resolved.orgId,
    dbUser: resolved.dbUser,
    headers: opts.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
