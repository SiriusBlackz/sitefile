import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/routers/_app";
import { createTRPCContext } from "@/server/trpc/context";

// Allow up to 60s for report generation (Chromium download + PDF render)
// PDF programme extraction (Claude) takes 30-60s on real files — 60s was
// a coin-flip. Fluid compute allows up to 300s on all plans.
export const maxDuration = 300;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
