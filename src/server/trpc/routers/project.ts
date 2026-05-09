import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { projects, organisations, projectMembers, users } from "@/server/db/schema";
import { PROJECT_MEMBER_ROLES, PROJECT_STATUSES } from "@/server/db/enums";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import {
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
} from "@/server/services/stripe";

export const projectRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Admins see every project in the org. Non-admin members only see the
    // projects they've been added to via project_members. This matches the
    // membership check enforced by every other router (task, evidence, zone,
    // report) so the project list never shows a project the user can't open.
    let result: typeof projects.$inferSelect[];
    if (ctx.dbUser.role === "admin") {
      result = await ctx.db.query.projects.findMany({
        where: eq(projects.orgId, ctx.orgId),
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
            eq(projectMembers.userId, ctx.userId)
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
          name: z.string().min(1, "Project name is required"),
          reference: z.string().optional(),
          clientName: z.string().optional(),
          contractType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          reportingFrequency: z.string().optional(),
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
          name: z.string().min(1).optional(),
          reference: z.string().optional(),
          clientName: z.string().optional(),
          contractType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          reportingFrequency: z.string().optional(),
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
});
