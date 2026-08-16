import { z } from "zod";
import { eq, and, desc, ne, or, isNull, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { projects, organisations, projectMembers, users, reports, evidence, tasks, gpsZones, reportDrafts, reportShares } from "@/server/db/schema";
import { PROJECT_MEMBER_ROLES, PROJECT_STATUSES } from "@/server/db/enums";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { getPublicUrl, uploadToStorage } from "@/server/services/storage";
import {
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
} from "@/server/services/stripe";
import { inngest } from "@/server/inngest/client";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(PROJECT_STATUSES).optional(),
          includeArchived: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const demoMode = process.env.DEMO_MODE === "true";

      // Optional server-side filtering: `status` narrows to a single status;
      // `includeArchived: false` excludes archived projects. No input returns
      // everything (existing behavior for pickers like capture/command palette).
      const statusFilter = input?.status
        ? demoMode && input.status === "active"
          ? // Demo mode surfaces pending_payment projects as active (mapped
            // below), so an "active" filter must match them too.
            inArray(projects.status, ["active", "pending_payment"])
          : eq(projects.status, input.status)
        : input?.includeArchived === false
          ? or(ne(projects.status, "archived"), isNull(projects.status))
          : undefined;

      // Admins see every project in the org. Non-admin members only see the
      // projects they've been added to via project_members. This matches the
      // membership check enforced by every other router (task, evidence, zone,
      // report) so the project list never shows a project the user can't open.
      let result: typeof projects.$inferSelect[];
      if (ctx.dbUser.role === "admin") {
        result = await ctx.db.query.projects.findMany({
          where: and(eq(projects.orgId, ctx.orgId), statusFilter),
          orderBy: [desc(projects.createdAt)],
        });
      } else {
        const rows = await ctx.db
          .select()
          .from(projects)
          .innerJoin(
            projectMembers,
            eq(projectMembers.projectId, projects.id)
          )
          .where(
            and(
              eq(projects.orgId, ctx.orgId),
              eq(projectMembers.userId, ctx.userId),
              statusFilter
            )
          )
          .orderBy(desc(projects.createdAt));
        result = rows.map((r) => r.projects);
      }

      // In demo mode, treat pending_payment as active
      if (process.env.DEMO_MODE === "true") {
        return result.map((p) => ({
          ...p,
          status: p.status === "pending_payment" ? "active" : p.status,
        }));
      }

      return result;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // assertProjectAccess enforces org match AND project membership (admins
      // bypass membership). Previously this only checked org match, so any
      // org member could load any project even if not added to it.
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // In demo mode, treat pending_payment as active
      if (process.env.DEMO_MODE === "true" && project.status === "pending_payment") {
        return { ...project, status: "active" };
      }
      return project;
    }),

  create: protectedProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(1, "Project name is required"),
          reference: z.string().optional(),
          clientName: z.string().optional(),
          contractType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          reportingFrequency: z.string().optional(),
          nextReportDue: z.string().optional(),
        })
        .refine(
          (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
          { message: "End date must be on or after start date", path: ["endDate"] }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const stripeConfigured =
        process.env.DEMO_MODE !== "true" &&
        process.env.STRIPE_SECRET_KEY &&
        !process.env.STRIPE_SECRET_KEY.includes("PLACEHOLDER");

      // Create project — active immediately if Stripe not configured, pending otherwise
      const [project] = await ctx.db
        .insert(projects)
        .values({
          name: input.name,
          orgId: ctx.orgId,
          status: stripeConfigured ? "pending_payment" : "active",
          reference: input.reference || null,
          clientName: input.clientName || null,
          contractType: input.contractType || null,
          startDate: input.startDate || null,
          endDate: input.endDate || null,
          reportingFrequency: input.reportingFrequency || null,
          nextReportDue: input.nextReportDue || null,
        })
        .returning();

      writeAuditLogAsync(ctx.db, { projectId: project.id, userId: ctx.userId, action: "create", entityType: "project", entityId: project.id, metadata: { name: project.name } });

      // Skip Stripe in dev when not configured
      if (!stripeConfigured) {
        return { project, checkoutUrl: null };
      }

      // Get or create Stripe customer for the org
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, ctx.orgId),
      });
      const customerId = await getOrCreateCustomer(
        ctx.db,
        ctx.orgId,
        org?.name ?? "Organisation",
        ctx.dbUser.email
      );

      // Create Stripe Checkout Session
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const checkoutUrl = await createCheckoutSession({
        customerId,
        projectId: project.id,
        projectName: input.name,
        successUrl: `${appUrl}/projects/${project.id}?checkout=success`,
        cancelUrl: `${appUrl}/projects/new?checkout=cancelled`,
      });

      return { project, checkoutUrl };
    }),

  update: adminProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).optional(),
          reference: z.string().optional(),
          clientName: z.string().optional(),
          contractType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          reportingFrequency: z.string().optional(),
          nextReportDue: z.string().optional(),
          status: z.enum(PROJECT_STATUSES).optional(),
        })
        .refine(
          (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate,
          { message: "End date must be on or after start date", path: ["endDate"] }
        )
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);
      const { id, ...data } = input;
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(data)) {
        cleaned[key] = val === "" ? null : val;
      }
      const [project] = await ctx.db
        .update(projects)
        .set({ ...cleaned, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: id, userId: ctx.userId, action: "update", entityType: "project", entityId: id });
      return project;
    }),

  // Programme-as-living-document ritual: contractors issue an updated
  // programme every period. Import stamps this automatically; this is
  // the one-tap "no change this period" alternative.
  confirmProgramme: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);
      await ctx.db
        .update(projects)
        .set({ programmeConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, input.id));
      writeAuditLogAsync(ctx.db, {
        projectId: input.id,
        userId: ctx.userId,
        action: "confirm_programme",
        entityType: "project",
        entityId: input.id,
      });
      return { ok: true };
    }),

  // The living gap list: what stands between this project and its next
  // report, computed per reporting period (period = since the last
  // completed report's period end, else the project start).
  gapList: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
        columns: {
          nextReportDue: true,
          programmeConfirmedAt: true,
          reportingFrequency: true,
          startDate: true,
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const lastReport = await ctx.db.query.reports.findFirst({
        where: and(eq(reports.projectId, input.id), eq(reports.status, "completed")),
        orderBy: [desc(reports.reportNumber)],
        columns: { id: true, periodEnd: true, reportNumber: true, status: true },
      });
      const periodStartStr = lastReport
        ? lastReport.periodEnd
        : (project.startDate ?? new Date().toISOString().slice(0, 10));
      const periodStart = new Date(periodStartStr + "T00:00:00Z");

      const rows = await ctx.db
        .select({
          id: evidence.id,
          note: evidence.note,
          capturedAt: evidence.capturedAt,
          uploadedAt: evidence.uploadedAt,
          linkCount: sql<number>`(select count(*) from evidence_links el where el.evidence_id = ${evidence.id})::int`,
        })
        .from(evidence)
        .where(and(eq(evidence.projectId, input.id), isNull(evidence.deletedAt)));

      const inPeriod = rows.filter((r) => {
        const at = r.capturedAt ?? r.uploadedAt;
        return at != null && at >= periodStart;
      });
      const unlinked = inPeriod.filter((r) => r.linkCount === 0).length;
      const uncaptioned = inPeriod.filter((r) => !r.note?.trim()).length;

      const [taskCountRow] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.projectId, input.id));

      const programmeConfirmedThisPeriod =
        project.programmeConfirmedAt != null &&
        project.programmeConfirmedAt >= periodStart;

      // ── Readiness-engine extensions (src/lib/readiness.ts consumes) ──

      // Photos per day, last 7 calendar days — the phone home week tracker.
      const dayMs = 86_400_000;
      const todayUtc = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      const photosByDay = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(todayUtc.getTime() - (6 - i) * dayMs);
        const dayStr = day.toISOString().slice(0, 10);
        const count = rows.filter((r) => {
          const at = r.capturedAt ?? r.uploadedAt;
          return at != null && at.toISOString().slice(0, 10) === dayStr;
        }).length;
        return { date: dayStr, count };
      });

      const [zoneCountRow] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(gpsZones)
        .where(eq(gpsZones.projectId, input.id));

      // In-progress activities with zero linked photos this period — the
      // honesty box and the phone home's danger rows.
      const zeroPhotoTasks = await ctx.db
        .select({
          id: tasks.id,
          name: tasks.name,
          progressPct: sql<number>`coalesce(${tasks.progressPct}, 0)::int`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.id),
            eq(tasks.status, "in_progress"),
            sql`not exists (
              select 1 from evidence_links el
              join evidence e on e.id = el.evidence_id
              where el.task_id = ${tasks.id}
                and e.deleted_at is null
                and coalesce(e.captured_at, e.uploaded_at) >= ${periodStart.toISOString()}::timestamptz
            )`
          )
        )
        .limit(3);

      // Last completed report's delivery state (share created = sent).
      let lastReportOut: {
        id: string;
        number: number;
        status: string | null;
        sentAt: string | null;
        openedAt: string | null;
      } | null = null;
      if (lastReport) {
        const share = await ctx.db.query.reportShares.findFirst({
          where: eq(reportShares.reportId, lastReport.id),
          orderBy: [desc(reportShares.createdAt)],
          with: { events: true },
        });
        const opened =
          share?.events
            .filter((e) => e.event === "opened" && e.createdAt)
            .map((e) => e.createdAt!)
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        lastReportOut = {
          id: lastReport.id,
          number: lastReport.reportNumber,
          status: lastReport.status,
          sentAt: share?.createdAt?.toISOString() ?? null,
          openedAt: opened?.toISOString() ?? null,
        };
      }

      // The standing draft's approval states (stale period ⇒ ignored).
      const draftRow = await ctx.db.query.reportDrafts.findFirst({
        where: eq(reportDrafts.projectId, input.id),
      });
      const payload =
        draftRow && draftRow.periodStart === periodStartStr
          ? (draftRow.payload as {
              narrativeApprovedAt?: string | null;
              issuesSignedOffAt?: string | null;
              signedAt?: string | null;
            })
          : null;

      return {
        nextReportDue: project.nextReportDue,
        reportingFrequency: project.reportingFrequency,
        lastReportNumber: lastReport?.reportNumber ?? null,
        periodStart: periodStartStr,
        taskCount: taskCountRow?.count ?? 0,
        photosThisPeriod: inPeriod.length,
        unlinked,
        uncaptioned,
        programmeConfirmedThisPeriod,
        photosByDay,
        zoneCount: zoneCountRow?.count ?? 0,
        zeroPhotoTasks,
        lastReport: lastReportOut,
        draft: payload
          ? {
              narrativeApprovedAt: payload.narrativeApprovedAt ?? null,
              issuesSignedOffAt: payload.issuesSignedOffAt ?? null,
              signedAt: payload.signedAt ?? null,
            }
          : null,
      };
    }),

  // Closes the reporting period after send: clears the standing draft so
  // the next period starts honest. Does NOT touch nextReportDue — report
  // generation already advanced it.
  closePeriod: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);
      await ctx.db
        .delete(reportDrafts)
        .where(eq(reportDrafts.projectId, input.id));
      writeAuditLogAsync(ctx.db, {
        projectId: input.id,
        userId: ctx.userId,
        action: "update",
        entityType: "project",
        entityId: input.id,
        metadata: { event: "close_period" },
      });
      return { ok: true };
    }),

  archive: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);

      // Cancel Stripe subscription if one exists
      const existing = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      if (existing?.stripeSubscriptionId) {
        try {
          await cancelSubscription(existing.stripeSubscriptionId);
        } catch (err) {
          console.error("[project.archive] Failed to cancel subscription:", err);
        }
      }

      const [project] = await ctx.db
        .update(projects)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning();
      writeAuditLogAsync(ctx.db, { projectId: input.id, userId: ctx.userId, action: "archive", entityType: "project", entityId: input.id });
      return project;
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        /** Must match the project name exactly — server-side rail behind the type-to-confirm UI. */
        confirmName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.id, ctx.orgId, ctx.userId);

      const existing = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      if (input.confirmName.trim() !== existing.name.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project name doesn't match — type it exactly to confirm deletion.",
        });
      }

      if (existing.stripeSubscriptionId) {
        try {
          await cancelSubscription(existing.stripeSubscriptionId);
        } catch (err) {
          console.error("[project.delete] Failed to cancel subscription:", err);
        }
      }

      // Every child table (tasks, zones, evidence, links, reports, members,
      // audit log, upload intents) cascades from this delete.
      await ctx.db.delete(projects).where(eq(projects.id, input.id));

      // Stored files (photos, thumbnails, report PDFs, client logo) are
      // removed async — the privacy policy promises real deletion, so a
      // failure to even queue the cleanup is logged loudly for follow-up.
      try {
        await inngest.send({
          name: "project/deleted",
          data: { projectId: input.id },
        });
      } catch (err) {
        console.error(
          `[project.delete] Storage cleanup event failed — objects orphaned under projects/${input.id}/`,
          err
        );
      }

      return { ok: true };
    }),

  createPortalSession: protectedProcedure
    .mutation(async ({ ctx }) => {
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, ctx.orgId),
      });

      if (!org?.stripeCustomerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No billing account found. Create a project first to set up billing.",
        });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const portalUrl = await createPortalSession(
        org.stripeCustomerId,
        `${appUrl}/projects`
      );

      return { portalUrl };
    }),

  // ─── Member Management ──────────────────────────────────────────────────────

  /**
   * The signed-in user's own profile plus their organisation name. Used by
   * the Account page and the settings team picker (to exclude yourself).
   * Never exposes clerk/internal ids beyond the db user id.
   */
  currentUser: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.query.organisations.findFirst({
      where: eq(organisations.id, ctx.orgId),
      columns: { name: true },
    });
    return {
      id: ctx.dbUser.id,
      name: ctx.dbUser.name,
      email: ctx.dbUser.email,
      role: ctx.dbUser.role,
      orgName: org?.name ?? null,
    };
  }),

  orgUsers: protectedProcedure.query(async ({ ctx }) => {
    const orgUsers = await ctx.db.query.users.findMany({
      where: eq(users.orgId, ctx.orgId),
      columns: { id: true, name: true, email: true, avatarUrl: true, role: true },
    });
    return orgUsers;
  }),

  memberList: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const members = await ctx.db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, input.projectId),
        with: {
          user: {
            columns: { id: true, name: true, email: true, avatarUrl: true, role: true },
          },
        },
      });
      return members;
    }),

  memberAdd: adminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(PROJECT_MEMBER_ROLES).default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);

      // Verify target user belongs to same org
      const targetUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { id: true, orgId: true, name: true },
      });
      if (!targetUser || targetUser.orgId !== ctx.orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User not found in your organisation" });
      }

      // Check if already a member
      const existing = await ctx.db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, input.projectId),
          eq(projectMembers.userId, input.userId)
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "User is already a member of this project" });
      }

      const [member] = await ctx.db
        .insert(projectMembers)
        .values({
          projectId: input.projectId,
          userId: input.userId,
          role: input.role,
        })
        .returning();

      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "add_member",
        entityType: "project_member",
        entityId: member.id,
        metadata: { addedUserId: input.userId, addedUserName: targetUser.name, role: input.role },
      });

      return member;
    }),

  memberRemove: adminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);

      const existing = await ctx.db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, input.projectId),
          eq(projectMembers.userId, input.userId)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      await ctx.db
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, input.projectId),
            eq(projectMembers.userId, input.userId)
          )
        );

      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "remove_member",
        entityType: "project_member",
        entityId: existing.id,
        metadata: { removedUserId: input.userId },
      });

      return { success: true };
    }),

  uploadClientLogo: adminProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        // ~2MB binary as base64; logos are small and this avoids R2 CORS
        imageBase64: z.string().min(10).max(2_800_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const sharp = (await import("sharp")).default;
      let png: Buffer;
      try {
        png = await sharp(Buffer.from(input.imageBase64, "base64"))
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That file couldn't be read as an image. Use a PNG, JPEG or WebP logo.",
        });
      }
      const key = `projects/${input.projectId}/branding/client-logo.png`;
      await uploadToStorage(key, png, "image/png");
      await ctx.db
        .update(projects)
        .set({ clientLogoKey: key, updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));
      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "update",
        entityType: "project",
        entityId: input.projectId,
        metadata: { field: "clientLogo" },
      });
      return { clientLogoUrl: getPublicUrl(key) };
    }),

  removeClientLogo: adminProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      await ctx.db
        .update(projects)
        .set({ clientLogoKey: null, updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));
      return { success: true };
    }),
});
