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
import { formatDate, formatDateRange } from "@/lib/format";
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

  // 5. Build report meta. Logo fields store R2 keys — sign them here so
  // Puppeteer can fetch during render (legacy http URLs pass through).
  const logoUrl = org.logoUrl
    ? org.logoUrl.startsWith("http")
      ? org.logoUrl
      : await getReadUrl(org.logoUrl)
    : null;
  const clientLogoUrl = project.clientLogoKey
    ? await getReadUrl(project.clientLogoKey)
    : null;

  const meta: ReportMeta = {
    organisationName: org.name,
    logoUrl,
    clientLogoUrl,
    brandColor: org.brandColor,
    companyDetails: org.companyDetails,
    projectName: project.name,
    projectReference: project.reference,
    clientName: project.clientName,
    contractType: project.contractType,
    reportNumber,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: new Date().toISOString(),
  };

  // 6. Executive summary stats — leaf activities only. Counting phase
  // headings alongside their children double-counts and makes the table
  // disagree with the narrative.
  const parentIds = new Set(allTasks.map((t) => t.parentTaskId).filter(Boolean));
  const leafTasks = allTasks.filter((t) => !parentIds.has(t.id));
  const completedTasks = leafTasks.filter((t) => t.status === "completed").length;
  const inProgressTasks = leafTasks.filter((t) => t.status === "in_progress").length;
  const delayedTasks = leafTasks.filter((t) => t.status === "delayed").length;
  const notStartedTasks = leafTasks.filter((t) => t.status === "not_started").length;

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

  // Latest site note per task from period evidence (newest-first order,
  // so the first note seen per task is the most recent one).
  const latestNoteByTask = new Map<string, string>();
  for (const ev of periodEvidence) {
    if (!ev.note) continue;
    for (const link of ev.links) {
      if (!latestNoteByTask.has(link.task.id)) {
        latestNoteByTask.set(link.task.id, ev.note);
      }
    }
  }

  // Key risks: delayed tasks, with enough context that the reader's first
  // question ("why, and how bad?") is answered by the document itself.
  const keyRisks: string[] = [];
  const delayedTaskList = leafTasks.filter((t) => t.status === "delayed");
  for (const t of delayedTaskList.slice(0, 5)) {
    let risk = `"${t.name}" is flagged as delayed`;
    if (t.plannedStart && t.plannedEnd) {
      risk += ` (planned ${formatDateRange(t.plannedStart, t.plannedEnd)})`;
    }
    const note = latestNoteByTask.get(t.id);
    if (note) risk += ` — site note: “${note}”`;
    keyRisks.push(risk);
  }
  // Overdue detection: activities past their planned finish and not done.
  // This is the list a client actually asks about — name them.
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = leafTasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "delayed" && // already listed above
      t.plannedEnd &&
      t.plannedEnd < todayStr
  );
  for (const t of overdue.slice(0, 3)) {
    keyRisks.push(
      `"${t.name}" is past its planned finish (due ${formatDate(t.plannedEnd)}, currently ${t.progressPct ?? 0}%)`
    );
  }
  if (overdue.length > 3) {
    keyRisks.push(
      `${overdue.length - 3} further ${overdue.length - 3 === 1 ? "activity is" : "activities are"} past their planned finish dates`
    );
  }

  if (avgActual < avgPlanned - 10) {
    if (avgPlanned >= 100) {
      keyRisks.push(
        `The programme's planned completion date has passed with overall progress at ${avgActual}% — re-baseline the programme, or update task progress if work is further along than recorded`
      );
    } else {
      keyRisks.push(
        `Overall progress is ${avgPlanned - avgActual}% behind planned schedule`
      );
    }
  }
  // A flagged delay alongside a positive headline variance looks like a
  // contradiction unless the report explains it.
  const allDelaysPreStart =
    delayedTaskList.length > 0 &&
    delayedTaskList.every((t) => t.plannedStart && t.plannedStart > input.periodEnd);
  if (allDelaysPreStart && avgActual >= Math.min(avgPlanned, 100)) {
    keyRisks.push(
      "The flagged item(s) above are ahead of their planned start dates — an early warning rather than current programme slippage, which is why overall variance remains positive."
    );
  }

  const summaryStats: SummaryStats = {
    totalTasks: leafTasks.length,
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

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const taskOrderIndex = new Map<string, number>();
  flatWithDepth.forEach((t, i) => taskOrderIndex.set(t.id, i));

  async function toGalleryEvidence(ev: (typeof periodEvidence)[number]) {
    const readUrl = await cachedReadUrl(ev.thumbnailKey ?? ev.storageKey);
    return {
      id: ev.id,
      publicUrl: readUrl ?? "",
      originalFilename: ev.originalFilename,
      capturedAt: ev.capturedAt?.toISOString() ?? null,
      latitude: ev.latitude,
      longitude: ev.longitude,
      uploaderName: ev.uploader?.name ?? null,
      uploaderRole: ev.uploader?.role ?? null,
      note: ev.note,
    };
  }

  for (const ev of periodEvidence) {
    for (const link of ev.links) {
      let gt = taskEvidenceMap.get(link.task.id);
      if (!gt) {
        const task = taskById.get(link.task.id);
        gt = {
          id: link.task.id,
          name: link.task.name,
          status: task?.status ?? null,
          progressPct: task?.progressPct ?? null,
          evidence: [],
        };
        taskEvidenceMap.set(link.task.id, gt);
      }
      gt.evidence.push(await toGalleryEvidence(ev));
    }
  }
  for (const gt of taskEvidenceMap.values()) {
    // Chronological within a task — the reader follows work as it happened
    gt.evidence.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
    galleryTasks.push(gt);
  }
  // Programme order, not alphabetical — the gallery should read like the plan
  galleryTasks.sort(
    (a, b) => (taskOrderIndex.get(a.id) ?? 1e9) - (taskOrderIndex.get(b.id) ?? 1e9)
  );

  // Photos captured in the period but not yet linked to a task still belong
  // in an evidence report — grouped last rather than silently dropped.
  const unlinkedEvidence = periodEvidence.filter((ev) => ev.links.length === 0);
  if (unlinkedEvidence.length > 0) {
    const group: GalleryTask = {
      id: "__unlinked__",
      name: "Other site photos (not yet linked to a task)",
      status: null,
      progressPct: null,
      evidence: [],
    };
    for (const ev of unlinkedEvidence) {
      group.evidence.push(await toGalleryEvidence(ev));
    }
    group.evidence.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
    galleryTasks.push(group);
  }

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

  // 11. Audit trail — period start through report generation, not period
  // end: uploads and sign-offs for period evidence routinely land after
  // the period closes, and a summary that excludes them reads as "no
  // activity" on a report full of evidence.
  const auditWindowEnd = new Date();
  const auditEntries = await db.query.auditLog.findMany({
    where: and(
      eq(auditLog.projectId, input.projectId),
      gte(auditLog.createdAt, periodStart),
      lte(auditLog.createdAt, auditWindowEnd)
    ),
    orderBy: [desc(auditLog.createdAt)],
    limit: 20,
    with: {
      user: { columns: { name: true } },
    },
  });

  // Aggregate counts across the WHOLE period (the entries list is capped)
  const auditCounts = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.projectId, input.projectId),
        gte(auditLog.createdAt, periodStart),
        lte(auditLog.createdAt, auditWindowEnd)
      )
    )
    .groupBy(auditLog.action);
  const auditTotal = auditCounts.reduce((s, c) => s + c.count, 0);

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
    auditActionCounts: auditCounts,
    auditTotal,
  };

  // 12. Narrative — deterministic prose from the period's facts, so the
  // report SAYS what happened instead of leaving the reader to infer it
  // from tiles and bars. Leaf tasks only (computed in section 6).
  const inPeriodDate = (d: string | null) =>
    !!d && d >= input.periodStart && d <= input.periodEnd;

  const evidenceCountByTask = new Map<string, number>();
  for (const ev of periodEvidence) {
    for (const l of ev.links) {
      evidenceCountByTask.set(l.task.id, (evidenceCountByTask.get(l.task.id) ?? 0) + 1);
    }
  }

  const completedInPeriod = leafTasks.filter(
    (t) => t.status === "completed" && inPeriodDate(t.actualEnd)
  );
  const activeAtEnd = leafTasks.filter((t) => t.status === "in_progress");

  // Programmes reuse task names across phases ("MAG", "Site Survey works")
  // — qualify duplicates with their parent so the narrative stays readable.
  const nameCounts = new Map<string, number>();
  for (const t of leafTasks) {
    nameCounts.set(t.name, (nameCounts.get(t.name) ?? 0) + 1);
  }
  const taskByIdNarr = new Map(allTasks.map((t) => [t.id, t]));
  const displayName = (t: (typeof leafTasks)[number]): string => {
    if ((nameCounts.get(t.name) ?? 0) <= 1) return t.name;
    const parent = t.parentTaskId ? taskByIdNarr.get(t.parentTaskId) : null;
    return parent ? `${parent.name} — ${t.name}` : t.name;
  };

  const paragraphs: string[] = [];
  const periodLabel = formatDateRange(input.periodStart, input.periodEnd);

  const opening: string[] = [];
  opening.push(`Works at ${project.name} continued through the period ${periodLabel}.`);
  const openingBits: string[] = [];
  if (completedInPeriod.length > 0) {
    openingBits.push(
      `${completedInPeriod.length} ${completedInPeriod.length === 1 ? "activity was" : "activities were"} completed`
    );
  }
  if (activeAtEnd.length > 0) {
    // Include the noun when it isn't already carried by the completed clause
    const noun = completedInPeriod.length > 0 ? "" : activeAtEnd.length === 1 ? "activity " : "activities ";
    openingBits.push(
      `${activeAtEnd.length} ${noun}${activeAtEnd.length === 1 ? "was" : "were"} in progress at the period end`
    );
  }
  if (openingBits.length > 0) {
    opening.push(`During the period, ${openingBits.join(" and ")}.`);
  }
  opening.push(
    `${periodEvidence.length} item${periodEvidence.length === 1 ? "" : "s"} of site evidence ${periodEvidence.length === 1 ? "was" : "were"} captured.`
  );
  paragraphs.push(opening.join(" "));

  if (completedInPeriod.length > 0) {
    const parts = completedInPeriod.map(
      (t) => `${displayName(t)}${t.actualEnd ? ` (finished ${formatDate(t.actualEnd)})` : ""}`
    );
    paragraphs.push(`Completed in the period: ${joinList(parts)}.`);
  }

  if (activeAtEnd.length > 0) {
    const parts = activeAtEnd.map((t) => {
      const bits: string[] = [`${t.progressPct ?? 0}% complete`];
      if (inPeriodDate(t.actualStart)) bits.push(`started ${formatDate(t.actualStart)}`);
      const photos = evidenceCountByTask.get(t.id) ?? 0;
      if (photos > 0) bits.push(`${photos} photo${photos === 1 ? "" : "s"} this period`);
      return `${displayName(t)} (${bits.join(", ")})`;
    });
    paragraphs.push(`Work continued on ${joinList(parts)}.`);
  }

  for (const t of delayedTaskList.slice(0, 3)) {
    let s = `${t.name} has been flagged as delayed`;
    if (t.plannedStart && t.plannedStart > input.periodEnd) {
      s += ` ahead of its planned ${formatDateRange(t.plannedStart, t.plannedEnd)} window`;
    } else if (t.plannedEnd) {
      s += ` against a planned completion of ${formatDate(t.plannedEnd)}`;
    }
    const note = latestNoteByTask.get(t.id);
    if (note) s += ` — site note: “${note}”`;
    paragraphs.push(s + ".");
  }

  if (periodEvidence.length > 0) {
    paragraphs.push(
      `Of the ${periodEvidence.length} evidence item${periodEvidence.length === 1 ? "" : "s"} captured this period, ${withGps} carr${withGps === 1 ? "ies" : "y"} GPS positions and ${gpsVerifiedByZone} ${gpsVerifiedByZone === 1 ? "was" : "were"} verified inside defined site zones. Capture timestamps and camera metadata are preserved for every item — see Verification & Metadata.`
    );
  }

  return {
    meta,
    reportNumber,
    summaryStats,
    narrative: { paragraphs },
    timelineTasks,
    galleryTasks,
    beforeAfterPairs,
    verificationStats,
    signatures: input.signatures ?? [],
  };
}

/** "A", "A and B", "A, B and C" — caps at 5 items then "and N more". */
function joinList(items: string[], max = 5): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  let joined: string;
  if (shown.length === 1) joined = shown[0];
  else joined = `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined} and ${rest} more` : joined;
}

/**
 * Render report data into a full HTML string.
 */
export async function renderReportHTML(data: Awaited<ReturnType<typeof gatherReportData>>): Promise<string> {
  // Dynamic import to avoid Turbopack's react-dom/server static analysis block
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { meta, summaryStats, narrative, timelineTasks, galleryTasks, beforeAfterPairs, verificationStats, signatures } =
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
    tocEntries.push({ title: "Progress Records", page: galleryStartPage });
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
      narrative,
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
