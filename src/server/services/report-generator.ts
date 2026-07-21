import { createElement } from "react";
import { eq, and, or, gte, lte, asc, desc, isNull, sql } from "drizzle-orm";
import {
  projects,
  tasks,
  evidence,
  gpsZones,
  auditLog,
  reports,
} from "@/server/db/schema";
import { getReadUrl } from "./storage";
import { generateBeforeAfterPairs } from "./before-after";
import type { db as dbType } from "@/server/db";

// Template imports
import { ReportShell, type ReportMeta } from "@/components/reports/templates/report-shell";
import { CoverPage } from "@/components/reports/templates/cover-page";
import {
  ExecutiveSummary,
  type SummaryStats,
} from "@/components/reports/templates/executive-summary";
import {
  ProgrammeTimeline,
  timelinePageCount,
  type TimelineTask,
} from "@/components/reports/templates/programme-timeline";
import {
  EvidenceGalleryPage,
  paginateGallery,
  type GalleryTask,
} from "@/components/reports/templates/evidence-gallery";
import { BeforeAfterPage } from "@/components/reports/templates/before-after";
import {
  VerificationPage,
  verificationPageCount,
  type VerificationStats,
} from "@/components/reports/templates/verification";
import { SignOffPage } from "@/components/reports/templates/sign-off";
import { TableOfContents, type TocEntry } from "@/components/reports/templates/table-of-contents";

type DB = typeof dbType;

export interface ReportSignature {
  role: "contractor" | "project_manager" | "client";
  name: string;
  title?: string;
  date?: string;
  imageDataUrl?: string;
}

export interface GenerateReportInput {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  /**
   * Known report number (from the already-inserted reports row). If omitted
   * we fall back to computing max+1, but that races against the inserting
   * tRPC mutation and picks a higher number — pass this from the Inngest
   * function via event.data.reportId → reports row lookup.
   */
  reportNumber?: number;
  signatures?: ReportSignature[];
}

/**
 * Gather all data needed for the report.
 */
export async function gatherReportData(db: DB, input: GenerateReportInput) {
  // 1. Project + org
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
    with: { organisation: true },
  });
  if (!project) throw new Error("Project not found");

  const org = project.organisation;

  // 2. Resolve the report number — prefer the value passed in from the
  // caller (which reads the already-inserted row). Only fall back to
  // max+1 for compatibility, and warn about the race.
  let reportNumber: number;
  if (input.reportNumber !== undefined) {
    reportNumber = input.reportNumber;
  } else {
    console.warn(
      "[gatherReportData] No reportNumber passed; computing max+1 (may race with inserting mutation)"
    );
    const existingReports = await db.query.reports.findMany({
      where: eq(reports.projectId, input.projectId),
      columns: { reportNumber: true },
      orderBy: [desc(reports.reportNumber)],
      limit: 1,
    });
    reportNumber = (existingReports[0]?.reportNumber ?? 0) + 1;
  }

  // 3. All tasks for project
  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, input.projectId),
    orderBy: [asc(tasks.sortOrder)],
  });

  // 4. Evidence for the reporting period (filtered at DB level)
  const periodStart = new Date(input.periodStart + "T00:00:00Z");
  const periodEnd = new Date(input.periodEnd + "T23:59:59.999Z");

  // Evidence counts as "in period" by capture date, falling back to upload
  // date when EXIF gave no capture timestamp — otherwise undated photos
  // silently vanish from an evidence report.
  const periodEvidence = await db.query.evidence.findMany({
    where: and(
      eq(evidence.projectId, input.projectId),
      isNull(evidence.deletedAt),
      or(
        and(
          gte(evidence.capturedAt, periodStart),
          lte(evidence.capturedAt, periodEnd)
        ),
        and(
          isNull(evidence.capturedAt),
          gte(evidence.uploadedAt, periodStart),
          lte(evidence.uploadedAt, periodEnd)
        )
      )
    ),
    orderBy: [desc(sql`coalesce(${evidence.capturedAt}, ${evidence.uploadedAt})`)],
    with: {
      links: {
        with: {
          task: { columns: { id: true, name: true } },
        },
      },
      uploader: { columns: { name: true, role: true } },
    },
  });

  // Also load all evidence for summary stats (lightweight — no links needed)
  const allEvidence = await db.query.evidence.findMany({
    where: and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)),
    columns: {
      id: true,
      type: true,
      capturedAt: true,
      uploadedAt: true,
      latitude: true,
      longitude: true,
      exifData: true,
      storageKey: true,
    },
  });

  // 5. Build report meta
  const meta: ReportMeta = {
    organisationName: org.name,
    logoUrl: org.logoUrl,
    projectName: project.name,
    projectReference: project.reference,
    clientName: project.clientName,
    contractType: project.contractType,
    reportNumber,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: new Date().toISOString(),
  };

  // 6. Executive summary stats
  const completedTasks = allTasks.filter((t) => t.status === "completed").length;
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").length;
  const delayedTasks = allTasks.filter((t) => t.status === "delayed").length;
  const notStartedTasks = allTasks.filter((t) => t.status === "not_started").length;

  const avgActual =
    allTasks.length > 0
      ? Math.round(
          allTasks.reduce((sum, t) => sum + (t.progressPct ?? 0), 0) / allTasks.length
        )
      : 0;

  // Estimate planned progress from dates, as of the end of the reporting
  // period (clamped to now) — so regenerating a period later reproduces
  // the same planned/variance numbers.
  const now = new Date(Math.min(Date.now(), periodEnd.getTime()));
  let avgPlanned = 0;
  if (allTasks.length > 0) {
    let totalPlanned = 0;
    let counted = 0;
    for (const t of allTasks) {
      if (t.plannedStart && t.plannedEnd) {
        const start = new Date(t.plannedStart + "T00:00:00").getTime();
        const end = new Date(t.plannedEnd + "T00:00:00").getTime();
        const duration = end - start;
        if (duration > 0) {
          const elapsed = Math.min(now.getTime() - start, duration);
          totalPlanned += Math.max(0, Math.round((elapsed / duration) * 100));
          counted++;
        }
      }
    }
    avgPlanned = counted > 0 ? Math.round(totalPlanned / counted) : avgActual;
  }

  // Key risks: delayed tasks
  const keyRisks: string[] = [];
  const delayedTaskList = allTasks.filter((t) => t.status === "delayed");
  for (const t of delayedTaskList.slice(0, 5)) {
    keyRisks.push(`Task "${t.name}" is delayed`);
  }
  if (avgActual < avgPlanned - 10) {
    keyRisks.push(
      `Overall progress is ${avgPlanned - avgActual}% behind planned schedule`
    );
  }

  const summaryStats: SummaryStats = {
    totalTasks: allTasks.length,
    completedTasks,
    inProgressTasks,
    delayedTasks,
    notStartedTasks,
    averagePlannedProgress: Math.min(avgPlanned, 100),
    averageActualProgress: avgActual,
    variance: avgActual - Math.min(avgPlanned, 100),
    totalEvidence: allEvidence.length,
    evidenceThisPeriod: periodEvidence.length,
    keyRisks,
  };

  // 7. Timeline tasks
  // Build tree for depth
  const parentMap = new Map<string | null, typeof allTasks>();
  for (const t of allTasks) {
    const key = t.parentTaskId ?? null;
    const list = parentMap.get(key) ?? [];
    list.push(t);
    parentMap.set(key, list);
  }

  const flatWithDepth: (typeof allTasks[0] & { depth: number })[] = [];
  function walk(parentId: string | null, depth: number) {
    const children = parentMap.get(parentId) ?? [];
    for (const c of children) {
      flatWithDepth.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);

  const timelineTasks: TimelineTask[] = flatWithDepth.map((t) => {
    // Find evidence dates for this task (from period evidence which has links)
    const evidenceDates: string[] = [];
    for (const ev of periodEvidence) {
      if (ev.capturedAt && ev.links.some((l) => l.task.id === t.id)) {
        evidenceDates.push(ev.capturedAt.toISOString().split("T")[0]);
      }
    }

    return {
      id: t.id,
      name: t.name,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      progressPct: t.progressPct ?? 0,
      status: t.status ?? "not_started",
      depth: t.depth,
      evidenceDates: [...new Set(evidenceDates)].sort(),
    };
  });

  // 8. Evidence gallery (grouped by task). Images go into the HTML as
  // short-lived presigned URLs, not base64 — Puppeteer fetches them
  // during render. Cache per key: one photo linked to N tasks is signed once.
  const galleryTasks: GalleryTask[] = [];
  const taskEvidenceMap = new Map<string, GalleryTask>();
  const readUrlCache = new Map<string, string | null>();
  async function cachedReadUrl(key: string): Promise<string | null> {
    if (!readUrlCache.has(key)) {
      readUrlCache.set(key, await getReadUrl(key));
    }
    return readUrlCache.get(key) ?? null;
  }

  for (const ev of periodEvidence) {
    for (const link of ev.links) {
      let gt = taskEvidenceMap.get(link.task.id);
      if (!gt) {
        gt = { id: link.task.id, name: link.task.name, evidence: [] };
        taskEvidenceMap.set(link.task.id, gt);
      }
      const readUrl = await cachedReadUrl(ev.thumbnailKey ?? ev.storageKey);
      gt.evidence.push({
        id: ev.id,
        publicUrl: readUrl ?? "",
        originalFilename: ev.originalFilename,
        capturedAt: ev.capturedAt?.toISOString() ?? null,
        latitude: ev.latitude,
        longitude: ev.longitude,
        uploaderName: ev.uploader?.name ?? null,
        uploaderRole: ev.uploader?.role ?? null,
        note: ev.note,
      });
    }
  }
  for (const gt of taskEvidenceMap.values()) {
    galleryTasks.push(gt);
  }
  galleryTasks.sort((a, b) => a.name.localeCompare(b.name));

  // 9. Before/after pairs
  const beforeAfterPairs = await generateBeforeAfterPairs(
    db,
    input.projectId,
    input.periodStart,
    input.periodEnd
  );

  // 10. Verification stats (scoped to reporting period)
  const withExif = periodEvidence.filter((e) => e.exifData != null).length;
  const withGps = periodEvidence.filter(
    (e) => e.latitude != null && e.longitude != null
  ).length;

  // Count GPS evidence that falls within a zone
  const zones = await db.query.gpsZones.findMany({
    where: eq(gpsZones.projectId, input.projectId),
  });
  const { pointInPolygon: pip } = await import("@/lib/geo");
  let gpsVerifiedByZone = 0;
  for (const ev of periodEvidence) {
    if (ev.latitude == null || ev.longitude == null) continue;
    for (const zone of zones) {
      const polygon = zone.polygon as { coordinates: number[][][] };
      if (pip([ev.longitude, ev.latitude], polygon.coordinates)) {
        gpsVerifiedByZone++;
        break;
      }
    }
  }

  // Upload delay analysis
  let totalDelay = 0;
  let maxDelay = 0;
  let delayCount = 0;
  for (const ev of periodEvidence) {
    if (ev.capturedAt && ev.uploadedAt) {
      const delay = ev.uploadedAt.getTime() - ev.capturedAt.getTime();
      if (delay >= 0) {
        totalDelay += delay;
        maxDelay = Math.max(maxDelay, delay);
        delayCount++;
      }
    }
  }
  const avgDelay = delayCount > 0 ? totalDelay / delayCount : 0;

  // Evidence by type
  const typeMap = new Map<string, number>();
  for (const ev of periodEvidence) {
    const t = ev.type ?? "photo";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
  }

  // 11. Audit trail for this period
  const auditEntries = await db.query.auditLog.findMany({
    where: and(
      eq(auditLog.projectId, input.projectId),
      gte(auditLog.createdAt, periodStart),
      lte(auditLog.createdAt, periodEnd)
    ),
    orderBy: [desc(auditLog.createdAt)],
    limit: 20,
    with: {
      user: { columns: { name: true } },
    },
  });

  const verificationStats: VerificationStats = {
    totalEvidence: periodEvidence.length,
    withExifData: withExif,
    withGpsCoords: withGps,
    gpsVerifiedByZone,
    zonesConfigured: zones.length,
    averageUploadDelay: formatDuration(avgDelay),
    maxUploadDelay: formatDuration(maxDelay),
    evidenceByType: Array.from(typeMap.entries()).map(([type, count]) => ({
      type,
      count,
    })),
    auditTrailSummary: auditEntries.map((e) => ({
      date: e.createdAt?.toISOString() ?? "",
      user: e.user?.name ?? "System",
      action: e.action,
      entity: e.entityType,
    })),
  };

  return {
    meta,
    reportNumber,
    summaryStats,
    timelineTasks,
    galleryTasks,
    beforeAfterPairs,
    verificationStats,
    signatures: input.signatures ?? [],
  };
}

/**
 * Render report data into a full HTML string.
 */
export async function renderReportHTML(data: Awaited<ReturnType<typeof gatherReportData>>): Promise<string> {
  // Dynamic import to avoid Turbopack's react-dom/server static analysis block
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { meta, summaryStats, timelineTasks, galleryTasks, beforeAfterPairs, verificationStats, signatures } =
    data;

  // Page numbers are computed in ONE pass using the same pagination
  // helpers the templates render with — footers and TOC can't disagree.
  // Page 1 = cover, page 2 = TOC, then content; empty sections skipped.
  const hasGallery = galleryTasks.length > 0;
  const hasBeforeAfter = beforeAfterPairs.length > 0;

  const summaryPage = 3;
  const timelineStart = 4;
  const timelinePages = timelinePageCount(timelineTasks.length);
  const galleryStartPage = timelineStart + timelinePages;
  const galleryPageCount = paginateGallery(galleryTasks).length;
  const beforeAfterStart = galleryStartPage + galleryPageCount;
  const beforeAfterPageCount = hasBeforeAfter ? Math.ceil(beforeAfterPairs.length / 2) : 0;
  const verificationStart = beforeAfterStart + beforeAfterPageCount;
  const signOffStart = verificationStart + verificationPageCount(verificationStats);

  // Build TOC entries
  const tocEntries: TocEntry[] = [
    { title: "Executive Summary", page: summaryPage },
    { title: "Programme Timeline", page: timelineStart },
  ];
  if (hasGallery) {
    tocEntries.push({ title: "Evidence Gallery", page: galleryStartPage });
  }
  if (hasBeforeAfter) {
    tocEntries.push({ title: "Before & After Comparison", page: beforeAfterStart });
  }
  tocEntries.push({ title: "Verification & Data Integrity", page: verificationStart });
  tocEntries.push({ title: "Sign-Off", page: signOffStart });

  const children = [
    createElement(CoverPage, { key: "cover", meta }),
    createElement(TableOfContents, { key: "toc", meta, entries: tocEntries }),
    createElement(ExecutiveSummary, {
      key: "summary",
      meta,
      stats: summaryStats,
      startPage: summaryPage,
    }),
    createElement(ProgrammeTimeline, {
      key: "timeline",
      meta,
      tasks: timelineTasks,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      startPage: timelineStart,
    }),
    createElement(EvidenceGalleryPage, {
      key: "gallery",
      meta,
      tasks: galleryTasks,
      startPage: galleryStartPage,
    }),
    createElement(BeforeAfterPage, {
      key: "beforeafter",
      meta,
      pairs: beforeAfterPairs,
      startPage: beforeAfterStart,
    }),
    createElement(VerificationPage, {
      key: "verification",
      meta,
      stats: verificationStats,
      startPage: verificationStart,
    }),
    createElement(SignOffPage, {
      key: "signoff",
      meta,
      startPage: signOffStart,
      signatures: signatures ?? [],
    }),
  ];

  const html = renderToStaticMarkup(
    // eslint-disable-next-line react/no-children-prop -- server-side renderToStaticMarkup
    createElement(ReportShell, { meta, children })
  );

  return "<!DOCTYPE html>" + html;
}

/**
 * Convert HTML to PDF using Puppeteer.
 * On Vercel: uses @sparticuz/chromium (serverless-compatible).
 * Locally: uses full puppeteer with bundled Chromium.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  let browser;

  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteerCore = await import("puppeteer-core");
    browser = await puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(
        "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
      ),
      headless: true,
    });
  } else {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  try {
    const page = await browser.newPage();
    // Images are remote presigned URLs now, so the page needs network time
    // proportional to photo count — 30s was calibrated for inline base64.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 120000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function formatDuration(ms: number): string {
  if (ms === 0) return "N/A";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}
