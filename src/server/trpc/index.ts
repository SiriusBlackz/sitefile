import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { checkRateLimit, MUTATION_CONFIG } from "@/server/services/rate-limit";

const isDev = process.env.NODE_ENV === "development";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Log full context server-side for every non-trivial error.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      console.error("[tRPC]", error.code, error.message, error.cause);
    }

    const zodError =
      error.cause instanceof ZodError ? error.cause.flatten() : null;

    // In dev, return the full shape so debugging stays ergonomic.
    if (isDev) {
      return { ...shape, data: { ...shape.data, zodError } };
    }

    // In production, strip stack + cause, and replace generic 500 messages
    // with a safe static string so we don't leak SQL, env details, or paths.
    const safeMessage =
      error.code === "INTERNAL_SERVER_ERROR"
        ? "Something went wrong. Please try again."
        : shape.message;

    return {
      message: safeMessage,
      code: shape.code,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
        path: shape.data.path,
        zodError,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, type, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: !ctx.clerkId
        ? "Not signed in. Please sign in to continue."
        : "Account setup incomplete. Please try again.",
    });
  }

  // Rate limit mutations by user ID. Queries pass through unlimited —
  // ordinary browsing fires many reads and must never blank out pages.
  if (type === "mutation") {
    const { allowed } = checkRateLimit(`user:${ctx.userId}`, MUTATION_CONFIG);
    if (!allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please wait a moment and try again.",
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      orgId: ctx.orgId,
      dbUser: ctx.dbUser!,
    },
  });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.dbUser.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required for this action.",
    });
  }
  return next({ ctx });
});
