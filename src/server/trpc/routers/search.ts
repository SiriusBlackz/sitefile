import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../index";
import { assertProjectAccess } from "../helpers";
import { searchProject } from "@/server/services/search";

export const searchRouter = createTRPCRouter({
  /** Full-text search over one project's records. Any project member. */
  project: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        q: z.string().trim().min(2).max(200),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const hits = await searchProject(ctx.db, input.projectId, input.q);
      const counts: Record<string, number> = {};
      for (const h of hits) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
      return { hits, counts };
    }),
});
