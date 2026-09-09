import { inngest } from "../client";
import { db } from "@/server/db";
import { reports } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { htmlToPdf } from "@/server/services/report-generator";
import {
  gatherInspectionReportData,
  renderInspectionReportHTML,
  type InspectionReportInput,
} from "@/server/services/inspection-report-generator";
import { uploadToStorage } from "@/server/services/storage";
import { decryptReportPassword } from "@/server/services/report-password-crypto";
import { encryptPdfBuffer } from "@/server/services/pdf-encrypt";

/**
 * Sibling of generate-report for report_kind = 'inspection'. Same
 * pipeline after the gatherer: HTML → PDF → optional AES-256 → R2 →
 * SHA-256 fingerprint → reports row. The progress function never sees
 * these events.
 */
export const generateInspectionReport = inngest.createFunction(
  {
    id: "generate-inspection-report",
    retries: 3,
    triggers: [{ event: "report/generate-inspection" }],
    onFailure: async ({ event }) => {
      const reportId = event.data.event.data?.reportId as string | undefined;
      if (reportId) {
        console.error(`[generate-inspection-report] All retries exhausted for report ${reportId}`);
        await db.update(reports).set({ status: "failed", passwordCiphertext: null }).where(eq(reports.id, reportId));
      }
    },
  },
  async ({ event, step }) => {
    const { reportId, ...input } = event.data as { reportId: string } & InspectionReportInput;

    const result = await step.run("generate-and-store", async () => {
      const existing = await db.query.reports.findFirst({
        where: eq(reports.id, reportId),
        columns: { reportNumber: true, revision: true, passwordCiphertext: true },
      });
      if (!existing) throw new Error(`Report ${reportId} not found — was it deleted?`);
      const data = await gatherInspectionReportData(db, {
        ...input,
        reportNumber: existing.reportNumber,
        revision: existing.revision,
      });
      const html = await renderInspectionReportHTML(data);
      let pdfBuffer = await htmlToPdf(html);
      if (existing.passwordCiphertext) {
        pdfBuffer = await encryptPdfBuffer(pdfBuffer, decryptReportPassword(existing.passwordCiphertext));
      }
      const key = `projects/${input.projectId}/reports/report-${existing.reportNumber}.pdf`;
      await uploadToStorage(key, pdfBuffer, "application/pdf");
      const { createHash } = await import("node:crypto");
      const pdfSha256 = createHash("sha256").update(pdfBuffer).digest("hex");
      return {
        storageKey: key,
        reportNumber: existing.reportNumber,
        pdfBytes: pdfBuffer.length,
        pdfSha256,
        stats: data.summary,
        meta: data.meta,
        stage: input.stage,
        kind: input.kind,
        visitId: input.visitId,
      };
    });

    await step.run("update-record", async () => {
      await db
        .update(reports)
        .set({
          status: "completed",
          pdfStorageKey: result.storageKey,
          reportData: {
            kind: "inspection",
            stage: result.stage,
            reportKind: result.kind,
            visitId: result.visitId,
            stats: result.stats,
            meta: result.meta,
            pdfSha256: result.pdfSha256,
          },
        })
        .where(eq(reports.id, reportId));
    });

    return { reportId, storageKey: result.storageKey, reportNumber: result.reportNumber, pdfBytes: result.pdfBytes };
  }
);
