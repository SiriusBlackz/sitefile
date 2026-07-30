import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../index";
import { organisations } from "@/server/db/schema";
import { getPublicUrl, uploadToStorage } from "@/server/services/storage";

/** Logos arrive as base64 (small files, avoids R2 CORS entirely). */
const MAX_LOGO_BASE64 = 2_800_000; // ~2MB binary

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

async function processLogo(imageBase64: string): Promise<Buffer> {
  const buf = Buffer.from(imageBase64, "base64");
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
});
