import { z } from "zod";
import { eq, and, lt, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import { reports } from "@/server/db/schema";
import { inngest } from "@/server/inngest/client";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { signReportToken } from "@/server/services/report-tokens";
import bcrypt from "bcryptjs";

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
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.id),
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      return report;
    }),

  generate: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string().uuid(),
          periodStart: z.string().min(1),
          periodEnd: z.string().min(1),
          password: z.string().optional(),
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

      // Reap stale in-flight rows first. A row stuck in "generating"
      // (Inngest lost the event, onFailure itself failed, app never
      // synced) would otherwise block this project's reports forever via
      // the partial unique index. Real generations finish in a couple of
      // minutes; 15 minutes is decisively dead.
      const STALE_GENERATING_MS = 15 * 60 * 1000;
      await ctx.db
        .update(reports)
        .set({ status: "failed" })
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
          },
        });
      } catch (err) {
        console.error("[report.generate] Failed to queue report generation:", err);
        await ctx.db
          .update(reports)
          .set({ status: "failed" })
          .where(eq(reports.id, report.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not queue report generation. Please try again later.",
          cause: err,
        });
      }

      writeAuditLogAsync(ctx.db, { projectId: input.projectId, userId: ctx.userId, action: "generate", entityType: "report", entityId: report.id, metadata: { reportNumber, periodStart: input.periodStart, periodEnd: input.periodEnd } });
      return report;
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
