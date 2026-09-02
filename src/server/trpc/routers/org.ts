import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { organisations, users } from "@/server/db/schema";
import { getPublicUrl, uploadToStorage } from "@/server/services/storage";

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
   * Pre-seed a colleague into this organisation by email. No invite email
   * is sent — the admin tells them to sign up at /sign-up with this
   * address, and the email-first lookup in ensureUser / the Clerk webhook
   * claims this row (fills in the real clerkId) instead of provisioning a
   * fresh empty org. Post-pilot this is replaced by Clerk Invitations.
   */
  addColleague: adminProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        name: z.string().trim().min(1).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
        return {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          alreadyExisted: true,
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
      return { id: user.id, email: user.email, name: user.name, alreadyExisted: false };
    }),
});
