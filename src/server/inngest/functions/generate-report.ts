import { inngest } from "../client";
import { db } from "@/server/db";
import { reports } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  gatherReportData,
  renderReportHTML,
  htmlToPdf,
} from "@/server/services/report-generator";
import { uploadToStorage } from "@/server/services/storage";

export const generateReport = inngest.createFunction(
  {
    id: "generate-report",
    retries: 3,
    triggers: [{ event: "report/generate" }],
    onFailure: async ({ event }) => {
      // Mark report as failed after all retries exhausted
      const reportId = event.data.event.data?.reportId as string | undefined;
      if (reportId) {
        console.error(`[generate-report] All retries exhausted for report ${reportId}`);
        await db
          .update(reports)
          .set({ status: "failed" })
          .where(eq(reports.id, reportId));
      }
    },
  },
  async ({ event, step }) => {
    const { reportId, projectId, periodStart, periodEnd, generatedBy, signatures } =
      event.data as {
        reportId: string;
        projectId: string;
        periodStart: string;
        periodEnd: string;
        generatedBy: string;
        signatures?: { role: "contractor" | "project_manager" | "client"; name: string; title?: string; date?: string; imageDataUrl?: string }[];
      };

    // Single heavy step: gather → render → PDF → upload. Deliberately NOT
    // split into separate steps — step outputs are persisted by Inngest and
    // capped (~4MB); report data with image URLs is small, but PDFs and any
    // inlined image bytes are not. Only small JSON (key + stats) may cross a
    // step boundary. Images enter the HTML as short-lived presigned URLs
    // that Puppeteer fetches during render, so nothing large is ever
    // returned from this step.
    const result = await step.run("generate-and-store", async () => {
      const existing = await db.query.reports.findFirst({
        where: eq(reports.id, reportId),
        columns: { reportNumber: true },
      });
      if (!existing) {
        throw new Error(`Report ${reportId} not found — was it deleted?`);
      }
      const reportData = await gatherReportData(db, {
        projectId,
        periodStart,
        periodEnd,
        generatedBy,
        signatures,
        reportNumber: existing.reportNumber,
      });
      const html = await renderReportHTML(reportData);
      const pdfBuffer = await htmlToPdf(html);

      // R2 in prod, .local-uploads/ in dev. Vercel's /tmp is
      // per-invocation, so filesystem writes are only viable for local
      // dev — the PDF handler fetches via fetchFromStorage which mirrors
      // the same R2 vs local decision.
      const key = `projects/${projectId}/reports/report-${existing.reportNumber}.pdf`;
      await uploadToStorage(key, pdfBuffer, "application/pdf");

      return {
        storageKey: key,
        reportNumber: existing.reportNumber,
        pdfBytes: pdfBuffer.length,
        stats: reportData.summaryStats,
        meta: reportData.meta,
      };
    });

    // Separate step so a transient DB blip doesn't re-run the whole render.
    await step.run("update-record", async () => {
      await db
        .update(reports)
        .set({
          status: "completed",
          pdfStorageKey: result.storageKey,
          reportData: {
            stats: result.stats,
            meta: result.meta,
          },
        })
        .where(eq(reports.id, reportId));
    });

    return {
      reportId,
      storageKey: result.storageKey,
      reportNumber: result.reportNumber,
      pdfBytes: result.pdfBytes,
    };
  }
);
