import { z } from "zod";
import { eq, and, lt, desc, isNull, sql, inArray, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../index";
import {
  reports,
  evidence,
  reportShares,
  reportDrafts,
  projects,
  projectMembers,
  users,
  diaryEntries,
} from "@/server/db/schema";
import {
  parseApprovalChain,
  parseApprovalState,
  currentApprovalStep,
  isApprovalComplete,
  type ApprovalState,
} from "@/lib/report-approval";
import { MEMBER_ROLE_LABELS } from "@/lib/member-roles";
import type { ProjectMemberRole } from "@/server/db/enums";
import { randomBytes } from "crypto";
import { inngest } from "@/server/inngest/client";
import { assertProjectAccess } from "../helpers";
import { writeAuditLogAsync } from "@/server/services/audit";
import { signReportToken } from "@/server/services/report-tokens";
import {
  encryptReportPassword,
  decryptReportPassword,
} from "@/server/services/report-password-crypto";
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
          approvalState: true,
          createdAt: true,
        },
      });
      return rows.map(({ passwordHash, approvalState, ...row }) => {
        const state = parseApprovalState(approvalState);
        return {
          ...row,
          hasPassword: passwordHash != null,
          awaitingApproval: state ? !isApprovalComplete(state) : false,
          nextApprover: state ? (currentApprovalStep(state)?.name ?? null) : null,
        };
      });
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
          reportData: true,
          approvalState: true,
          createdAt: true,
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      const { passwordHash, reportData, approvalState, ...row } = report;
      // Only the document fingerprint escapes reportData — the blob can
      // carry legacy inline PDF bytes.
      const pdfSha256 =
        (reportData as { pdfSha256?: string } | null)?.pdfSha256 ?? null;
      return {
        ...row,
        hasPassword: passwordHash != null,
        pdfSha256,
        approvalState: parseApprovalState(approvalState),
      };
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

      // Snapshot the project's approval chain (if any) onto this report so
      // later config edits never retro-change a live report's sign-off.
      const projectRow = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
        columns: { approvalChain: true, firstReportNumber: true },
      });
      const chain = parseApprovalChain(projectRow?.approvalChain);
      let approvalState: ApprovalState | null = null;
      if (chain) {
        const ids = chain.steps.map((s) => s.userId);
        const [stepUsers, stepMembers] = await Promise.all([
          ctx.db.query.users.findMany({
            where: inArray(users.id, ids),
            columns: { id: true, name: true },
          }),
          ctx.db.query.projectMembers.findMany({
            where: and(
              eq(projectMembers.projectId, input.projectId),
              inArray(projectMembers.userId, ids)
            ),
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
            roleLabel:
              MEMBER_ROLE_LABELS[roleById.get(s.userId) as ProjectMemberRole] ??
              null,
            approvedAt: null,
            approvedName: null,
          })),
          completedAt: null,
        };
      }

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
        // First-ever report starts at the project's configured number —
        // contractors joining mid-contract may already be at №5 on paper.
        const reportNumber = existing[0]
          ? existing[0].reportNumber + 1
          : (projectRow?.firstReportNumber ?? 1);

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
              approvalState,
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

      // Structured approval event: binds each provided sign-off to the
      // authenticated account, the report row and a timestamp — the
      // record behind the PDF's "Electronically Approved" badges.
      if (input.signatures?.length) {
        writeAuditLogAsync(ctx.db, {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "approve",
          entityType: "report",
          entityId: report.id,
          metadata: {
            reportNumber,
            approvals: input.signatures.map((s) => ({
              role: s.role,
              name: s.name,
              title: s.title ?? null,
              method: s.imageDataUrl ? "signature-image" : "typed-name",
            })),
          },
        });
      }
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
  /** Diary-derived figures the generate dialog can offer as H&S prefill.
   * Fetched live, never persisted — the diary is the source of truth. */
  diaryAggregates: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const entries = await ctx.db.query.diaryEntries.findMany({
        where: and(
          eq(diaryEntries.projectId, input.projectId),
          eq(diaryEntries.status, "locked"),
          gte(diaryEntries.entryDate, input.periodStart),
          lte(diaryEntries.entryDate, input.periodEnd)
        ),
        columns: {
          entryDate: true,
          toolboxTalk: true,
          incidentsCount: true,
          inspectionsCount: true,
        },
      });
      return {
        daysWithRecord: new Set(entries.map((e) => e.entryDate)).size,
        toolboxTalks: entries.filter((e) => e.toolboxTalk).length,
        incidents: entries.reduce((s, e) => s + e.incidentsCount, 0),
        inspections: entries.reduce((s, e) => s + e.inspectionsCount, 0),
      };
    }),

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


  // ── The standing draft ────────────────────────────────────────────────
  // Pre-generate state (approved narrative, signed-off issues, signature,
  // section toggles) persisted per project so desk approvals show on the
  // phone home. One live draft per project, keyed to its period.

  getDraft: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const row = await ctx.db.query.reportDrafts.findFirst({
        where: eq(reportDrafts.projectId, input.projectId),
      });
      if (!row) return null;
      return {
        periodStart: row.periodStart,
        payload: row.payload as Record<string, unknown>,
        updatedAt: row.updatedAt,
      };
    }),

  saveDraft: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        periodStart: z.string().min(1),
        patch: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAccess(ctx.db, input.projectId, ctx.orgId, ctx.userId);
      const existing = await ctx.db.query.reportDrafts.findFirst({
        where: eq(reportDrafts.projectId, input.projectId),
      });
      // Same period: merge-patch. New/stale period: the patch becomes the
      // whole payload — the old period's approvals must not leak forward.
      const payload =
        existing && existing.periodStart === input.periodStart
          ? { ...(existing.payload as Record<string, unknown>), ...input.patch }
          : input.patch;
      await ctx.db
        .insert(reportDrafts)
        .values({
          projectId: input.projectId,
          periodStart: input.periodStart,
          payload,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: reportDrafts.projectId,
          set: { periodStart: input.periodStart, payload, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  // ── Send & receipt ────────────────────────────────────────────────────
  // A share is a tokenised public link to a completed report; the
  // client's opens/downloads become a delivery receipt. Passwords stay
  // out-of-band — the PDF itself is encrypted when one was set.

  // Tiered sign-off: the current step's named approver (or an org admin
  // as escape hatch) approves in order; the report becomes sendable only
  // when every step is approved.
  approve: protectedProcedure
    .input(
      z.object({
        reportId: z.string().uuid(),
        approvedName: z.string().trim().min(1).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.reportId),
        columns: { id: true, projectId: true, status: true, reportNumber: true, approvalState: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      if (report.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The report is still generating — approve it once it's ready.",
        });
      }
      const state = parseApprovalState(report.approvalState);
      if (!state) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This report has no approval chain." });
      }
      const step = currentApprovalStep(state);
      if (!step) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This report is already fully approved." });
      }
      const isOrgAdmin = ctx.dbUser?.role === "admin";
      if (step.userId !== ctx.userId && !isOrgAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This step is assigned to ${step.name}.`,
        });
      }
      const now = new Date().toISOString();
      const nextSteps = state.steps.map((s) =>
        s === step
          ? { ...s, approvedAt: now, approvedName: input.approvedName }
          : s
      );
      const completed = nextSteps.every((s) => s.approvedAt);
      const nextState = {
        steps: nextSteps,
        completedAt: completed ? now : null,
      };
      await ctx.db
        .update(reports)
        .set({ approvalState: nextState })
        .where(eq(reports.id, report.id));
      writeAuditLogAsync(ctx.db, {
        projectId: report.projectId,
        userId: ctx.userId,
        action: "approve",
        entityType: "report",
        entityId: report.id,
        metadata: {
          reportNumber: report.reportNumber,
          step: step.label,
          stepUserId: step.userId,
          approvedName: input.approvedName,
          onBehalf: step.userId !== ctx.userId ? "org_admin" : undefined,
          chainComplete: completed,
        },
      });
      return { approvalState: nextState };
    }),

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
        columns: { id: true, projectId: true, status: true, reportNumber: true, approvalState: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      if (report.status !== "completed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Report is not ready to share" });
      }
      const shareChainState = parseApprovalState(report.approvalState);
      if (!isApprovalComplete(shareChainState)) {
        const next = shareChainState ? currentApprovalStep(shareChainState) : null;
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `This report is awaiting sign-off${next ? ` from ${next.name}` : ""} before it can be sent.`,
        });
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

  // Reveals a completed report's auto/typed password to the PM on the
  // Send screen. Audit-logged; the ciphertext is retained at generation
  // precisely to make this possible (documented trade-off).
  revealPassword: protectedProcedure
    .input(z.object({ reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db.query.reports.findFirst({
        where: eq(reports.id, input.reportId),
        columns: { id: true, projectId: true, status: true, passwordCiphertext: true, reportNumber: true, approvalState: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      await assertProjectAccess(ctx.db, report.projectId, ctx.orgId, ctx.userId);
      if (report.status !== "completed" || !report.passwordCiphertext) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No stored password for this report.",
        });
      }
      if (!isApprovalComplete(parseApprovalState(report.approvalState))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This report is awaiting sign-off — the password unlocks once approvals are complete.",
        });
      }
      const password = decryptReportPassword(report.passwordCiphertext);
      writeAuditLogAsync(ctx.db, {
        projectId: report.projectId,
        userId: ctx.userId,
        action: "reveal_password",
        entityType: "report",
        entityId: report.id,
        metadata: { reportNumber: report.reportNumber },
      });
      return { password };
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
