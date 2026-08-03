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

const parsedTaskSchema = z.object({
  sourceRef: z.string(),
  name: z.string().trim().min(1),
  parentSourceRef: z.string().nullable(),
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  progressPct: z.number(),
  sortOrder: z.number(),
});

const columnMappingSchema = z.object({
  name: z.string().min(1),
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  progressPct: z.string().nullable(),
  wbs: z.string().nullable(),
  parent: z.string().nullable(),
});

type TaskStatusValue = (typeof TASK_STATUSES)[number];

/**
 * Keep status, progress and actual dates mutually consistent no matter
 * which field the caller changed: completed ⇒ 100% with actual dates,
 * not_started ⇒ 0% with no actuals, partial progress ⇒ work has begun.
 * The form applies the same rules client-side; this is the safety net.
 */
function syncTaskState(opts: {
  status: TaskStatusValue;
  progressPct: number;
  actualStart: string | null;
  actualEnd: string | null;
  plannedStart: string | null;
  statusExplicit: boolean;
  progressExplicit: boolean;
}): {
  status: TaskStatusValue;
  progressPct: number;
  actualStart: string | null;
  actualEnd: string | null;
} {
  let { status, progressPct, actualStart, actualEnd } = opts;
  const todayISO = new Date().toISOString().slice(0, 10);

  if (progressPct >= 100) {
    if (opts.progressExplicit || !opts.statusExplicit || status === "completed") {
      status = "completed";
    } else {
      // Explicitly moved off completed without touching progress — restart
      progressPct = 0;
    }
  } else if (progressPct > 0 && status === "not_started") {
    status = "in_progress";
  }

  if (status === "completed") {
    progressPct = 100;
    actualStart = actualStart ?? opts.plannedStart ?? todayISO;
    actualEnd = actualEnd ?? todayISO;
  } else if (status === "not_started") {
    progressPct = 0;
    actualStart = null;
    actualEnd = null;
  } else {
    actualEnd = null;
    if (progressPct > 0 && !actualStart) actualStart = todayISO;
  }

  return { status, progressPct, actualStart, actualEnd };
}

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
        name: z.string().trim().min(1, "Task name is required"),
        description: z.string().optional(),
        parentTaskId: z.string().uuid().nullable().optional(),
        plannedStart: z.string().optional(),
        plannedEnd: z.string().optional(),
        actualStart: z.string().optional(),
        actualEnd: z.string().optional(),
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

      const synced = syncTaskState({
        status: input.status ?? "not_started",
        progressPct: input.progressPct ?? 0,
        actualStart: input.actualStart || null,
        actualEnd: input.actualEnd || null,
        plannedStart: input.plannedStart || null,
        statusExplicit: input.status !== undefined,
        progressExplicit: input.progressPct !== undefined,
      });

      const [task] = await ctx.db
        .insert(tasks)
        .values({
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          parentTaskId: parentId,
          plannedStart: input.plannedStart || null,
          plannedEnd: input.plannedEnd || null,
          sortOrder: nextSort,
          ...synced,
        })
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "create", entityType: "task", entityId: task.id, metadata: { name: task.name } });
      return task;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
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
        columns: {
          projectId: true,
          status: true,
          progressPct: true,
          actualStart: true,
          actualEnd: true,
          plannedStart: true,
        },
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

      // Merge the partial update over the stored row, then re-sync
      // status/progress/actual dates so a single-field change (e.g. just
      // progress → 100) still leaves the task in a consistent state.
      const merged = {
        status: (cleaned.status as TaskStatusValue) ?? (existing.status as TaskStatusValue) ?? "not_started",
        progressPct: (cleaned.progressPct as number) ?? existing.progressPct ?? 0,
        actualStart:
          "actualStart" in cleaned ? (cleaned.actualStart as string | null) : existing.actualStart,
        actualEnd:
          "actualEnd" in cleaned ? (cleaned.actualEnd as string | null) : existing.actualEnd,
        plannedStart:
          "plannedStart" in cleaned ? (cleaned.plannedStart as string | null) : existing.plannedStart,
      };
      const synced = syncTaskState({
        ...merged,
        statusExplicit: input.status !== undefined,
        progressExplicit: input.progressPct !== undefined,
      });

      const [task] = await ctx.db
        .update(tasks)
        .set({ ...cleaned, ...synced, updatedAt: new Date() })
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
        // Parse failures are user-fixable (wrong file, unsupported export)
        // — surface the real reason instead of the masked 500.
        try {
          return { kind: "preview" as const, ...detectAndParse(input.xml) };
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              err instanceof Error
                ? err.message
                : "Could not parse this file as an MS Project or P6 XML export.",
          });
        }
      }
      if (input.kind === "pdf") {
        const buf = Buffer.from(input.pdfBase64, "base64");
        let parsed;
        try {
          parsed = await parsePdfBuffer(buf);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("ANTHROPIC_API_KEY")) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "PDF import isn't available yet on this server. Please import an Excel (.xlsx) or MS Project / P6 XML export instead.",
            });
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Couldn't read that PDF: ${message}`,
          });
        }
        const { tasks, confidence } = parsed;
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
            tasks: z.array(parsedTaskSchema),
          }),
          // Client-parsed programmes (XML parsed in the browser so large
          // real-world exports never travel to the server).
          z.object({
            kind: z.literal("tasks"),
            format: z.enum(["msproject", "p6", "xlsx", "pdf"]),
            tasks: z.array(parsedTaskSchema).min(1).max(5000),
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
        let result;
        try {
          result = detectAndParse(input.source.xml);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              err instanceof Error
                ? err.message
                : "Could not parse this file as an MS Project or P6 XML export.",
          });
        }
        parsedTasks = result.tasks;
        format = result.format;
      } else if (input.source.kind === "xlsx") {
        const buf = Buffer.from(input.source.xlsxBase64, "base64");
        parsedTasks = await parseExcelWithMapping(buf, input.source.mapping);
        format = "xlsx";
      } else if (input.source.kind === "pdf") {
        // PDF: client-edited tasks come back as a structured array.
        // The Claude extraction happened in previewImport; the user
        // may have tweaked the rows before committing.
        parsedTasks = input.source.tasks;
        format = "pdf";
      } else {
        parsedTasks = input.source.tasks;
        format = input.source.format;
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

          const actualStart = ("actualStart" in pt ? pt.actualStart : null) ?? null;
          const actualEnd = ("actualEnd" in pt ? pt.actualEnd : null) ?? null;
          const [inserted] = await tx
            .insert(tasks)
            .values({
              projectId: input.projectId,
              name: pt.name,
              parentTaskId,
              plannedStart: pt.plannedStart,
              plannedEnd: pt.plannedEnd,
              actualStart,
              actualEnd,
              progressPct: actualEnd ? 100 : pt.progressPct,
              sortOrder: pt.sortOrder,
              sourceRef: pt.sourceRef,
              status:
                actualEnd || pt.progressPct >= 100
                  ? "completed"
                  : actualStart || pt.progressPct > 0
                    ? "in_progress"
                    : "not_started",
            })
            .returning();

          refToId.set(pt.sourceRef, inserted.id);
        }

        writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "import", entityType: "task", entityId: input.projectId, metadata: { count: parsedTasks.length, format } });
        return { imported: parsedTasks.length, format };
      });
    }),
});
