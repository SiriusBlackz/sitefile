import { z } from "zod";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  projects,
  projectMembers,
  evidence,
  reports,
  users,
  inspectionVisits,
  inspectionItems,
  inspectionItemEvents,
  inspectionItemPhotos,
} from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { inngest } from "@/server/inngest/client";
import { encryptReportPassword } from "@/server/services/report-password-crypto";
import { parseApprovalChain, type ApprovalState } from "@/lib/report-approval";
import { MEMBER_ROLE_LABELS } from "@/lib/member-roles";
import type { ProjectMemberRole } from "@/server/db/enums";
import {
  INSPECTION_VISIT_STAGES as STAGES,
  INSPECTION_REPORT_KINDS,
  CONTRACT_FORMS,
  LOCATION_SCHEMES,
} from "@/server/db/enums";
import { INSPECTION_SECTION_KEYS } from "@/lib/inspection-report-sections";
import {
  gatherInspectionReportData,
  renderInspectionReportHTML,
} from "@/server/services/inspection-report-generator";
import {
  canTransition,
  canReject,
  canDispose,
  canNotify,
  permissionsFor,
  type Actor,
} from "@/lib/inspection-transitions";
import {
  INSPECTION_VISIT_STAGES,
  INSPECTION_ITEM_TYPES,
  INSPECTION_ITEM_STATUSES,
  INSPECTION_PHOTO_ROLES,
} from "@/server/db/enums";
import {
  assertProjectAccess,
  assertProjectType,
  assertEvidenceInProject,
} from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { getReadUrl } from "@/server/services/storage";

/**
 * Defects inspection register (Phase A: record a visit, record items with
 * photos, read the register, generate the inspection record report).
 * Every procedure is opt-in on project_type = 'inspection'; progress
 * projects get PRECONDITION_FAILED before any write. See
 * Research/Sitefile_Inspection_Implementation_Plan_FINAL.md §C.2.
 */

const CLOSED_STATUSES = ["verified_closed", "accepted_as_is", "void"] as const;

/** Verifier / oversight set — mirrors the diary PM gate plus Supervisor. */
const OVERSIGHT_ROLES = ["admin", "project_manager", "construction_manager", "supervisor"];

async function assertInspectionOversight(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string,
  userId: string,
  orgRole: string
) {
  if (orgRole === "admin") return;
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    columns: { role: true },
  });
  if (!membership || !OVERSIGHT_ROLES.includes(membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is for project managers, construction managers or supervisors.",
    });
  }
}

/** Who the caller is on this project, for the transition rules. */
async function actorFor(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string,
  userId: string,
  orgRole: string
): Promise<Actor> {
  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    columns: { role: true },
  });
  return { userId, isOrgAdmin: orgRole === "admin", projectRole: membership?.role ?? null };
}

const locationSchema = z.object({
  description: z.string().trim().min(1).max(300),
  block: z.string().trim().max(80).optional(),
  level: z.string().trim().max(80).optional(),
  room: z.string().trim().max(120).optional(),
  element: z.string().trim().max(120).optional(),
  alignment: z.string().trim().max(80).optional(),
  chainage: z.string().trim().max(40).optional(),
  side: z.string().trim().max(40).optional(),
  offset: z.string().trim().max(40).optional(),
  grid: z.string().trim().max(80).optional(),
});
type Location = z.infer<typeof locationSchema>;

/** Scheme-aware sort key so the register orders by location then ref. */
function locationSortKey(scheme: string, loc: Location): string {
  const pad = (v?: string) => {
    if (!v) return "";
    // "0+245" / "245" / "1+020.5" → zero-padded metres for lexical ordering
    const m = v.replace(/\s+/g, "").match(/^(\d+)\+(\d+(?:\.\d+)?)$/);
    const metres = m ? Number(m[1]) * 1000 + Number(m[2]) : Number(v);
    return Number.isFinite(metres) ? String(Math.round(metres * 10)).padStart(9, "0") : v;
  };
  const parts =
    scheme === "linear"
      ? [loc.alignment, pad(loc.chainage), loc.side, loc.offset]
      : scheme === "building"
        ? [loc.block, loc.level, loc.room, loc.element]
        : [loc.grid];
  const key = parts.filter(Boolean).join("|").toLowerCase();
  return key || loc.description.toLowerCase();
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

async function loadProject(
  db: Parameters<typeof assertProjectAccess>[0],
  projectId: string
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      projectType: true,
      locationScheme: true,
      defaultCorrectionPeriodDays: true,
      priorityScheme: true,
    },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  return project;
}

const inspectionSectionsSchema = z
  .object(
    Object.fromEntries(
      INSPECTION_SECTION_KEYS.map((key) => [key, z.boolean().optional()])
    ) as Record<(typeof INSPECTION_SECTION_KEYS)[number], z.ZodOptional<z.ZodBoolean>>
  )
  .strict();

const signatureSchema = z.array(
  z.object({
    role: z.enum(["contractor", "project_manager", "client"]),
    name: z.string().min(1),
    title: z.string().optional(),
    date: z.string().optional(),
    imageDataUrl: z.string().optional(),
  })
);

const reportFactsSchema = z.object({
  projectId: z.string().uuid(),
  visitId: z.string().uuid(),
  stage: z.enum(STAGES),
  kind: z.enum(INSPECTION_REPORT_KINDS).default("inspection_record"),
  sections: inspectionSectionsSchema.optional(),
  coverEvidenceId: z.string().uuid().optional(),
  signatures: signatureSchema.optional(),
  scopeNote: z.string().trim().max(2000).optional(),
  methodLine: z.string().trim().max(500).optional(),
  weather: z.string().trim().max(200).optional(),
  urgentConcerns: z.string().trim().max(2000).optional(),
  distribution: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  attendees: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        org: z.string().trim().max(120).optional(),
        role: z.string().trim().max(120).optional(),
        authority: z.string().trim().max(200).optional(),
      })
    )
    .max(30)
    .optional(),
  notInspected: z
    .array(
      z.object({
        area: z.string().trim().min(1).max(200),
        reason: z.string().trim().max(300).optional(),
        owner: z.string().trim().max(120).optional(),
        followUp: z.string().trim().max(300).optional(),
      })
    )
    .max(50)
    .optional(),
});

const photoColumns = {
  id: true,
  storageKey: true,
  thumbnailKey: true,
  originalFilename: true,
  capturedAt: true,
  uploadedAt: true,
  latitude: true,
  longitude: true,
  note: true,
  deletedAt: true,
} as const;

export const inspectionRouter = createTRPCRouter({
  /** Find or create the visit for a date + stage (UNIQUE guards the race). */
  visitEnsure: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        stage: z.enum(INSPECTION_VISIT_STAGES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      const existing = await ctx.db.query.inspectionVisits.findFirst({
        where: and(
          eq(inspectionVisits.projectId, input.projectId),
          eq(inspectionVisits.visitDate, input.visitDate),
          eq(inspectionVisits.stage, input.stage)
        ),
      });
      if (existing) return existing;
      try {
        const [visit] = await ctx.db
          .insert(inspectionVisits)
          .values({
            projectId: input.projectId,
            stage: input.stage,
            visitDate: input.visitDate,
            startedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();
        writeAuditLogAsync(ctx.db, {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "create",
          entityType: "inspection_visit",
          entityId: visit.id,
          metadata: { visitDate: input.visitDate, stage: input.stage },
        });
        return visit;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          const again = await ctx.db.query.inspectionVisits.findFirst({
            where: and(
              eq(inspectionVisits.projectId, input.projectId),
              eq(inspectionVisits.visitDate, input.visitDate),
              eq(inspectionVisits.stage, input.stage)
            ),
          });
          if (again) return again;
        }
        throw err;
      }
    }),

  visitUpdate: protectedProcedure
    .input(
      z.object({
        visitId: z.string().uuid(),
        weather: z.string().trim().max(200).nullable().optional(),
        attendees: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              org: z.string().trim().max(120).optional(),
              role: z.string().trim().max(120).optional(),
              authority: z.string().trim().max(200).optional(),
            })
          )
          .max(30)
          .optional(),
        scopeNote: z.string().trim().max(2000).nullable().optional(),
        methodLine: z.string().trim().max(500).nullable().optional(),
        notInspected: z
          .array(
            z.object({
              area: z.string().trim().min(1).max(200),
              reason: z.string().trim().max(300).optional(),
              owner: z.string().trim().max(120).optional(),
              followUp: z.string().trim().max(300).optional(),
            })
          )
          .max(50)
          .optional(),
        urgentConcerns: z.string().trim().max(2000).nullable().optional(),
        finishedAt: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.query.inspectionVisits.findFirst({
        where: eq(inspectionVisits.id, input.visitId),
        columns: { id: true, projectId: true },
      });
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found" });
      const access = await assertProjectAccess(ctx.db, visit.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      await assertInspectionOversight(ctx.db, visit.projectId, ctx.userId, ctx.dbUser.role);
      const { visitId, finishedAt, ...rest } = input;
      const [updated] = await ctx.db
        .update(inspectionVisits)
        .set({
          ...rest,
          ...(finishedAt !== undefined
            ? { finishedAt: finishedAt ? new Date(finishedAt) : null }
            : {}),
        })
        .where(eq(inspectionVisits.id, visitId))
        .returning();
      writeAuditLogAsync(ctx.db, {
        projectId: visit.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "inspection_visit",
        entityId: visitId,
        metadata: { fields: Object.keys(rest) },
      });
      return updated;
    }),

  visitList: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      return ctx.db.query.inspectionVisits.findMany({
        where: eq(inspectionVisits.projectId, input.projectId),
        orderBy: [desc(inspectionVisits.visitDate)],
      });
    }),

  /**
   * Record an item. Idempotent on a client-supplied id so offline photos can
   * reference the item before the server has it; the existing row must
   * belong to the same project and creator or the call is refused.
   */
  itemCreate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        id: z.string().uuid().optional(),
        visitId: z.string().uuid(),
        type: z.enum(INSPECTION_ITEM_TYPES).default("defect"),
        title: z.string().trim().min(1).max(160),
        finding: z.string().trim().min(1).max(4000),
        location: locationSchema,
        suspectedCause: z.string().trim().max(1000).optional(),
        acceptanceBasis: z.string().trim().max(500).optional(),
        interimAction: z.string().trim().max(1000).optional(),
        accessNote: z.string().trim().max(500).optional(),
        category: z.string().trim().max(80).optional(),
        priority: z.string().trim().max(40).optional(),
        responsibleOrg: z.string().trim().max(120).optional(),
        responsibleUserId: z.string().uuid().optional(),
        repairTarget: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        accuracyM: z.number().min(0).max(100000).optional(),
        clientAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      const project = await loadProject(ctx.db, input.projectId);
      const visit = await ctx.db.query.inspectionVisits.findFirst({
        where: and(
          eq(inspectionVisits.id, input.visitId),
          eq(inspectionVisits.projectId, input.projectId)
        ),
        columns: { id: true },
      });
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found" });

      if (input.id) {
        const existing = await ctx.db.query.inspectionItems.findFirst({
          where: eq(inspectionItems.id, input.id),
        });
        if (existing) {
          if (existing.projectId !== input.projectId || existing.createdBy !== ctx.userId) {
            throw new TRPCError({ code: "CONFLICT", message: "Item id already in use." });
          }
          return existing;
        }
      }

      const locationScheme = project.locationScheme ?? "building";
      const locationSort = locationSortKey(locationScheme, input.location);

      const MAX_RETRIES = 4;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const [{ max }] = await ctx.db
          .select({ max: sql<number>`coalesce(max(${inspectionItems.seq}), 0)` })
          .from(inspectionItems)
          .where(eq(inspectionItems.projectId, input.projectId));
        const seq = Number(max) + 1;
        try {
          const item = await ctx.db.transaction(async (tx) => {
            const [row] = await tx
              .insert(inspectionItems)
              .values({
                ...(input.id ? { id: input.id } : {}),
                projectId: input.projectId,
                seq,
                ref: `DEF-${pad4(seq)}`,
                type: input.type,
                title: input.title,
                finding: input.finding,
                suspectedCause: input.suspectedCause ?? null,
                acceptanceBasis: input.acceptanceBasis ?? null,
                interimAction: input.interimAction ?? null,
                accessNote: input.accessNote ?? null,
                locationScheme,
                location: input.location,
                locationSort,
                latitude: input.latitude ?? null,
                longitude: input.longitude ?? null,
                accuracyM: input.accuracyM ?? null,
                category: input.category ?? null,
                priority: input.priority ?? null,
                responsibleOrg: input.responsibleOrg ?? null,
                responsibleUserId: input.responsibleUserId ?? null,
                repairTarget: input.repairTarget ?? null,
                firstVisitId: input.visitId,
                createdBy: ctx.userId,
              })
              .returning();
            await tx.insert(inspectionItemEvents).values({
              itemId: row.id,
              projectId: input.projectId,
              visitId: input.visitId,
              actorId: ctx.userId,
              kind: "created",
              toStatus: "open",
              clientAt: input.clientAt ? new Date(input.clientAt) : null,
            });
            return row;
          });
          writeAuditLogAsync(ctx.db, {
            projectId: input.projectId,
            userId: ctx.userId,
            action: "create",
            entityType: "inspection_item",
            entityId: item.id,
            metadata: { ref: item.ref, type: item.type, title: item.title },
          });
          return item;
        } catch (err) {
          const dbErr = err as { code?: string; constraint_name?: string; constraint?: string };
          if (dbErr.code !== "23505") throw err;
          const constraint = dbErr.constraint_name ?? dbErr.constraint ?? "";
          // Retry only the seq/ref race; a duplicate id is a real conflict.
          if (!constraint.includes("project_seq") && !constraint.includes("project_ref")) {
            throw new TRPCError({ code: "CONFLICT", message: "Item id already in use." });
          }
          if (attempt === MAX_RETRIES - 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Could not allocate an item reference. Please try again.",
            });
          }
        }
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Item insert failed" });
    }),

  /** Creator within 24h, or the oversight set. Writes an `updated` event. */
  itemUpdate: protectedProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
        type: z.enum(INSPECTION_ITEM_TYPES).optional(),
        title: z.string().trim().min(1).max(160).optional(),
        finding: z.string().trim().min(1).max(4000).optional(),
        location: locationSchema.optional(),
        suspectedCause: z.string().trim().max(1000).nullable().optional(),
        acceptanceBasis: z.string().trim().max(500).nullable().optional(),
        interimAction: z.string().trim().max(1000).nullable().optional(),
        accessNote: z.string().trim().max(500).nullable().optional(),
        category: z.string().trim().max(80).nullable().optional(),
        priority: z.string().trim().max(40).nullable().optional(),
        responsibleOrg: z.string().trim().max(120).nullable().optional(),
        responsibleUserId: z.string().uuid().nullable().optional(),
        repairTarget: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        nextAction: z.string().trim().max(500).nullable().optional(),
        nextActionOwner: z.string().trim().max(120).nullable().optional(),
        nextActionDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({
        where: eq(inspectionItems.id, input.itemId),
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      const withinDay =
        item.createdBy === ctx.userId &&
        item.createdAt &&
        Date.now() - item.createdAt.getTime() < 24 * 60 * 60 * 1000;
      if (!withinDay) {
        await assertInspectionOversight(ctx.db, item.projectId, ctx.userId, ctx.dbUser.role);
      }
      const { itemId, location, ...rest } = input;
      const changed = Object.entries(rest).filter(([, v]) => v !== undefined);
      const patch: Record<string, unknown> = Object.fromEntries(changed);
      if (location) {
        patch.location = location;
        patch.locationSort = locationSortKey(item.locationScheme, location);
      }
      if (Object.keys(patch).length === 0) return item;
      patch.updatedAt = new Date();
      const [updated] = await ctx.db
        .update(inspectionItems)
        .set(patch)
        .where(eq(inspectionItems.id, itemId))
        .returning();
      await ctx.db.insert(inspectionItemEvents).values({
        itemId,
        projectId: item.projectId,
        actorId: ctx.userId,
        kind: "updated",
        note: `Updated ${Object.keys(patch).filter((k) => k !== "updatedAt").join(", ")}`,
      });
      writeAuditLogAsync(ctx.db, {
        projectId: item.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "inspection_item",
        entityId: itemId,
        metadata: { ref: item.ref, fields: Object.keys(patch) },
      });
      return updated;
    }),

  /** Tag an evidence row with a role on an item. Copies GPS to the item if empty. */
  attachPhoto: protectedProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
        evidenceId: z.string().uuid(),
        role: z.enum(INSPECTION_PHOTO_ROLES).default("defect"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({
        where: eq(inspectionItems.id, input.itemId),
        columns: { id: true, projectId: true, ref: true, latitude: true, longitude: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      await assertEvidenceInProject(ctx.db, input.evidenceId, item.projectId);
      await ctx.db
        .insert(inspectionItemPhotos)
        .values({
          itemId: input.itemId,
          evidenceId: input.evidenceId,
          role: input.role,
          addedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [inspectionItemPhotos.itemId, inspectionItemPhotos.evidenceId],
          set: { role: input.role },
        });
      if (item.latitude == null && input.role === "defect") {
        const ev = await ctx.db.query.evidence.findFirst({
          where: eq(evidence.id, input.evidenceId),
          columns: { latitude: true, longitude: true },
        });
        if (ev?.latitude != null && ev.longitude != null) {
          await ctx.db
            .update(inspectionItems)
            .set({ latitude: ev.latitude, longitude: ev.longitude })
            .where(eq(inspectionItems.id, input.itemId));
        }
      }
      await ctx.db.insert(inspectionItemEvents).values({
        itemId: input.itemId,
        projectId: item.projectId,
        actorId: ctx.userId,
        kind: "photo_added",
        evidenceIds: [input.evidenceId],
        note: input.role,
      });
      writeAuditLogAsync(ctx.db, {
        projectId: item.projectId,
        userId: ctx.userId,
        action: "link",
        entityType: "inspection_item",
        entityId: input.itemId,
        metadata: { ref: item.ref, evidenceId: input.evidenceId, role: input.role },
      });
      return { ok: true };
    }),

  /** Register rows with photo counts, ordered by location then ref. */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        status: z.enum(INSPECTION_ITEM_STATUSES).optional(),
        visitId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const conditions = [eq(inspectionItems.projectId, input.projectId)];
      if (input.status) conditions.push(eq(inspectionItems.status, input.status));
      if (input.visitId) conditions.push(eq(inspectionItems.firstVisitId, input.visitId));
      const items = await ctx.db.query.inspectionItems.findMany({
        where: and(...conditions),
        orderBy: [asc(inspectionItems.locationSort), asc(inspectionItems.seq)],
        with: {
          photos: {
            with: {
              evidence: {
                columns: { id: true, storageKey: true, thumbnailKey: true, deletedAt: true },
              },
            },
          },
        },
      });
      const withThumbs = await Promise.all(
        items.map(async (it) => {
          const live = it.photos.filter((p) => p.evidence && !p.evidence.deletedAt);
          const first = live.find((p) => p.role === "defect") ?? live[0];
          // Thumbnails are produced by the upload job; until then show the
          // original so a freshly recorded item never reads "no photo".
          const key = first?.evidence?.thumbnailKey ?? first?.evidence?.storageKey ?? null;
          const thumbUrl = key ? await getReadUrl(key) : null;
          const { photos, ...rest } = it;
          void photos;
          return { ...rest, photoCount: live.length, thumbUrl };
        })
      );
      return withThumbs;
    }),

  get: protectedProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({
        where: eq(inspectionItems.id, input.itemId),
        with: {
          creator: { columns: { id: true, name: true } },
          verifier: { columns: { id: true, name: true } },
          responsibleUser: { columns: { id: true, name: true } },
          events: {
            orderBy: [asc(inspectionItemEvents.createdAt)],
            with: { actor: { columns: { id: true, name: true } } },
          },
          photos: { with: { evidence: { columns: photoColumns } } },
        },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId);
      const photos = await Promise.all(
        item.photos
          .filter((p) => p.evidence && !p.evidence.deletedAt)
          .map(async (p) => ({
            evidenceId: p.evidenceId,
            role: p.role,
            addedAt: p.addedAt,
            capturedAt: p.evidence.capturedAt,
            uploadedAt: p.evidence.uploadedAt,
            latitude: p.evidence.latitude,
            longitude: p.evidence.longitude,
            originalFilename: p.evidence.originalFilename,
            note: p.evidence.note,
            thumbUrl: p.evidence.thumbnailKey ? await getReadUrl(p.evidence.thumbnailKey) : null,
            url: await getReadUrl(p.evidence.storageKey),
          }))
      );
      const { photos: _drop, ...rest } = item;
      void _drop;
      const actor = await actorFor(ctx.db, item.projectId, ctx.userId, ctx.dbUser.role);
      return { ...rest, photos, permissions: permissionsFor(item, actor) };
    }),

  /** Counts for the phone home tiles and the report summary. */
  summary: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), visitId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db
        .select({ status: inspectionItems.status, n: sql<number>`count(*)` })
        .from(inspectionItems)
        .where(eq(inspectionItems.projectId, input.projectId))
        .groupBy(inspectionItems.status);
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = Number(r.n);
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const today = new Date().toISOString().slice(0, 10);
      const [{ overdue }] = await ctx.db
        .select({ overdue: sql<number>`count(*)` })
        .from(inspectionItems)
        .where(
          and(
            eq(inspectionItems.projectId, input.projectId),
            sql`${inspectionItems.correctionDue} < ${today}`,
            sql`${inspectionItems.status} NOT IN (${sql.join(
              CLOSED_STATUSES.map((s) => sql`${s}`),
              sql`, `
            )})`
          )
        );
      const flagged = await ctx.db
        .select({ flags: inspectionItems.flags })
        .from(inspectionItems)
        .where(
          and(
            eq(inspectionItems.projectId, input.projectId),
            sql`${inspectionItems.flags} <> '{}'::jsonb`
          )
        );
      const flagCounts = { disputed: 0, access_blocked: 0, awaiting_test: 0 };
      for (const f of flagged) {
        const obj = (f.flags ?? {}) as Record<string, unknown>;
        for (const k of Object.keys(flagCounts) as (keyof typeof flagCounts)[]) {
          if (obj[k]) flagCounts[k]++;
        }
      }
      let newThisVisit = 0;
      let closedThisVisit = 0;
      if (input.visitId) {
        const [{ n }] = await ctx.db
          .select({ n: sql<number>`count(*)` })
          .from(inspectionItems)
          .where(
            and(
              eq(inspectionItems.projectId, input.projectId),
              eq(inspectionItems.firstVisitId, input.visitId)
            )
          );
        newThisVisit = Number(n);
        const [{ c }] = await ctx.db
          .select({ c: sql<number>`count(distinct ${inspectionItemEvents.itemId})` })
          .from(inspectionItemEvents)
          .where(
            and(
              eq(inspectionItemEvents.visitId, input.visitId),
              eq(inspectionItemEvents.toStatus, "verified_closed")
            )
          );
        closedThisVisit = Number(c);
      }
      const [{ withPhotos }] = await ctx.db
        .select({ withPhotos: sql<number>`count(distinct ${inspectionItemPhotos.itemId})` })
        .from(inspectionItemPhotos)
        .innerJoin(inspectionItems, eq(inspectionItems.id, inspectionItemPhotos.itemId))
        .innerJoin(evidence, eq(evidence.id, inspectionItemPhotos.evidenceId))
        .where(and(eq(inspectionItems.projectId, input.projectId), isNull(evidence.deletedAt)));
      return {
        total,
        byStatus,
        verifiedClosed: byStatus.verified_closed ?? 0,
        readyForReview: byStatus.ready_for_review ?? 0,
        open: (byStatus.open ?? 0) + (byStatus.in_progress ?? 0),
        reopened: byStatus.reopened ?? 0,
        otherDisposition: (byStatus.accepted_as_is ?? 0) + (byStatus.void ?? 0),
        overdue: Number(overdue),
        flags: flagCounts,
        newThisVisit,
        closedThisVisit,
        withPhotos: Number(withPhotos),
        withoutPhotos: total - Number(withPhotos),
      };
    }),

  /**
   * Move an item through the register. The rule module decides who may do
   * what; this procedure locks the row, re-reads it, attaches any photos
   * with the role the transition implies, and appends an event carrying
   * BOTH from and to status.
   */
  transition: protectedProcedure
    .input(
      z
        .object({
          itemId: z.string().uuid(),
          to: z.enum(["in_progress", "ready_for_review", "verified_closed", "reopened"]),
          note: z.string().trim().max(1000).optional(),
          evidenceIds: z.array(z.string().uuid()).max(10).optional(),
          visitId: z.string().uuid().optional(),
          clientAt: z.string().datetime().optional(),
        })
        .superRefine((d, ctx) => {
          if (d.to === "verified_closed" && !d.visitId) {
            ctx.addIssue({ code: "custom", path: ["visitId"], message: "Verification must be recorded against a visit." });
          }
          if (d.to === "reopened" && !(d.note && d.note.length >= 5)) {
            ctx.addIssue({ code: "custom", path: ["note"], message: "Give a reason for reopening." });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      const head = await ctx.db.query.inspectionItems.findFirst({
        where: eq(inspectionItems.id, input.itemId),
        columns: { id: true, projectId: true },
      });
      if (!head) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, head.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      const actor = await actorFor(ctx.db, head.projectId, ctx.userId, ctx.dbUser.role);
      if (input.visitId) {
        const visit = await ctx.db.query.inspectionVisits.findFirst({
          where: and(eq(inspectionVisits.id, input.visitId), eq(inspectionVisits.projectId, head.projectId)),
          columns: { id: true },
        });
        if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found" });
      }
      for (const evId of input.evidenceIds ?? []) await assertEvidenceInProject(ctx.db, evId, head.projectId);

      const result = await ctx.db.transaction(async (tx) => {
        const [item] = await tx.select().from(inspectionItems).where(eq(inspectionItems.id, input.itemId)).for("update");
        const rule = canTransition(item, actor, input.to);
        if (!rule.ok) throw new TRPCError({ code: "FORBIDDEN", message: rule.reason ?? "Not allowed" });

        // Photos supplied with the transition take the role it implies.
        const role = input.to === "verified_closed" ? "verified" : input.to === "ready_for_review" ? "rectified" : "during";
        for (const evId of input.evidenceIds ?? []) {
          await tx
            .insert(inspectionItemPhotos)
            .values({ itemId: item.id, evidenceId: evId, role, addedBy: ctx.userId })
            .onConflictDoUpdate({ target: [inspectionItemPhotos.itemId, inspectionItemPhotos.evidenceId], set: { role } });
        }
        if (rule.requires.verifiedPhoto) {
          const [{ n }] = await tx
            .select({ n: sql<number>`count(*)` })
            .from(inspectionItemPhotos)
            .innerJoin(evidence, eq(evidence.id, inspectionItemPhotos.evidenceId))
            .where(and(eq(inspectionItemPhotos.itemId, item.id), eq(inspectionItemPhotos.role, "verified"), isNull(evidence.deletedAt)));
          if (Number(n) === 0) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Attach a verification photo before marking this item verified closed." });
          }
        }

        const patch: Record<string, unknown> = { status: input.to, updatedAt: new Date() };
        if (input.to === "ready_for_review") patch.readyMarkedBy = ctx.userId;
        if (input.to === "verified_closed") { patch.verifiedBy = ctx.userId; patch.verifiedAt = new Date(); }
        if (input.to === "reopened") { patch.readyMarkedBy = null; patch.verifiedBy = null; patch.verifiedAt = null; }
        const [updated] = await tx.update(inspectionItems).set(patch).where(eq(inspectionItems.id, item.id)).returning();
        await tx.insert(inspectionItemEvents).values({
          itemId: item.id,
          projectId: item.projectId,
          visitId: input.visitId ?? null,
          actorId: ctx.userId,
          kind: input.to === "reopened" ? "reopened" : "status_change",
          fromStatus: item.status,
          toStatus: input.to,
          note: input.note ?? null,
          evidenceIds: input.evidenceIds?.length ? input.evidenceIds : null,
          clientAt: input.clientAt ? new Date(input.clientAt) : null,
        });
        return { updated, from: item.status };
      });

      writeAuditLogAsync(ctx.db, {
        projectId: head.projectId,
        userId: ctx.userId,
        action: input.to === "verified_closed" ? "verify" : input.to === "reopened" ? "reopen" : "status_change",
        entityType: "inspection_item",
        entityId: head.id,
        metadata: { ref: result.updated.ref, from: result.from, to: input.to, visitId: input.visitId ?? null },
      });
      return result.updated;
    }),

  /** Ready for review → Open with a reason (event `not_accepted`). */
  reject: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), reason: z.string().trim().min(5).max(1000), visitId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const head = await ctx.db.query.inspectionItems.findFirst({ where: eq(inspectionItems.id, input.itemId), columns: { id: true, projectId: true } });
      if (!head) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, head.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      const actor = await actorFor(ctx.db, head.projectId, ctx.userId, ctx.dbUser.role);
      const updated = await ctx.db.transaction(async (tx) => {
        const [item] = await tx.select().from(inspectionItems).where(eq(inspectionItems.id, input.itemId)).for("update");
        const rule = canReject(item, actor);
        if (!rule.ok) throw new TRPCError({ code: "FORBIDDEN", message: rule.reason ?? "Not allowed" });
        const [row] = await tx.update(inspectionItems).set({ status: "open", readyMarkedBy: null, updatedAt: new Date() }).where(eq(inspectionItems.id, item.id)).returning();
        await tx.insert(inspectionItemEvents).values({ itemId: item.id, projectId: item.projectId, visitId: input.visitId ?? null, actorId: ctx.userId, kind: "not_accepted", fromStatus: item.status, toStatus: "open", note: input.reason });
        return row;
      });
      writeAuditLogAsync(ctx.db, { projectId: head.projectId, userId: ctx.userId, action: "status_change", entityType: "inspection_item", entityId: head.id, metadata: { ref: updated.ref, from: "ready_for_review", to: "open", notAccepted: true } });
      return updated;
    }),

  setFlag: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), flag: z.enum(["disputed", "access_blocked", "awaiting_test"]), reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({ where: eq(inspectionItems.id, input.itemId), columns: { id: true, projectId: true, ref: true, status: true, flags: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      if (item.status === "accepted_as_is" || item.status === "void") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This item has a final disposition." });
      const flags = { ...((item.flags ?? {}) as Record<string, unknown>), [input.flag]: { reason: input.reason, since: new Date().toISOString(), by: ctx.userId } };
      await ctx.db.update(inspectionItems).set({ flags, updatedAt: new Date() }).where(eq(inspectionItems.id, item.id));
      await ctx.db.insert(inspectionItemEvents).values({ itemId: item.id, projectId: item.projectId, actorId: ctx.userId, kind: "flag_set", note: `${input.flag.replace(/_/g, " ")}: ${input.reason}` });
      writeAuditLogAsync(ctx.db, { projectId: item.projectId, userId: ctx.userId, action: "flag", entityType: "inspection_item", entityId: item.id, metadata: { ref: item.ref, flag: input.flag, set: true } });
      return { ok: true, flags };
    }),

  clearFlag: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), flag: z.enum(["disputed", "access_blocked", "awaiting_test"]), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({ where: eq(inspectionItems.id, input.itemId), columns: { id: true, projectId: true, ref: true, flags: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      const flags = { ...((item.flags ?? {}) as Record<string, unknown>) };
      delete flags[input.flag];
      await ctx.db.update(inspectionItems).set({ flags, updatedAt: new Date() }).where(eq(inspectionItems.id, item.id));
      await ctx.db.insert(inspectionItemEvents).values({ itemId: item.id, projectId: item.projectId, actorId: ctx.userId, kind: "flag_cleared", note: `${input.flag.replace(/_/g, " ")}${input.note ? `: ${input.note}` : ""}` });
      writeAuditLogAsync(ctx.db, { projectId: item.projectId, userId: ctx.userId, action: "flag", entityType: "inspection_item", entityId: item.id, metadata: { ref: item.ref, flag: input.flag, set: false } });
      return { ok: true, flags };
    }),

  /** Accepted as-is (NEC cl. 45 style) or void — terminal, reference required. */
  disposition: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), to: z.enum(["accepted_as_is", "void"]), reference: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const head = await ctx.db.query.inspectionItems.findFirst({ where: eq(inspectionItems.id, input.itemId), columns: { id: true, projectId: true } });
      if (!head) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, head.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      const actor = await actorFor(ctx.db, head.projectId, ctx.userId, ctx.dbUser.role);
      const updated = await ctx.db.transaction(async (tx) => {
        const [item] = await tx.select().from(inspectionItems).where(eq(inspectionItems.id, input.itemId)).for("update");
        const rule = canDispose(item, actor, input.to);
        if (!rule.ok) throw new TRPCError({ code: "FORBIDDEN", message: rule.reason ?? "Not allowed" });
        const [row] = await tx.update(inspectionItems).set({ status: input.to, dispositionRef: input.reference, dispositionBy: ctx.userId, dispositionAt: new Date(), updatedAt: new Date() }).where(eq(inspectionItems.id, item.id)).returning();
        await tx.insert(inspectionItemEvents).values({ itemId: item.id, projectId: item.projectId, actorId: ctx.userId, kind: "disposition", fromStatus: item.status, toStatus: input.to, note: input.reference });
        return row;
      });
      writeAuditLogAsync(ctx.db, { projectId: head.projectId, userId: ctx.userId, action: "disposition", entityType: "inspection_item", entityId: head.id, metadata: { ref: updated.ref, to: input.to, reference: input.reference } });
      return updated;
    }),

  /** Record a formal notification and compute the correction due date from the project setting. */
  notify: protectedProcedure
    .input(z.object({ itemId: z.string().uuid(), notifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notifiedBy: z.string().trim().min(1).max(120), notifiedTo: z.string().trim().min(1).max(120), notificationRef: z.string().trim().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.query.inspectionItems.findFirst({ where: eq(inspectionItems.id, input.itemId), columns: { id: true, projectId: true, ref: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      const access = await assertProjectAccess(ctx.db, item.projectId, ctx.orgId, ctx.userId, { requireActive: true });
      assertProjectType(access, "inspection");
      const actor = await actorFor(ctx.db, item.projectId, ctx.userId, ctx.dbUser.role);
      const rule = canNotify(actor);
      if (!rule.ok) throw new TRPCError({ code: "FORBIDDEN", message: rule.reason ?? "Not allowed" });
      const project = await loadProject(ctx.db, item.projectId);
      let correctionDue: string | null = null;
      if (project.defaultCorrectionPeriodDays) {
        const d = new Date(input.notifiedAt + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + project.defaultCorrectionPeriodDays);
        correctionDue = d.toISOString().slice(0, 10);
      }
      const [updated] = await ctx.db.update(inspectionItems).set({ notifiedAt: input.notifiedAt, notifiedBy: input.notifiedBy, notifiedTo: input.notifiedTo, notificationRef: input.notificationRef ?? null, correctionDue, updatedAt: new Date() }).where(eq(inspectionItems.id, item.id)).returning();
      await ctx.db.insert(inspectionItemEvents).values({ itemId: item.id, projectId: item.projectId, actorId: ctx.userId, kind: "notified", note: `Notified ${input.notifiedAt} by ${input.notifiedBy} to ${input.notifiedTo}${input.notificationRef ? ` (${input.notificationRef})` : ""}${correctionDue ? ` · correction due ${correctionDue} (computed)` : ""}` });
      writeAuditLogAsync(ctx.db, { projectId: item.projectId, userId: ctx.userId, action: "notify", entityType: "inspection_item", entityId: item.id, metadata: { ref: item.ref, notifiedAt: input.notifiedAt, correctionDue } });
      return updated;
    }),

  /**
   * Inspection project settings — oversight roles only (C30): the template
   * says an authorised role confirms contract dates, so any-member
   * project.update must not carry these.
   */
  settingsUpdate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        contractForm: z.enum(CONTRACT_FORMS).nullable().optional(),
        locationScheme: z.enum(LOCATION_SCHEMES).nullable().optional(),
        defaultCorrectionPeriodDays: z.number().int().min(1).max(365).nullable().optional(),
        contractDates: z
          .object({
            completion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
            defectsDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
            confirmed: z
              .object({ completion: z.boolean().optional(), defectsDate: z.boolean().optional() })
              .optional(),
          })
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      assertProjectType(access, "inspection");
      await assertInspectionOversight(ctx.db, input.projectId, ctx.userId, ctx.dbUser.role);
      const { projectId, ...rest } = input;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) return { ok: true };
      await ctx.db
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      writeAuditLogAsync(ctx.db, {
        projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "project",
        entityId: projectId,
        metadata: { inspectionSettings: Object.keys(patch) },
      });
      return { ok: true };
    }),

  /**
   * Same data-gather + templates the PDF pipeline uses, for review before
   * generating. Also persists the visit facts typed in the dialog.
   */
  previewHtml: protectedProcedure
    .input(reportFactsSchema)
    .mutation(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      assertProjectType(access, "inspection");
      const existing = await ctx.db.query.reports.findMany({
        where: eq(reports.projectId, input.projectId),
        columns: { reportNumber: true },
        orderBy: [desc(reports.reportNumber)],
        limit: 1,
      });
      const data = await gatherInspectionReportData(ctx.db, {
        ...input,
        generatedBy: ctx.userId,
        reportNumber: (existing[0]?.reportNumber ?? 0) + 1,
      });
      return { html: await renderInspectionReportHTML(data), summary: data.summary };
    }),

  /**
   * Allocate the reports row (same numbering, one-in-flight and approval
   * chain snapshot as report.generate — duplicated deliberately so the
   * progress procedure stays untouched) and queue the inspection pipeline.
   * Period start = period end = the visit date; report_kind = 'inspection'.
   */
  generateReport: protectedProcedure
    .input(reportFactsSchema.extend({ password: z.string().min(4).max(128).optional() }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });
      assertProjectType(access, "inspection");
      const visit = await ctx.db.query.inspectionVisits.findFirst({
        where: and(eq(inspectionVisits.id, input.visitId), eq(inspectionVisits.projectId, input.projectId)),
      });
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found" });

      // Persist the visit facts typed in the dialog so the register and
      // later revisions carry them.
      const visitPatch: Record<string, unknown> = {};
      if (input.scopeNote !== undefined) visitPatch.scopeNote = input.scopeNote || null;
      if (input.methodLine !== undefined) visitPatch.methodLine = input.methodLine || null;
      if (input.weather !== undefined) visitPatch.weather = input.weather || null;
      if (input.urgentConcerns !== undefined) visitPatch.urgentConcerns = input.urgentConcerns || null;
      if (input.attendees !== undefined) visitPatch.attendees = input.attendees;
      if (input.notInspected !== undefined) visitPatch.notInspected = input.notInspected;
      if (Object.keys(visitPatch).length) {
        await ctx.db.update(inspectionVisits).set(visitPatch).where(eq(inspectionVisits.id, visit.id));
      }

      const projectRow = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { approvalChain: true, firstReportNumber: true },
      });
      const chain = parseApprovalChain(projectRow?.approvalChain);
      let approvalState: ApprovalState | null = null;
      if (chain) {
        const ids = chain.steps.map((s) => s.userId);
        const [stepUsers, stepMembers] = await Promise.all([
          ctx.db.query.users.findMany({ where: inArray(users.id, ids), columns: { id: true, name: true } }),
          ctx.db.query.projectMembers.findMany({
            where: and(eq(projectMembers.projectId, input.projectId), inArray(projectMembers.userId, ids)),
            columns: { userId: true, role: true },
          }),
        ]);
        const nameById = new Map(stepUsers.map((u) => [u.id, u.name]));
        const roleById = new Map(stepMembers.map((m) => [m.userId, m.role]));
        approvalState = {
          steps: chain.steps.map((s) => ({
            userId: s.userId,
            label: s.label,
            name: nameById.get(s.userId) ?? "Unknown user",
            roleLabel: MEMBER_ROLE_LABELS[roleById.get(s.userId) as ProjectMemberRole] ?? null,
            approvedAt: null,
            approvedName: null,
          })),
          completedAt: null,
        };
      }

      const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
      const passwordCiphertext = input.password ? encryptReportPassword(input.password) : null;

      const STALE_GENERATING_MS = 15 * 60 * 1000;
      await ctx.db
        .update(reports)
        .set({ status: "failed", passwordCiphertext: null })
        .where(and(eq(reports.projectId, input.projectId), eq(reports.status, "generating"), lt(reports.createdAt, new Date(Date.now() - STALE_GENERATING_MS))));

      let report: typeof reports.$inferSelect | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        const existing = await ctx.db.query.reports.findMany({
          where: eq(reports.projectId, input.projectId),
          columns: { reportNumber: true },
          orderBy: [desc(reports.reportNumber)],
          limit: 1,
        });
        const reportNumber = existing[0] ? existing[0].reportNumber + 1 : (projectRow?.firstReportNumber ?? 1);
        try {
          [report] = await ctx.db
            .insert(reports)
            .values({
              projectId: input.projectId,
              generatedBy: ctx.userId,
              reportNumber,
              periodStart: visit.visitDate,
              periodEnd: visit.visitDate,
              passwordHash,
              passwordCiphertext,
              approvalState,
              status: "generating",
              reportKind: "inspection",
              revision: 1,
            })
            .returning();
          break;
        } catch (err) {
          const dbErr = err as { code?: string; constraint_name?: string; constraint?: string };
          if (dbErr.code !== "23505") throw err;
          const constraint = dbErr.constraint_name ?? dbErr.constraint ?? "";
          if (constraint.includes("one_generating_per_project")) {
            throw new TRPCError({ code: "CONFLICT", message: "A report is already being generated. Please wait for it to complete." });
          }
          if (attempt === 2) throw new TRPCError({ code: "CONFLICT", message: "Could not allocate a report number. Please try again.", cause: err });
        }
      }
      if (!report) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Report insert failed after retries" });

      const { password: _pw, ...facts } = input;
      void _pw;
      try {
        await inngest.send({
          name: "report/generate-inspection",
          data: { reportId: report.id, generatedBy: ctx.userId, ...facts },
        });
      } catch (err) {
        console.error("[inspection.generateReport] Failed to queue:", err);
        await ctx.db.update(reports).set({ status: "failed", passwordCiphertext: null }).where(eq(reports.id, report.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not queue report generation. Please try again later.", cause: err });
      }

      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "generate",
        entityType: "report",
        entityId: report.id,
        metadata: { reportNumber: report.reportNumber, kind: "inspection", stage: input.stage, reportKind: input.kind, visitId: input.visitId },
      });
      if (input.signatures?.length) {
        writeAuditLogAsync(ctx.db, {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "approve",
          entityType: "report",
          entityId: report.id,
          metadata: { reportNumber: report.reportNumber, approvals: input.signatures.map((s) => ({ role: s.role, name: s.name, title: s.title ?? null, method: s.imageDataUrl ? "signature-image" : "typed-name" })) },
        });
      }
      return { id: report.id, reportNumber: report.reportNumber, status: report.status };
    }),
});
