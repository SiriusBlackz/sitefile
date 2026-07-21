import { z } from "zod";
import { eq, and, desc, lte, gte, sql, inArray, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import { evidence, evidenceLinks, users, uploadIntents } from "@/server/db/schema";
import { EVIDENCE_TYPES, LINK_METHODS } from "@/server/db/enums";
import { getUploadUrl, getPublicUrl, statStoredObject } from "@/server/services/storage";
import { suggestTasks } from "@/server/services/ai-linker";
import { assertProjectAccess, assertTaskInProject } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { inngest } from "@/server/inngest/client";
import crypto from "crypto";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const UPLOAD_INTENT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const evidenceRouter = createTRPCRouter({
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        contentType: z.enum(ALLOWED_MIME_TYPES, {
          error: "File type not allowed. Accepted: JPEG, PNG, WebP, HEIC, MP4, MOV, WebM",
        }),
        fileSizeBytes: z.number().positive().max(MAX_FILE_SIZE_BYTES, {
          error: `File size must be under ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      const evidenceId = crypto.randomUUID();
      // Sanitize filename — keep only safe chars, drop path separators
      const safeFilename = input.filename.replace(/[^\w.\-]/g, "_").slice(0, 200);
      const storageKey = `projects/${input.projectId}/evidence/${evidenceId}/${safeFilename}`;
      const result = await getUploadUrl(storageKey, input.contentType);

      // Record the upload intent so confirm() can verify the storageKey
      // was actually minted for this user+project.
      await ctx.db.insert(uploadIntents).values({
        projectId: input.projectId,
        userId: ctx.userId,
        storageKey,
        contentType: input.contentType,
        maxSizeBytes: input.fileSizeBytes,
        expiresAt: new Date(Date.now() + UPLOAD_INTENT_TTL_MS),
      });

      return { ...result, evidenceId };
    }),

  confirm: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        storageKey: z.string().min(1),
        originalFilename: z.string().min(1),
        fileSizeBytes: z.number().positive(),
        mimeType: z.string().min(1),
        capturedAt: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        altitude: z.number().nullable().optional(),
        exifData: z.record(z.string(), z.unknown()).nullable().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });

      // Verify an outstanding upload intent matches this storageKey + caller.
      const intent = await ctx.db.query.uploadIntents.findFirst({
        where: eq(uploadIntents.storageKey, input.storageKey),
      });
      if (!intent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload intent not found" });
      }
      if (intent.consumedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "Upload already confirmed" });
      }
      if (intent.userId !== ctx.userId || intent.projectId !== input.projectId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Upload intent does not match caller" });
      }
      if (intent.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Upload intent has expired" });
      }
      if (input.fileSizeBytes > intent.maxSizeBytes) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File exceeds declared size" });
      }
      if (!input.mimeType.startsWith("image/") && !input.mimeType.startsWith("video/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported mime type" });
      }

      // Verify the object actually landed in storage before consuming the
      // intent. Without this, a client could confirm an upload that never
      // happened (e.g. presign step ran but the PUT was dropped), creating
      // an evidence row that points to a missing file.
      const head = await statStoredObject(input.storageKey);
      if (!head.exists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload not found in storage. Please retry the upload.",
        });
      }
      if (head.size !== undefined && head.size !== input.fileSizeBytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stored file size does not match declared size",
        });
      }

      const type = input.mimeType.startsWith("video/") ? "video" : "photo";

      const [record] = await ctx.db
        .insert(evidence)
        .values({
          projectId: input.projectId,
          uploadedBy: ctx.userId,
          type,
          storageKey: input.storageKey,
          originalFilename: input.originalFilename,
          fileSizeBytes: input.fileSizeBytes,
          mimeType: input.mimeType,
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          altitude: input.altitude ?? null,
          exifData: input.exifData ?? null,
          note: input.note,
        })
        .returning();

      // Mark the intent consumed so it can't be replayed.
      await ctx.db
        .update(uploadIntents)
        .set({ consumedAt: new Date() })
        .where(eq(uploadIntents.id, intent.id));
      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "upload", entityType: "evidence", entityId: record.id, metadata: { filename: input.originalFilename } });

      // Trigger background processing (thumbnail generation)
      inngest
        .send({ name: "evidence/uploaded", data: { evidenceId: record.id } })
        .catch((err) => console.warn("[evidence.confirm] Inngest send failed:", err));

      return record;
    }),

  count: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const [row] = await ctx.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(evidence)
        .where(and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)));
      return { count: row?.count ?? 0 };
    }),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(24),
        taskId: z.string().uuid().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        type: z.enum(EVIDENCE_TYPES).optional(),
        search: z.string().max(200).optional(),
        uploadedBy: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const conditions = [
        eq(evidence.projectId, input.projectId),
        isNull(evidence.deletedAt),
      ];

      if (input.dateFrom) {
        conditions.push(gte(evidence.capturedAt, new Date(input.dateFrom)));
      }
      if (input.dateTo) {
        conditions.push(lte(evidence.capturedAt, new Date(input.dateTo)));
      }
      if (input.type) {
        conditions.push(eq(evidence.type, input.type));
      }
      if (input.uploadedBy) {
        conditions.push(eq(evidence.uploadedBy, input.uploadedBy));
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        conditions.push(
          or(
            ilike(evidence.note, pattern),
            ilike(evidence.originalFilename, pattern)
          )!
        );
      }

      let evidenceIdsForTask: string[] | null = null;
      if (input.taskId) {
        const links = await ctx.db.query.evidenceLinks.findMany({
          where: eq(evidenceLinks.taskId, input.taskId),
          columns: { evidenceId: true },
        });
        evidenceIdsForTask = links.map((l) => l.evidenceId);
        if (evidenceIdsForTask.length === 0) {
          return { items: [], nextCursor: null };
        }
      }

      if (input.cursor) {
        const cursorRecord = await ctx.db.query.evidence.findFirst({
          where: eq(evidence.id, input.cursor),
          columns: { createdAt: true, id: true },
        });
        if (cursorRecord?.createdAt) {
          conditions.push(lte(evidence.createdAt, cursorRecord.createdAt));
          conditions.push(sql`${evidence.id} != ${input.cursor}`);
        }
      }

      let items = await ctx.db.query.evidence.findMany({
        where: and(...conditions),
        orderBy: [desc(evidence.createdAt)],
        limit: input.limit + 1,
        with: {
          links: {
            with: {
              task: { columns: { id: true, name: true } },
            },
          },
        },
      });

      if (evidenceIdsForTask) {
        items = items.filter((e) => evidenceIdsForTask!.includes(e.id));
      }

      const hasMore = items.length > input.limit;
      if (hasMore) items = items.slice(0, input.limit);

      return {
        items: items.map((item) => ({
          ...item,
          publicUrl: getPublicUrl(item.storageKey),
          linkedTasks: item.links.map((l) => ({
            taskId: l.task.id,
            taskName: l.task.name,
          })),
        })),
        nextCursor: hasMore ? items[items.length - 1].id : null,
      };
    }),

  link: protectedProcedure
    .input(
      z.object({
        evidenceId: z.string().uuid(),
        taskId: z.string().uuid(),
        linkMethod: z.enum(LINK_METHODS).optional().default("manual"),
        aiConfidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via the evidence's project
      const ev = await ctx.db.query.evidence.findFirst({
        where: eq(evidence.id, input.evidenceId),
        columns: { projectId: true, deletedAt: true },
      });
      if (!ev || ev.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence not found" });
      await assertProjectAccess(ctx.db, ev.projectId, ctx.orgId, ctx.userId);
      await assertTaskInProject(ctx.db, input.taskId, ev.projectId);

      const [link] = await ctx.db
        .insert(evidenceLinks)
        .values({
          evidenceId: input.evidenceId,
          taskId: input.taskId,
          linkMethod: input.linkMethod,
          aiConfidence: input.aiConfidence ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (link) writeAuditLogAsync(ctx.db, { projectId: ev.projectId, userId: ctx.userId, action: "link", entityType: "evidence_link", entityId: link.id, metadata: { evidenceId: input.evidenceId, taskId: input.taskId } });
      return link ?? { alreadyLinked: true };
    }),

  unlink: protectedProcedure
    .input(
      z.object({
        evidenceId: z.string().uuid(),
        taskId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ev = await ctx.db.query.evidence.findFirst({
        where: eq(evidence.id, input.evidenceId),
        columns: { projectId: true },
      });
      if (!ev) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence not found" });
      await assertProjectAccess(ctx.db, ev.projectId, ctx.orgId, ctx.userId);

      await ctx.db
        .delete(evidenceLinks)
        .where(
          and(
            eq(evidenceLinks.evidenceId, input.evidenceId),
            eq(evidenceLinks.taskId, input.taskId)
          )
        );
      writeAuditLogAsync(ctx.db, { projectId: ev.projectId, userId: ctx.userId, action: "unlink", entityType: "evidence_link", entityId: input.evidenceId, metadata: { taskId: input.taskId } });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ evidenceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const ev = await ctx.db.query.evidence.findFirst({
        where: eq(evidence.id, input.evidenceId),
        columns: { projectId: true, deletedAt: true, originalFilename: true },
      });
      if (!ev || ev.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Evidence not found" });
      }
      await assertProjectAccess(ctx.db, ev.projectId, ctx.orgId, ctx.userId);

      // Soft delete: the row and stored file are retained for the audit
      // trail; every read path filters on deleted_at IS NULL.
      await ctx.db
        .update(evidence)
        .set({ deletedAt: new Date() })
        .where(eq(evidence.id, input.evidenceId));
      writeAuditLogAsync(ctx.db, {
        projectId: ev.projectId,
        userId: ctx.userId,
        action: "delete",
        entityType: "evidence",
        entityId: input.evidenceId,
        metadata: { filename: ev.originalFilename },
      });
      return { success: true };
    }),

  suggest: protectedProcedure
    .input(z.object({ evidenceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.evidence.findFirst({
        where: eq(evidence.id, input.evidenceId),
      });
      if (!item || item.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence not found" });
      await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId);

      return suggestTasks(ctx.db, {
        latitude: item.latitude,
        longitude: item.longitude,
        capturedAt: item.capturedAt,
        projectId: item.projectId,
      });
    }),

  /** Evidence dates grouped by task+date for the Gantt chart markers */
  markers: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db
        .select({
          taskId: evidenceLinks.taskId,
          date: sql<string>`DATE(${evidence.capturedAt})`.as("date"),
          count: sql<number>`COUNT(*)::int`.as("count"),
        })
        .from(evidenceLinks)
        .innerJoin(evidence, eq(evidenceLinks.evidenceId, evidence.id))
        .where(
          and(
            eq(evidence.projectId, input.projectId),
            isNull(evidence.deletedAt),
            sql`${evidence.capturedAt} IS NOT NULL`
          )
        )
        .groupBy(evidenceLinks.taskId, sql`DATE(${evidence.capturedAt})`);
      return rows.map((r) => ({
        taskId: r.taskId,
        date: r.date,
        count: r.count,
      }));
    }),

  bulkLink: protectedProcedure
    .input(
      z.object({
        evidenceIds: z.array(z.string().uuid()).min(1).max(100),
        taskId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify all evidence belongs to the same project and user has access
      const items = await ctx.db.query.evidence.findMany({
        where: and(inArray(evidence.id, input.evidenceIds), isNull(evidence.deletedAt)),
        columns: { id: true, projectId: true },
      });
      if (items.length !== input.evidenceIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or more evidence items not found" });
      }
      const projectIds = new Set(items.map((e) => e.projectId));
      if (projectIds.size !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot bulk-link evidence from multiple projects",
        });
      }
      const [projectId] = [...projectIds];
      await assertProjectAccess(ctx.db, projectId, ctx.orgId, ctx.userId);
      await assertTaskInProject(ctx.db, input.taskId, projectId);

      // Insert links, skip duplicates
      const values = input.evidenceIds.map((eid) => ({
        evidenceId: eid,
        taskId: input.taskId,
        linkMethod: "manual" as const,
      }));
      await ctx.db
        .insert(evidenceLinks)
        .values(values)
        .onConflictDoNothing();

      writeAuditLogAsync(ctx.db, {
        projectId,
        userId: ctx.userId,
        action: "bulk_link",
        entityType: "evidence_link",
        entityId: input.taskId,
        metadata: { evidenceCount: input.evidenceIds.length, taskId: input.taskId },
      });

      return { linked: input.evidenceIds.length };
    }),

  uploaders: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db
        .selectDistinct({
          id: users.id,
          name: users.name,
        })
        .from(evidence)
        .innerJoin(users, eq(evidence.uploadedBy, users.id))
        .where(and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)));
      return rows;
    }),
});
