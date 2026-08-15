import { z } from "zod";
import { eq, and, lt, desc, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  reports,
  evidence,
  reportShares,
  projects,
} from "@/server/db/schema";
import { randomBytes } from "crypto";
import { inngest } from "@/server/inngest/client";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { signReportToken } from "@/server/services/report-tokens";
import { encryptReportPassword } from "@/server/services/report-password-crypto";
import { REPORT_SECTION_KEYS } from "@/lib/report-sections";
import { draftNarrative } from "@/server/services/narrative-draft";
import {
  gatherReportData,
  renderReportHTML,
} from "@/server/services/report-generator";
import bcrypt from "bcryptjs";
import { addReportingPeriod } from "@/lib/reporting-cadence";

const sectionsSchema = z
  .object(
    Object.fromEntries(
      REPORT_SECTION_KEYS.map((key) => [key, z.boolean().optional()])
    ) as Record<(typeof REPORT_SECTION_KEYS)[number], z.ZodOptional<z.ZodBoolean>>
  )
  .strict();

export const reportRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      // Never send passwordHash (offline-crackable) or the reportData blob
      // to the client — the UI only needs "is there a password".
      const rows = await ctx.db.query.reports.findMany({
        where: eq(reports.projectId, input.projectId),
        orderBy: [desc(reports.reportNumber)],
        columns: {
          id: true,
          projectId: true,
          reportNumber: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          passwordHash: true,
          createdAt: true,
        },
      });
      return rows.map(({ passwordHash, ...row }) => ({
        ...row,
        hasPassword: passwordHash != null,
      }));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Same allowlist as `list`: passwordHash is offline-crackable and
      // reportData can carry legacy inline PDF bytes.
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.id),
        columns: {
          id: true,
          projectId: true,
          reportNumber: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          passwordHash: true,
          createdAt: true,
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      const { passwordHash, ...row } = report;
      return { ...row, hasPassword: passwordHash != null };
    }),

  generate: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
          password: z.string().optional(),
          sections: sectionsSchema.optional(),
          narrative: z.array(z.string().trim().min(1).max(4000)).max(12).optional(),
          keyIssues: z.array(z.string().trim().min(1).max(600)).max(20).optional(),
          keyRisks: z.array(z.string().trim().min(1).max(600)).max(20).optional(),
          coverEvidenceId: z.string().uuid().optional(),
          healthSafety: z
            .object({
              accidents: z.number().int().min(0).max(9999),
              nearMisses: z.number().int().min(0).max(9999),
              riddor: z.number().int().min(0).max(9999),
              toolboxTalks: z.number().int().min(0).max(9999),
              inductions: z.number().int().min(0).max(9999),
              note: z.string().trim().max(1000).optional(),
            })
            .optional(),
          signatures: z.array(z.object({
            role: z.enum(["contractor", "project_manager", "client"]),
            name: z.string().min(1),
            title: z.string().optional(),
            date: z.string().optional(),
            imageDataUrl: z.string().optional(),
          })).optional(),
        })
        .refine((d) => d.periodEnd >= d.periodStart, {
          message: "Period end must be on or after period start",
          path: ["periodEnd"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId, {
        requireActive: true,
      });

      const passwordHash = input.password
        ? await bcrypt.hash(input.password, 10)
        : null;
      // Wrapped plaintext for the Inngest worker to encrypt the PDF with;
      // cleared once generation completes or fails.
      const passwordCiphertext = input.password
        ? encryptReportPassword(input.password)
        : null;

      // Reap stale in-flight rows first. A row stuck in "generating"
      // (Inngest lost the event, onFailure itself failed, app never
      // synced) would otherwise block this project's reports forever via
      // the partial unique index. Real generations finish in a couple of
      // minutes; 15 minutes is decisively dead.
      const STALE_GENERATING_MS = 15 * 60 * 1000;
      await ctx.db
        .update(reports)
        .set({ status: "failed", passwordCiphertext: null })
        .where(
          and(
            eq(reports.projectId, input.projectId),
            eq(reports.status, "generating"),
            lt(reports.createdAt, new Date(Date.now() - STALE_GENERATING_MS))
          )
        );

      // Insert with retry: a partial unique index (status='generating')
      // ensures only one in-flight report per project, and a unique on
      // (project_id, report_number) prevents duplicate numbers under
      // concurrent calls. Both are 23505 — distinguish by constraint name.
      let report: typeof reports.$inferSelect | undefined;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const existing = await ctx.db.query.reports.findMany({
          where: eq(reports.projectId, input.projectId),
          columns: { reportNumber: true },
          orderBy: [desc(reports.reportNumber)],
          limit: 1,
        });
        const reportNumber = (existing[0]?.reportNumber ?? 0) + 1;

        try {
          [report] = await ctx.db
            .insert(reports)
            .values({
              projectId: input.projectId,
              generatedBy: ctx.userId,
              reportNumber,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              passwordHash,
              passwordCiphertext,
              status: "generating",
            })
            .returning();
          break;
        } catch (err) {
          const dbErr = err as { code?: string; constraint_name?: string; constraint?: string };
          if (dbErr.code !== "23505") throw err;
          const constraint = dbErr.constraint_name ?? dbErr.constraint ?? "";
          if (constraint.includes("one_generating_per_project")) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "A report is already being generated. Please wait for it to complete.",
            });
          }
          // Otherwise it's the (project, report_number) collision — retry.
          if (attempt === MAX_RETRIES - 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Could not allocate a report number. Please try again.",
              cause: err,
            });
          }
        }
      }
      if (!report) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Report insert failed after retries",
        });
      }
      const reportNumber = report.reportNumber;

      try {
        await inngest.send({
          name: "report/generate",
          data: {
            reportId: report.id,
            projectId: input.projectId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            generatedBy: ctx.userId,
            signatures: input.signatures,
            sections: input.sections,
            narrative: input.narrative,
            keyIssues: input.keyIssues,
            keyRisks: input.keyRisks,
            coverEvidenceId: input.coverEvidenceId,
            healthSafety: input.healthSafety,
          },
        });
      } catch (err) {
        console.error("[report.generate] Failed to queue report generation:", err);
        await ctx.db
          .update(reports)
          .set({ status: "failed", passwordCiphertext: null })
          .where(eq(reports.id, report.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not queue report generation. Please try again later.",
          cause: err,
        });
      }

      // Advance the report cadence: the next report is owed one frequency
      // step after whichever is later — the current due date or this
      // report's period end. Adopts a due date automatically for projects
      // that never set one.
      const proj = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { nextReportDue: true, reportingFrequency: true },
      });
      if (proj) {
        const base =
          proj.nextReportDue && proj.nextReportDue > input.periodEnd
            ? proj.nextReportDue
            : input.periodEnd;
        await ctx.db
          .update(projects)
          .set({ nextReportDue: addReportingPeriod(base, proj.reportingFrequency) })
          .where(eq(projects.id, input.projectId));
      }

      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "generate", entityType: "report", entityId: report.id, metadata: { reportNumber, periodStart: input.periodStart, periodEnd: input.periodEnd, sections: input.sections } });
      // Never return the full row: it carries passwordHash.
      return { id: report.id, reportNumber, status: report.status };
    }),

  // Renders the exact report HTML (same data-gather + templates the PDF
  // pipeline uses) for the review-before-generate step — the standard
  // form pattern: fill in → preview → edit → confirm → final document.
  previewHtml: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
          sections: sectionsSchema.optional(),
          narrative: z.array(z.string().trim().min(1).max(4000)).max(12).optional(),
          keyIssues: z.array(z.string().trim().min(1).max(600)).max(20).optional(),
          keyRisks: z.array(z.string().trim().min(1).max(600)).max(20).optional(),
          coverEvidenceId: z.string().uuid().optional(),
          healthSafety: z
            .object({
              accidents: z.number().int().min(0).max(9999),
              nearMisses: z.number().int().min(0).max(9999),
              riddor: z.number().int().min(0).max(9999),
              toolboxTalks: z.number().int().min(0).max(9999),
              inductions: z.number().int().min(0).max(9999),
              note: z.string().trim().max(1000).optional(),
            })
            .optional(),
          signatures: z.array(z.object({
            role: z.enum(["contractor", "project_manager", "client"]),
            name: z.string().min(1),
            title: z.string().optional(),
            date: z.string().optional(),
            imageDataUrl: z.string().optional(),
          })).optional(),
        })
        .refine((d) => d.periodEnd >= d.periodStart, {
          message: "Period end must be on or after period start",
          path: ["periodEnd"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const existing = await ctx.db.query.reports.findMany({
        where: eq(reports.projectId, input.projectId),
        columns: { reportNumber: true },
        orderBy: [desc(reports.reportNumber)],
        limit: 1,
      });
      const data = await gatherReportData(ctx.db, {
        projectId: input.projectId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        generatedBy: ctx.userId,
        reportNumber: (existing[0]?.reportNumber ?? 0) + 1,
        sections: input.sections,
        narrative: input.narrative,
        keyIssues: input.keyIssues,
        keyRisks: input.keyRisks,
        coverEvidenceId: input.coverEvidenceId,
        healthSafety: input.healthSafety,
        signatures: input.signatures,
      });
      const html = await renderReportHTML(data);
      // keyRisks returned so the preview panel can seed its editor with
      // the derived list on first render.
      return { html, keyRisks: data.summaryStats.keyRisks };
    }),

  // Counts how much evidence the chosen period would actually pull in,
  // using the same rule as the generator (capture date, falling back to
  // upload date when EXIF gave none) — so the dialog can warn BEFORE a
  // contractor generates a report with an empty gallery.
  evidencePreview: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
        })
        .refine((d) => d.periodEnd >= d.periodStart, {
          message: "Period end must be on or after period start",
          path: ["periodEnd"],
        })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const rows = await ctx.db
        .select({
          effectiveAt: sql<string>`coalesce(${evidence.capturedAt}, ${evidence.uploadedAt})`,
        })
        .from(evidence)
        .where(
          and(
            eq(evidence.projectId, input.projectId),
            isNull(evidence.deletedAt)
          )
        );
      const periodStart = new Date(input.periodStart + "T00:00:00Z");
      const periodEnd = new Date(input.periodEnd + "T23:59:59.999Z");
      let inPeriod = 0;
      let earliest: Date | null = null;
      let latest: Date | null = null;
      for (const row of rows) {
        const at = new Date(row.effectiveAt);
        if (at >= periodStart && at <= periodEnd) inPeriod++;
        if (!earliest || at < earliest) earliest = at;
        if (!latest || at > latest) latest = at;
      }
      const toDateString = (d: Date | null) =>
        d ? d.toISOString().split("T")[0] : null;
      return {
        total: rows.length,
        inPeriod,
        earliest: toDateString(earliest),
        latest: toDateString(latest),
      };
    }),

  // Programme-derived seeds for the Key Issues list — the same risk
  // strings the deterministic engine puts in the Executive Summary, for
  // the PM to edit and extend with commercial matters.
  keyIssueSuggestions: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
        })
        .refine((d) => d.periodEnd >= d.periodStart, {
          message: "Period end must be on or after period start",
          path: ["periodEnd"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const data = await gatherReportData(ctx.db, {
        projectId: input.projectId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        generatedBy: ctx.userId,
        reportNumber: 0,
        includeWeather: false,
        sections: { gallery: false, beforeAfter: false, photoMap: false },
      });
      return { suggestions: data.summaryStats.keyRisks };
    }),

  draftNarrative: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
        })
        .refine((d) => d.periodEnd >= d.periodStart, {
          message: "Period end must be on or after period start",
          path: ["periodEnd"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const result = await draftNarrative(ctx.db, {
        projectId: input.projectId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        generatedBy: ctx.userId,
      });
      writeAuditLogAsync(ctx.db, {
        projectId: input.projectId,
        userId: ctx.userId,
        action: "draft_narrative",
        entityType: "project",
        entityId: input.projectId,
        metadata: { periodStart: input.periodStart, periodEnd: input.periodEnd },
      });
      return result;
    }),


  // ── Send & receipt ────────────────────────────────────────────────────
  // A share is a tokenised public link to a completed report; the
  // client's opens/downloads become a delivery receipt. Passwords stay
  // out-of-band — the PDF itself is encrypted when one was set.

  createShare: protectedProcedure
    .input(
      z.object({
        reportId: z.string().uuid(),
        recipientLabel: z.string().trim().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.reportId),
        columns: { id: true, projectId: true, status: true, reportNumber: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      if (report.status !== "completed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Report is not ready to share" });
      }
      const token = randomBytes(24).toString("base64url");
      const [share] = await ctx.db
        .insert(reportShares)
        .values({
          reportId: report.id,
          token,
          recipientLabel: input.recipientLabel ?? null,
          createdBy: ctx.userId,
        })
        .returning();
      writeAuditLogAsync(ctx.db, {
        projectId: report.projectId,
        userId: ctx.userId,
        action: "share",
        entityType: "report",
        entityId: report.id,
        metadata: { reportNumber: report.reportNumber, shareId: share.id },
      });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.sitefile.app";
      return { shareId: share.id, url: `${appUrl.replace(/\/$/, "")}/r/${token}` };
    }),

  shareStatus: protectedProcedure
    .input(z.object({ reportId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.reportId),
        columns: { id: true, projectId: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      const shares = await ctx.db.query.reportShares.findMany({
        where: eq(reportShares.reportId, report.id),
        orderBy: [desc(reportShares.createdAt)],
        with: { events: true },
      });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.sitefile.app";
      return shares.map((s) => {
        const firstEvent = (kind: string) =>
          s.events
            .filter((e) => e.event === kind)
            .map((e) => e.createdAt)
            .sort((a, b) => (a && b ? a.getTime() - b.getTime() : 0))[0] ?? null;
        return {
          id: s.id,
          url: `${appUrl.replace(/\/$/, "")}/r/${s.token}`,
          recipientLabel: s.recipientLabel,
          createdAt: s.createdAt,
          revokedAt: s.revokedAt,
          openedAt: firstEvent("opened"),
          downloadedAt: firstEvent("downloaded"),
          openCount: s.events.filter((e) => e.event === "opened").length,
        };
      });
    }),

  revokeShare: protectedProcedure
    .input(z.object({ shareId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const share = await ctx.db.query.reportShares.findFirst({
        where: eq(reportShares.id, input.shareId),
        with: { report: { columns: { projectId: true, id: true } } },
      });
      if (!share) throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      await assertProjectAccess(ctx.db, share.report.projectId, ctx.orgId, ctx.userId);
      await ctx.db
        .update(reportShares)
        .set({ revokedAt: new Date() })
        .where(eq(reportShares.id, input.shareId));
      writeAuditLogAsync(ctx.db, {
        projectId: share.report.projectId,
        userId: ctx.userId,
        action: "revoke_share",
        entityType: "report",
        entityId: share.report.id,
        metadata: { shareId: share.id },
      });
      return { ok: true };
    }),

  download: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        password: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.id),
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);

      if (report.status !== "completed" || !report.pdfStorageKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Report is not ready for download" });
      }

      if (report.passwordHash) {
        if (!input.password) throw new TRPCError({ code: "UNAUTHORIZED", message: "Password required" });
        const match = await bcrypt.compare(input.password, report.passwordHash);
        if (!match) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
      }

      // Mint a short-lived (60s) HMAC-signed token bound to this user + this
      // report. The PDF route verifies the token instead of re-checking the
      // password, so the password never leaves this mutation. Token in URL is
      // safe because it expires before referrer/history leakage matters.
      const token = signReportToken(report.id, ctx.userId);
      return {
        url: `/api/reports/${report.id}/pdf?t=${encodeURIComponent(token)}`,
        filename: `report-${report.reportNumber}.pdf`,
      };
    }),
});
