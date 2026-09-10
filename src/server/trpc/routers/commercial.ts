import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../index";
import { assertProjectAccess } from "../helpers";
import { commercialEvents, commercialImports } from "@/server/db/schema";
import { writeAuditLog, writeAuditLogAsync } from "@/server/services/audit";
import { parseCemarRegister, summariseCe, summariseEw, type CommercialKind } from "@/server/services/commercial-import";

const kindSchema = z.enum(["ew", "ce"]);
const MAX_CSV_BYTES = 2_000_000;

/**
 * Commercial register — EW / CE rows imported from CEMAR CSV exports.
 * Import is replace-all per kind: the CSV is the source of truth, the
 * import row is the provenance. Any project member can read; import is
 * open to members too (the PM or QS does it) and is audit-logged.
 */
export const commercialRouter = createTRPCRouter({
  /** Parse without saving — the dialog shows counts and warnings first. */
  preview: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), csv: z.string().min(10).max(MAX_CSV_BYTES), kind: kindSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      try {
        const parsed = parseCemarRegister(input.csv, input.kind);
        const today = new Date().toISOString().slice(0, 10);
        return {
          kind: parsed.kind,
          rowCount: parsed.rows.length,
          warnings: parsed.warnings,
          headers: parsed.headers,
          sample: parsed.rows.slice(0, 5).map((r) => ({ ref: r.ref, title: r.title, notifiedOn: r.notifiedOn, status: r.status })),
          summary: parsed.kind === "ew" ? summariseEw(parsed.rows, "0000-01-01", "9999-12-31", today) : summariseCe(parsed.rows, "0000-01-01", "9999-12-31", today),
        };
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Could not read the file" });
      }
    }),

  import: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), csv: z.string().min(10).max(MAX_CSV_BYTES), kind: kindSchema.optional(), filename: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      let parsed;
      try {
        parsed = parseCemarRegister(input.csv, input.kind);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Could not read the file" });
      }
      if (parsed.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No rows to import." });
      const result = await ctx.db.transaction(async (tx) => {
        const [imp] = await tx
          .insert(commercialImports)
          .values({ projectId: input.projectId, kind: parsed.kind, filename: input.filename ?? null, rowCount: parsed.rows.length, importedBy: ctx.userId })
          .returning({ id: commercialImports.id });
        const removed = await tx
          .delete(commercialEvents)
          .where(and(eq(commercialEvents.projectId, input.projectId), eq(commercialEvents.kind, parsed.kind)))
          .returning({ id: commercialEvents.id });
        await tx.insert(commercialEvents).values(parsed.rows.map((r) => ({ ...r, projectId: input.projectId, importId: imp.id })));
        await writeAuditLog(tx, {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "import",
          entityType: "commercial_register",
          entityId: imp.id,
          metadata: { kind: parsed.kind, rows: parsed.rows.length, replaced: removed.length, filename: input.filename ?? null, warnings: parsed.warnings.slice(0, 10) },
        });
        return { importId: imp.id, replaced: removed.length };
      });
      return { kind: parsed.kind, rowCount: parsed.rows.length, replaced: result.replaced, warnings: parsed.warnings };
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), kind: kindSchema.optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db.query.commercialEvents.findMany({
        where: and(eq(commercialEvents.projectId, input.projectId), ...(input.kind ? [eq(commercialEvents.kind, input.kind)] : [])),
        orderBy: [desc(commercialEvents.notifiedOn), desc(commercialEvents.eventId)],
      });
      return rows;
    }),

  summary: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), from: z.string().optional(), to: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db.query.commercialEvents.findMany({ where: eq(commercialEvents.projectId, input.projectId) });
      const today = new Date().toISOString().slice(0, 10);
      const from = input.from ?? "0000-01-01";
      const to = input.to ?? "9999-12-31";
      const imports = await ctx.db.query.commercialImports.findMany({
        where: eq(commercialImports.projectId, input.projectId),
        orderBy: [desc(commercialImports.importedAt)],
        limit: 10,
        with: { importer: { columns: { name: true } } },
      });
      const latest = (kind: CommercialKind) => imports.find((i) => i.kind === kind) ?? null;
      const rowsOut = rows.map((r) => ({ ...r, kind: r.kind as CommercialKind }));
      return {
        ew: summariseEw(rowsOut, from, to, today),
        ce: summariseCe(rowsOut, from, to, today),
        lastImport: {
          ew: latest("ew") ? { at: latest("ew")!.importedAt, by: latest("ew")!.importer?.name ?? null, rows: latest("ew")!.rowCount, filename: latest("ew")!.filename } : null,
          ce: latest("ce") ? { at: latest("ce")!.importedAt, by: latest("ce")!.importer?.name ?? null, rows: latest("ce")!.rowCount, filename: latest("ce")!.filename } : null,
        },
      };
    }),

  clear: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), kind: kindSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      const removed = await ctx.db
        .delete(commercialEvents)
        .where(and(eq(commercialEvents.projectId, input.projectId), eq(commercialEvents.kind, input.kind)))
        .returning({ id: commercialEvents.id });
      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "delete", entityType: "commercial_register", entityId: input.projectId, metadata: { kind: input.kind, removed: removed.length } });
      return { removed: removed.length };
    }),
});
