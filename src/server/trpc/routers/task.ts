import { z } from "zod";
import { eq, asc, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { tasks } from "@/server/db/schema";
import { TASK_STATUSES } from "@/server/db/enums";
import { detectAndParse } from "@/server/services/programme-import";
import {
  inspectExcel,
  parseExcelWithMapping,
} from "@/server/services/excel-import";
import { parsePdfBuffer } from "@/server/services/pdf-import";
import { assertProjectAccess, assertTaskInProject } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";

const columnMappingSchema = z.object({
  name: z.string().min(1),
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  progressPct: z.string().nullable(),
  wbs: z.string().nullable(),
  parent: z.string().nullable(),
});

interface FlatTask {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  name: string;
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPct: number | null;
  sortOrder: number | null;
  sourceRef: string | null;
  status: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  depth: number;
}

function buildTree(
  allTasks: (typeof tasks.$inferSelect)[],
): FlatTask[] {
  const childrenMap = new Map<string | null, (typeof tasks.$inferSelect)[]>();
  for (const task of allTasks) {
    const parentId = task.parentTaskId ?? null;
    const list = childrenMap.get(parentId) ?? [];
    list.push(task);
    childrenMap.set(parentId, list);
  }

  const result: FlatTask[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      result.push({ ...child, depth });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export const taskRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const allTasks = await ctx.db.query.tasks.findMany({
        where: eq(tasks.projectId, input.projectId),
        orderBy: [asc(tasks.sortOrder)],
      });
      return buildTree(allTasks);
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1, "Task name is required"),
        description: z.string().optional(),
        parentTaskId: z.string().uuid().nullable().optional(),
        plannedStart: z.string().optional(),
        plannedEnd: z.string().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        progressPct: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const parentId = input.parentTaskId ?? null;
      if (parentId) {
        await assertTaskInProject(ctx.db, parentId, input.projectId);
      }

      const [maxResult] = await ctx.db
        .select({ max: sql<number>`COALESCE(MAX(${tasks.sortOrder}), -1)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            parentId
              ? eq(tasks.parentTaskId, parentId)
              : sql`${tasks.parentTaskId} IS NULL`
          )
        );
      const nextSort = (maxResult?.max ?? -1) + 1;

      const [task] = await ctx.db
        .insert(tasks)
        .values({
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          parentTaskId: parentId,
          plannedStart: input.plannedStart || null,
          plannedEnd: input.plannedEnd || null,
          status: input.status ?? "not_started",
          progressPct: input.progressPct ?? 0,
          sortOrder: nextSort,
        })
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "create", entityType: "task", entityId: task.id, metadata: { name: task.name } });
      return task;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        parentTaskId: z.string().uuid().nullable().optional(),
        plannedStart: z.string().nullable().optional(),
        plannedEnd: z.string().nullable().optional(),
        actualStart: z.string().nullable().optional(),
        actualEnd: z.string().nullable().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        progressPct: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via the task's project
      const existing = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.id),
        columns: { projectId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      await assertProjectAccess(ctx.db, existing.projectId, ctx.orgId, ctx.userId);

      if (input.parentTaskId !== undefined && input.parentTaskId !== null) {
        if (input.parentTaskId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Task cannot be its own parent" });
        }
        await assertTaskInProject(ctx.db, input.parentTaskId, existing.projectId);
        // Walk ancestors of the proposed parent to detect cycles
        let cursor: string | null = input.parentTaskId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Reparent would create a cycle" });
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const ancestor: { parentTaskId: string | null } | undefined =
            await ctx.db.query.tasks.findFirst({
              where: eq(tasks.id, cursor),
              columns: { parentTaskId: true },
            });
          cursor = ancestor?.parentTaskId ?? null;
        }
      }

      const { id, ...data } = input;
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(data)) {
        cleaned[key] = val === "" ? null : val;
      }
      const [task] = await ctx.db
        .update(tasks)
        .set({ ...cleaned, updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: existing.projectId, userId: ctx.userId, action: "update", entityType: "task", entityId: id });
      return task;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const task = await tx.query.tasks.findFirst({
          where: eq(tasks.id, input.id),
        });
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        await assertProjectAccess(ctx.db, task.projectId, ctx.orgId, ctx.userId);

        await tx
          .update(tasks)
          .set({ parentTaskId: task.parentTaskId, updatedAt: new Date() })
          .where(and(eq(tasks.parentTaskId, input.id), eq(tasks.projectId, task.projectId)));

        await tx
          .delete(tasks)
          .where(and(eq(tasks.id, input.id), eq(tasks.projectId, task.projectId)));
        writeAuditLogAsync(ctx.db, { projectId: task.projectId, userId: ctx.userId, action: "delete", entityType: "task", entityId: input.id, metadata: { name: task.name } });
        return { success: true };
      });
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        items: z.array(
          z.object({
            id: z.string().uuid(),
            sortOrder: z.number().int(),
            parentTaskId: z.string().uuid().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);

      // Pre-validate that every referenced id (own + parent) belongs to this project.
      const referencedIds = new Set<string>();
      for (const item of input.items) {
        referencedIds.add(item.id);
        if (item.parentTaskId) referencedIds.add(item.parentTaskId);
      }
      const owned = await ctx.db.query.tasks.findMany({
        where: and(
          eq(tasks.projectId, input.projectId),
          inArray(tasks.id, Array.from(referencedIds))
        ),
        columns: { id: true },
      });
      if (owned.length !== referencedIds.size) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more tasks do not belong to this project",
        });
      }

      return ctx.db.transaction(async (tx) => {
        for (const item of input.items) {
          if (item.parentTaskId === item.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Task cannot be its own parent",
            });
          }
          await tx
            .update(tasks)
            .set({
              sortOrder: item.sortOrder,
              parentTaskId: item.parentTaskId,
              updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, item.id), eq(tasks.projectId, input.projectId)));
        }
        return { success: true };
      });
    }),

  previewImport: protectedProcedure
    .input(
      // Size caps: ~15MB binary ≈ 20M base64 chars. Without them any
      // authenticated user can push arbitrarily large payloads into the
      // XML parser / Claude PDF import and burn unbounded API spend.
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("xml"), xml: z.string().min(10).max(10_000_000) }),
        z.object({
          kind: z.literal("xlsx-inspect"),
          xlsxBase64: z.string().min(10).max(20_000_000),
        }),
        z.object({
          kind: z.literal("xlsx-parse"),
          xlsxBase64: z.string().min(10).max(20_000_000),
          mapping: columnMappingSchema,
        }),
        z.object({
          kind: z.literal("pdf"),
          pdfBase64: z.string().min(10).max(20_000_000),
        }),
      ])
    )
    .mutation(async ({ input }) => {
      if (input.kind === "xml") {
        return { kind: "preview" as const, ...detectAndParse(input.xml) };
      }
      if (input.kind === "pdf") {
        const buf = Buffer.from(input.pdfBase64, "base64");
        const { tasks, confidence } = await parsePdfBuffer(buf);
        return {
          kind: "preview" as const,
          format: "pdf" as const,
          tasks,
          confidence,
        };
      }
      const buf = Buffer.from(input.xlsxBase64, "base64");
      if (input.kind === "xlsx-inspect") {
        return { kind: "needs_mapping" as const, ...(await inspectExcel(buf)) };
      }
      const tasks = await parseExcelWithMapping(buf, input.mapping);
      return { kind: "preview" as const, format: "xlsx" as const, tasks };
    }),

  import: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        clearExisting: z.boolean().default(false),
        source: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("xml"), xml: z.string().min(10) }),
          z.object({
            kind: z.literal("xlsx"),
            xlsxBase64: z.string().min(10),
            mapping: columnMappingSchema,
          }),
          z.object({
            kind: z.literal("pdf"),
            tasks: z.array(
              z.object({
                sourceRef: z.string(),
                name: z.string().min(1),
                parentSourceRef: z.string().nullable(),
                plannedStart: z.string().nullable(),
                plannedEnd: z.string().nullable(),
                progressPct: z.number(),
                sortOrder: z.number(),
              })
            ),
          }),
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      let parsedTasks;
      let format: "msproject" | "p6" | "xlsx" | "pdf";
      if (input.source.kind === "xml") {
        const result = detectAndParse(input.source.xml);
        parsedTasks = result.tasks;
        format = result.format;
      } else if (input.source.kind === "xlsx") {
        const buf = Buffer.from(input.source.xlsxBase64, "base64");
        parsedTasks = await parseExcelWithMapping(buf, input.source.mapping);
        format = "xlsx";
      } else {
        // PDF: client-edited tasks come back as a structured array.
        // The Claude extraction happened in previewImport; the user
        // may have tweaked the rows before committing.
        parsedTasks = input.source.tasks;
        format = "pdf";
      }

      return ctx.db.transaction(async (tx) => {
        if (input.clearExisting) {
          await tx.delete(tasks).where(eq(tasks.projectId, input.projectId));
        }

        const refToId = new Map<string, string>();

        for (const pt of parsedTasks) {
          const parentTaskId = pt.parentSourceRef
            ? refToId.get(pt.parentSourceRef) ?? null
            : null;

          const [inserted] = await tx
            .insert(tasks)
            .values({
              projectId: input.projectId,
              name: pt.name,
              parentTaskId,
              plannedStart: pt.plannedStart,
              plannedEnd: pt.plannedEnd,
              progressPct: pt.progressPct,
              sortOrder: pt.sortOrder,
              sourceRef: pt.sourceRef,
              status: pt.progressPct >= 100 ? "completed" : pt.progressPct > 0 ? "in_progress" : "not_started",
            })
            .returning();

          refToId.set(pt.sourceRef, inserted.id);
        }

        writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "import", entityType: "task", entityId: input.projectId, metadata: { count: parsedTasks.length, format } });
        return { imported: parsedTasks.length, format };
      });
    }),
});
