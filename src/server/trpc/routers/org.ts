import { z } from "zod";
import { and, eq, inArray, isNull, ne, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { organisations, users, projects, projectMembers } from "@/server/db/schema";
import { USER_ROLES } from "@/server/db/enums";
import { parseApprovalChain } from "@/lib/report-approval";
import { writeAuditLogAsync } from "@/server/services/audit";
import { getPublicUrl, uploadToStorage } from "@/server/services/storage";
import { sendColleagueInvitation } from "@/server/services/clerk-invitations";

/** Logos arrive as base64 (small files, avoids R2 CORS entirely). */
const MAX_LOGO_BASE64 = 2_800_000; // ~2MB binary

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function processLogo(imageBase64: string): Promise<Buffer> {
  const buf = Buffer.from(imageBase64, "base64");
  // Native module — loaded lazily so a binary-load failure breaks logo
  // upload only, never the whole tRPC router. A top-level import here took
  // ALL of tRPC down for 3 days when sharp 0.35's libvips went missing on
  // Vercel (2026-09-01 outage). Keep it dynamic.
  const sharp = (await import("sharp")).default;
  try {
    // Normalise everything to a bounded PNG — strips EXIF, caps dimensions,
    // and guarantees the report renderer never meets a 20MB camera original.
    return await sharp(buf)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That file couldn't be read as an image. Use a PNG, JPEG or WebP logo.",
    });
  }
}

export const orgRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.query.organisations.findFirst({
      where: eq(organisations.id, ctx.orgId),
    });
    if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organisation not found" });
    return {
      id: org.id,
      name: org.name,
      logoUrl: org.logoUrl
        ? org.logoUrl.startsWith("http")
          ? org.logoUrl
          : getPublicUrl(org.logoUrl)
        : null,
      brandColor: org.brandColor,
      companyDetails: org.companyDetails,
    };
  }),

  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120).optional(),
        brandColor: z.string().regex(HEX_COLOR).nullable().optional(),
        companyDetails: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .update(organisations)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(organisations.id, ctx.orgId))
        .returning();
      return { name: org.name, brandColor: org.brandColor, companyDetails: org.companyDetails };
    }),

  uploadLogo: adminProcedure
    .input(z.object({ imageBase64: z.string().min(10).max(MAX_LOGO_BASE64) }))
    .mutation(async ({ ctx, input }) => {
      const png = await processLogo(input.imageBase64);
      const key = `orgs/${ctx.orgId}/logo.png`;
      await uploadToStorage(key, png, "image/png");
      await ctx.db
        .update(organisations)
        .set({ logoUrl: key, updatedAt: new Date() })
        .where(eq(organisations.id, ctx.orgId));
      return { logoUrl: getPublicUrl(key) };
    }),

  removeLogo: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(organisations)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(organisations.id, ctx.orgId));
    return { success: true };
  }),

  /** Stamps the first-run setup wizard as finished (or skipped) so the
   * dashboard layout stops redirecting to /onboarding. protectedProcedure
   * on purpose: any org member can exit the wizard, not just admins. */
  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(organisations)
      .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(organisations.id, ctx.orgId));
    return { success: true };
  }),

  /**
   * Pre-seed a colleague into this organisation by email AND email them a
   * Clerk invitation. The pre-seed is the source of truth: the email-first
   * lookup in ensureUser / the Clerk webhook claims this row (fills in the
   * real clerkId) whether they arrive via the invite link or sign up
   * directly with the same address — so a failed/undelivered email only
   * loses convenience, never access. Re-adding an unclaimed colleague
   * re-attempts the invite (acts as "resend").
   */
  addColleague: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        name: z.string().trim().min(1).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Demo sessions never send real email.
      const isDemoSession = ctx.clerkId?.startsWith("demo_") ?? false;
      const existing = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existing) {
        if (existing.orgId !== ctx.orgId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "That email already has a Sitefile account. Ask them to contact support to move organisations.",
          });
        }
        // Idempotent for same-org emails: callers chain a project
        // memberAdd off this result, and throwing here left re-added
        // colleagues stranded in the org with no project membership.
        const unclaimed = existing.clerkId.startsWith("invited:");
        const inviteEmail =
          unclaimed && !isDemoSession
            ? await sendColleagueInvitation(existing.email)
            : "skipped";
        return {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          alreadyExisted: true,
          inviteEmail,
        };
      }
      const [user] = await ctx.db
        .insert(users)
        .values({
          orgId: ctx.orgId,
          // Placeholder until they sign up — clerk_id is NOT NULL UNIQUE.
          clerkId: `invited:${randomUUID()}`,
          email: input.email,
          name: input.name || input.email,
          role: "member",
        })
        .returning();
      const inviteEmail = isDemoSession
        ? "skipped"
        : await sendColleagueInvitation(user.email);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        alreadyExisted: false,
        inviteEmail,
      };
    }),

  /**
   * The organisation's people, for the Account page team card. Admins only
   * — it exposes who is still unclaimed (never signed in) and who holds
   * admin, which is what a super user needs to run the account without us.
   */
  teamList: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.users.findMany({
      where: and(eq(users.orgId, ctx.orgId), isNull(users.deactivatedAt)),
      columns: { id: true, name: true, email: true, role: true, clerkId: true, createdAt: true },
      orderBy: (u, { asc }) => [asc(u.createdAt)],
    });
    const team = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      claimed: !u.clerkId.startsWith("invited:"),
      isYou: u.id === ctx.userId,
    }));
    return { team, adminCount: team.filter((u) => u.role === "admin").length };
  }),

  /**
   * Promote or demote a colleague between Admin and Member. The last admin
   * can never be demoted — an organisation with no admin has nobody left
   * who can add people, remove leavers or hand projects over.
   */
  setUserRole: adminProcedure
    .input(z.object({ userId: z.string().uuid(), role: z.enum(USER_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.query.users.findFirst({
        where: and(eq(users.id, input.userId), eq(users.orgId, ctx.orgId)),
        columns: { id: true, role: true, deactivatedAt: true, name: true },
      });
      if (!target || target.deactivatedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Colleague not found in your organisation." });
      }
      if (target.role === input.role) return { id: target.id, role: target.role };
      if (target.role === "admin" && input.role !== "admin") {
        await assertNotLastAdmin(ctx.db, ctx.orgId, target.id);
      }
      const [updated] = await ctx.db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, target.id))
        .returning({ id: users.id, role: users.role });
      return updated;
    }),

  /**
   * Remove a colleague from the organisation — the leaver case. Unclaimed
   * invitees are simply deleted. Anyone who has signed in is deactivated
   * instead: their row stays so every photo, diary day and approval they
   * made keeps its name, but they lose all project memberships, drop out
   * of approval chains, and can no longer reach the app. The last admin
   * cannot be removed, and you cannot remove yourself.
   */
  removeColleague: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't remove yourself. Make a colleague an admin and ask them to remove you.",
        });
      }
      const target = await ctx.db.query.users.findFirst({
        where: and(eq(users.id, input.userId), eq(users.orgId, ctx.orgId)),
        columns: { id: true, role: true, deactivatedAt: true, name: true, clerkId: true },
      });
      if (!target || target.deactivatedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Colleague not found in your organisation." });
      }
      if (target.role === "admin") {
        await assertNotLastAdmin(ctx.db, ctx.orgId, target.id);
      }

      const orgProjects = await ctx.db.query.projects.findMany({
        where: eq(projects.orgId, ctx.orgId),
        columns: { id: true, approvalChain: true },
      });
      const projectIds = orgProjects.map((p) => p.id);
      const memberships = projectIds.length
        ? await ctx.db.query.projectMembers.findMany({
            where: and(
              eq(projectMembers.userId, target.id),
              inArray(projectMembers.projectId, projectIds)
            ),
            columns: { id: true, projectId: true },
          })
        : [];

      const unclaimed = target.clerkId.startsWith("invited:");
      await ctx.db.transaction(async (tx) => {
        if (memberships.length) {
          await tx.delete(projectMembers).where(
            inArray(projectMembers.id, memberships.map((m) => m.id))
          );
        }
        for (const p of orgProjects) {
          const chain = parseApprovalChain(p.approvalChain);
          if (!chain?.steps.some((s) => s.userId === target.id)) continue;
          const steps = chain.steps.filter((s) => s.userId !== target.id);
          await tx
            .update(projects)
            .set({ approvalChain: steps.length ? { steps } : null, updatedAt: new Date() })
            .where(eq(projects.id, p.id));
        }
        if (unclaimed) {
          await tx.delete(users).where(eq(users.id, target.id));
        } else {
          await tx
            .update(users)
            .set({ deactivatedAt: new Date(), role: "member" })
            .where(eq(users.id, target.id));
        }
      });

      for (const m of memberships) {
        writeAuditLogAsync(ctx.db, {
          projectId: m.projectId,
          userId: ctx.userId,
          action: "remove_member",
          entityType: "project_member",
          entityId: m.id,
          metadata: { removedUserId: target.id, removedName: target.name, reason: "left_organisation" },
        });
      }

      return { id: target.id, deleted: unclaimed, deactivated: !unclaimed, projectsAffected: memberships.length };
    }),
});

/** Refuse to strip admin from the only remaining admin of an organisation. */
async function assertNotLastAdmin(
  db: Parameters<typeof writeAuditLogAsync>[0],
  orgId: string,
  exceptUserId: string
) {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.role, "admin"),
        isNull(users.deactivatedAt),
        ne(users.id, exceptUserId)
      )
    );
  if (!row || Number(row.n) === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "That would leave the organisation with no admin. Make someone else an admin first.",
    });
  }
}
