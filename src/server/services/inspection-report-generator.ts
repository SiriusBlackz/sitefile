import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { createElement } from "react";
import type { db as dbType } from "@/server/db";
import {
  projects,
  evidence,
  gpsZones,
  auditLog,
  inspectionVisits,
  inspectionItems,
  users,
} from "@/server/db/schema";
import { getReadUrl } from "@/server/services/storage";
import { isPlaceholderOrgName } from "@/lib/org-name";
import { pointInPolygon } from "@/lib/geo";
import { locationLine } from "@/lib/inspection-location";
import {
  resolveInspectionSections,
  INSPECTION_REPORT_TITLE,
  type InspectionSections,
} from "@/lib/inspection-report-sections";
import { hasCameraMetadata } from "@/server/services/report-generator";
import { ReportShell } from "@/components/reports/templates/report-shell";
import { TableOfContents, type TocEntry, type OmittedSection } from "@/components/reports/templates/table-of-contents";
import { PhotoMapPage, type PhotoMapData } from "@/components/reports/templates/photo-map";
import { VerificationPage, verificationPageCount, type VerificationStats } from "@/components/reports/templates/verification";
import type { SignatureData } from "@/components/reports/templates/sign-off";
import { type InspectionMeta } from "@/components/reports/templates/inspection/inspection-meta";
import { InspectionCoverPage } from "@/components/reports/templates/inspection/inspection-cover";
import { ScopeLimitationsPage, type ScopeData } from "@/components/reports/templates/inspection/scope-limitations";
import { InspectionSummaryPage, type InspectionSummaryData } from "@/components/reports/templates/inspection/inspection-summary";
import { DefectRegisterPages, paginateRegister, type RegisterRow } from "@/components/reports/templates/inspection/defect-register";
import { ItemRecordPages, paginateItemRecords, type ItemRecord } from "@/components/reports/templates/inspection/item-records";
import { DecisionsPage, type DecisionsData } from "@/components/reports/templates/inspection/decisions-outstanding";
import { InspectionSignOffPage } from "@/components/reports/templates/inspection/inspection-sign-off";

type DB = typeof dbType;

/**
 * Defects Inspection and Closeout Report — gatherer and renderer.
 * A sibling of report-generator.ts, deliberately duplicated rather than
 * refactored: the progress path is live for a paying pilot. Evidence is
 * selected by LINK to a register item, never by date; counts are at the
 * issue date and only Verified closed counts as closed.
 */

export interface InspectionReportInput {
  projectId: string;
  visitId: string;
  generatedBy: string;
  reportNumber?: number;
  revision?: number;
  stage: "initial_walkthrough" | "interim_reinspection" | "end_of_defects_period";
  kind: "inspection_record" | "register_status" | "closeout";
  sections?: Partial<InspectionSections>;
  coverEvidenceId?: string;
  signatures?: SignatureData[];
  /** Dialog-time overrides for the visit facts (also persisted on the visit). */
  scopeNote?: string;
  methodLine?: string;
  urgentConcerns?: string;
  attendees?: { name: string; org?: string; role?: string; authority?: string }[];
  notInspected?: { area: string; reason?: string; owner?: string; followUp?: string }[];
}

const STAGE_LABELS: Record<string, string> = {
  initial_walkthrough: "Initial walkthrough",
  interim_reinspection: "Interim reinspection",
  end_of_defects_period: "End of defects period",
};
const KIND_LABELS: Record<string, string> = {
  inspection_record: "Inspection record",
  register_status: "Register status",
  closeout: "Closeout",
};
const CONTRACT_FORM_LABELS: Record<string, string> = {
  nec4_ecc: "NEC4 ECC",
  nec3_ecc: "NEC3 ECC",
  jct: "JCT",
  other: "Other",
};
const CLOSED = new Set(["verified_closed", "accepted_as_is", "void"]);
const MAX_PHOTOS_PER_ITEM = 4;

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours === 0 && minutes === 0) return "under a minute";
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

export async function gatherInspectionReportData(db: DB, input: InspectionReportInput) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
    with: { organisation: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.projectType !== "inspection") throw new Error("Not an inspection project");
  const org = project.organisation;
  const sections = resolveInspectionSections(input.sections);

  const visit = await db.query.inspectionVisits.findFirst({
    where: and(eq(inspectionVisits.id, input.visitId), eq(inspectionVisits.projectId, input.projectId)),
  });
  if (!visit) throw new Error("Visit not found");

  const reportNumber = input.reportNumber ?? 1;
  const revision = input.revision ?? 1;

  // Items + role-tagged photos (deleted evidence excluded) + events.
  const items = await db.query.inspectionItems.findMany({
    where: eq(inspectionItems.projectId, input.projectId),
    orderBy: [asc(inspectionItems.locationSort), asc(inspectionItems.seq)],
    with: {
      verifier: { columns: { name: true } },
      responsibleUser: { columns: { name: true } },
      events: { orderBy: (e, { asc: a }) => [a(e.createdAt)], with: { actor: { columns: { name: true } } } },
      photos: {
        with: {
          evidence: {
            columns: {
              id: true, storageKey: true, capturedAt: true, uploadedAt: true, latitude: true, longitude: true, exifData: true, type: true, deletedAt: true, uploadedBy: true,
            },
          },
        },
      },
    },
  });
  const uploaderIds = Array.from(new Set(items.flatMap((i) => i.photos.map((p) => p.evidence?.uploadedBy)).filter((x): x is string => !!x)));
  const uploaders = uploaderIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, uploaderIds), columns: { id: true, name: true } })
    : [];
  const uploaderName = new Map(uploaders.map((u) => [u.id, u.name]));
  const zones = await db.query.gpsZones.findMany({ where: eq(gpsZones.projectId, input.projectId) });

  // Meta (logos signed for Puppeteer)
  const logoUrl = org.logoUrl ? (org.logoUrl.startsWith("http") ? org.logoUrl : await getReadUrl(org.logoUrl)) : null;
  const clientLogoUrl = project.clientLogoKey ? await getReadUrl(project.clientLogoKey) : null;
  let coverPhotoUrl: string | null = null;
  if (input.coverEvidenceId) {
    const cover = await db.query.evidence.findFirst({
      where: and(eq(evidence.id, input.coverEvidenceId), eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt)),
      columns: { storageKey: true },
    });
    if (cover) coverPhotoUrl = await getReadUrl(cover.storageKey);
  }
  const cd = (project.contractDates ?? {}) as { completion?: string | null; defectsDate?: string | null; confirmed?: { completion?: boolean; defectsDate?: boolean } };
  const meta: InspectionMeta = {
    organisationName: isPlaceholderOrgName(org.name) ? null : org.name,
    logoUrl,
    clientLogoUrl,
    brandColor: org.brandColor,
    companyDetails: org.companyDetails,
    projectName: project.name,
    projectReference: project.reference,
    clientName: project.clientName,
    contractType: project.contractType,
    reportNumber,
    periodStart: visit.visitDate,
    periodEnd: visit.visitDate,
    generatedAt: new Date().toISOString(),
    coverPhotoUrl,
    reportTitle: INSPECTION_REPORT_TITLE,
    stageLabel: STAGE_LABELS[input.stage] ?? input.stage,
    kindLabel: KIND_LABELS[input.kind] ?? input.kind,
    visitDate: visit.visitDate,
    revision,
    contractFormLabel: project.contractForm ? (CONTRACT_FORM_LABELS[project.contractForm] ?? project.contractForm) : null,
    contractDates: {
      completion: cd.completion ?? null,
      defectsDate: cd.defectsDate ?? null,
      completionConfirmed: Boolean(cd.confirmed?.completion),
      defectsConfirmed: Boolean(cd.confirmed?.defectsDate),
    },
  };

  // Scope page
  const scope: ScopeData = {
    scopeNote: input.scopeNote ?? visit.scopeNote,
    methodLine: input.methodLine ?? visit.methodLine,
    weather: visit.weather,
    attendees: (input.attendees ?? (visit.attendees as ScopeData["attendees"])) ?? [],
    notInspected: (input.notInspected ?? (visit.notInspected as ScopeData["notInspected"])) ?? [],
    existingRecords: null,
  };

  // Register + item records
  const scheme = project.locationScheme;
  const livePhotos = (it: (typeof items)[number]) => it.photos.filter((p) => p.evidence && !p.evidence.deletedAt);
  const registerRows: RegisterRow[] = items.map((it) => ({
    ref: it.ref,
    locationLine: locationLine(scheme, it.location as never),
    type: it.type,
    title: it.title,
    priority: it.priority,
    responsible: it.responsibleOrg ?? it.responsibleUser?.name ?? null,
    status: it.status,
    repairTarget: it.repairTarget,
    correctionDue: it.correctionDue,
    verifiedBy: it.verifier?.name ?? null,
    verifiedAt: it.verifiedAt ? it.verifiedAt.toISOString() : null,
  }));

  let evidenceNo = 0;
  const roleOrder = ["defect", "during", "rectified", "verified"];
  const records: ItemRecord[] = [];
  for (const it of items) {
    const photos = livePhotos(it).sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || ((a.evidence!.capturedAt?.getTime() ?? 0) - (b.evidence!.capturedAt?.getTime() ?? 0)));
    const shown = photos.slice(0, MAX_PHOTOS_PER_ITEM);
    const photoRecords = [];
    for (const p of shown) {
      const url = await getReadUrl(p.evidence!.storageKey);
      if (!url) continue;
      evidenceNo++;
      photoRecords.push({
        url,
        role: p.role,
        capturedAt: p.evidence!.capturedAt?.toISOString() ?? null,
        uploadedAt: p.evidence!.uploadedAt?.toISOString() ?? null,
        hasGps: p.evidence!.latitude != null && p.evidence!.longitude != null,
        uploader: p.evidence!.uploadedBy ? (uploaderName.get(p.evidence!.uploadedBy) ?? null) : null,
        evidenceNo,
      });
    }
    const flags = Object.entries((it.flags ?? {}) as Record<string, unknown>).filter(([, v]) => v).map(([k]) => k.replace(/_/g, " "));
    const trail = it.events
      .filter((e) => ["created", "status_change", "not_accepted", "reopened", "disposition", "notified"].includes(e.kind))
      .map((e) => ({
        at: e.createdAt.toISOString(),
        text: `${e.kind.replace(/_/g, " ")}${e.toStatus ? ` → ${e.toStatus.replace(/_/g, " ")}` : ""}${e.actor ? ` · ${e.actor.name}` : ""}${e.note ? ` · ${e.note}` : ""}`,
      }));
    records.push({
      ref: it.ref,
      type: it.type,
      title: it.title,
      status: it.status,
      locationLine: locationLine(scheme, it.location as never),
      finding: it.finding,
      suspectedCause: it.suspectedCause,
      acceptanceBasis: it.acceptanceBasis,
      interimAction: it.interimAction,
      accessNote: it.accessNote,
      responsible: it.responsibleOrg ?? it.responsibleUser?.name ?? null,
      repairTarget: it.repairTarget,
      correctionDue: it.correctionDue,
      notified: it.notifiedAt ? `${it.notifiedAt}${it.notificationRef ? ` (${it.notificationRef})` : ""}` : null,
      flags,
      photos: photoRecords,
      morePhotos: Math.max(0, photos.length - shown.length),
      trail,
    });
  }

  // Summary
  const today = new Date().toISOString().slice(0, 10);
  const byStatus = new Map<string, number>();
  for (const it of items) byStatus.set(it.status, (byStatus.get(it.status) ?? 0) + 1);
  const overdueItems = items.filter((it) => it.correctionDue && it.correctionDue < today && !CLOSED.has(it.status));
  const flagRefs = (k: string) => items.filter((it) => ((it.flags ?? {}) as Record<string, unknown>)[k]).map((it) => it.ref);
  const typeCounts = new Map<string, number>();
  for (const it of items) typeCounts.set(it.type, (typeCounts.get(it.type) ?? 0) + 1);
  const TYPE_LABEL: Record<string, string> = { defect: "Defect", snag: "Snag", outstanding_work: "Outstanding work", observation: "Observation" };
  const summary: InspectionSummaryData = {
    total: items.length,
    verifiedClosed: byStatus.get("verified_closed") ?? 0,
    readyForReview: byStatus.get("ready_for_review") ?? 0,
    openOrInProgress: (byStatus.get("open") ?? 0) + (byStatus.get("in_progress") ?? 0),
    reopened: byStatus.get("reopened") ?? 0,
    otherDisposition: (byStatus.get("accepted_as_is") ?? 0) + (byStatus.get("void") ?? 0),
    otherDispositionRefs: items.filter((it) => it.status === "accepted_as_is" || it.status === "void").map((it) => `${it.ref}${it.dispositionRef ? ` (${it.dispositionRef})` : ""}`),
    overdue: overdueItems.length,
    overdueRefs: overdueItems.map((it) => it.ref),
    flagged: { accessBlocked: flagRefs("access_blocked"), disputed: flagRefs("disputed"), awaitingTest: flagRefs("awaiting_test") },
    newThisVisit: items.filter((it) => it.firstVisitId === visit.id).length,
    closedThisVisit: items.filter((it) => it.events.some((e) => e.visitId === visit.id && e.toStatus === "verified_closed")).length,
    byType: Array.from(typeCounts.entries()).map(([type, count]) => ({ type: TYPE_LABEL[type] ?? type, count })),
    withPhotos: items.filter((it) => livePhotos(it).length > 0).length,
    urgentConcerns: input.urgentConcerns ?? visit.urgentConcerns,
  };

  // Decisions
  const decisions: DecisionsData = {
    unresolved: items
      .filter((it) => !CLOSED.has(it.status))
      .map((it) => ({
        ref: it.ref,
        status: it.status,
        reason: it.status === "ready_for_review" ? "Reported complete — awaiting verification" : it.status === "reopened" ? "Reopened after review" : "Correction outstanding",
        nextAction: it.nextAction,
        owner: it.nextActionOwner ?? it.responsibleOrg ?? it.responsibleUser?.name ?? null,
        due: it.nextActionDue ?? it.repairTarget ?? null,
      })),
    formalDecisions: items
      .filter((it) => it.status === "accepted_as_is" || it.status === "void")
      .map((it) => `${it.ref} — ${it.status === "accepted_as_is" ? "accepted as-is" : "void"}${it.dispositionRef ? `, reference ${it.dispositionRef}` : ""}`),
  };

  // Photo map + verification over the item photos
  const allPhotos = items.flatMap((it) => livePhotos(it).map((p) => ({ ...p.evidence!, itemRef: it.ref })));
  const gpsPhotos = allPhotos.filter((e) => e.latitude != null && e.longitude != null);
  let gpsVerifiedByZone = 0;
  for (const e of gpsPhotos) {
    if (zones.some((z) => pointInPolygon([e.longitude!, e.latitude!], (z.polygon as { coordinates: number[][][] }).coordinates))) gpsVerifiedByZone++;
  }
  let photoMap: PhotoMapData | null = null;
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (sections.photoMap && mapboxToken && !/placeholder/i.test(mapboxToken) && gpsPhotos.length > 0) {
    const pinned = gpsPhotos.slice(0, 20);
    const markers = pinned.map((ev, i) => `pin-s-${i + 1}+be123c(${ev.longitude!.toFixed(5)},${ev.latitude!.toFixed(5)})`);
    const zoneFeatures = zones.map((z) => ({
      type: "Feature" as const,
      properties: { stroke: z.color ?? "#3B82F6", "stroke-width": 3, fill: z.color ?? "#3B82F6", "fill-opacity": 0.12 },
      geometry: { type: "Polygon" as const, coordinates: (z.polygon as { coordinates: number[][][] }).coordinates },
    }));
    const zoneOverlay = zoneFeatures.length ? `geojson(${encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: zoneFeatures }))})` : "";
    const overlays = [...(zoneOverlay && zoneOverlay.length < 5000 ? [zoneOverlay] : []), ...markers].join(",");
    const staticUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlays}/auto/700x430@2x?padding=60&access_token=${mapboxToken}`;
    for (const origin of [process.env.NEXT_PUBLIC_APP_URL ?? "", "https://www.sitefile.app"].filter(Boolean)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(staticUrl, { headers: { Referer: origin.endsWith("/") ? origin : origin + "/" }, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          photoMap = {
            mapUrl: `data:${res.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`,
            legend: pinned.map((ev, i) => ({ n: i + 1, label: ev.itemRef })),
            overflow: gpsPhotos.length - pinned.length,
            photosWithGps: gpsPhotos.length,
            totalPhotos: allPhotos.length,
            verifiedInZones: gpsVerifiedByZone,
            zonesConfigured: zones.length,
          };
          break;
        }
      } catch {
        // try next origin
      }
    }
  }

  let totalDelay = 0, maxDelay = 0, delayCount = 0;
  for (const e of allPhotos) {
    if (e.capturedAt && e.uploadedAt) {
      const d = e.uploadedAt.getTime() - e.capturedAt.getTime();
      if (d >= 0) { totalDelay += d; maxDelay = Math.max(maxDelay, d); delayCount++; }
    }
  }
  const visitStart = new Date(visit.visitDate + "T00:00:00Z");
  const auditEntries = await db.query.auditLog.findMany({
    where: and(eq(auditLog.projectId, input.projectId), gte(auditLog.createdAt, visitStart), lte(auditLog.createdAt, new Date())),
    orderBy: [desc(auditLog.createdAt)],
    limit: 20,
    with: { user: { columns: { name: true } } },
  });
  const auditCounts = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.projectId, input.projectId), gte(auditLog.createdAt, visitStart)))
    .groupBy(auditLog.action);
  const typeMap = new Map<string, number>();
  for (const e of allPhotos) typeMap.set(e.type ?? "photo", (typeMap.get(e.type ?? "photo") ?? 0) + 1);
  const verificationStats: VerificationStats = {
    totalEvidence: allPhotos.length,
    withExifData: allPhotos.filter((e) => hasCameraMetadata(e.exifData)).length,
    withGpsCoords: gpsPhotos.length,
    gpsVerifiedByZone,
    zonesConfigured: zones.length,
    averageUploadDelay: formatDuration(delayCount ? totalDelay / delayCount : 0),
    maxUploadDelay: formatDuration(maxDelay),
    delaySamples: delayCount,
    evidenceByType: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })),
    auditTrailSummary: auditEntries.map((e) => ({ date: e.createdAt?.toISOString() ?? "", user: e.user?.name ?? "System", action: e.action, entity: e.entityType })),
    auditActionCounts: auditCounts,
    auditTotal: auditCounts.reduce((s, c) => s + c.count, 0),
    diaryDaysLocked: 0,
    diaryWorkingDays: 0,
  };

  const omittedSections: OmittedSection[] = [];
  if (sections.photoMap && !photoMap) {
    omittedSections.push({ title: "Photo location map", reason: gpsPhotos.length === 0 ? "No item photograph carried a GPS position." : "The map image could not be produced at generation time." });
  }
  if (sections.items && records.length === 0) {
    omittedSections.push({ title: "Item records", reason: "No items were recorded on this visit." });
  }

  return { meta, sections, scope, summary, registerRows, records, decisions, photoMap, verificationStats, omittedSections, signatures: input.signatures ?? [] };
}

export type InspectionReportData = Awaited<ReturnType<typeof gatherInspectionReportData>>;

export async function renderInspectionReportHTML(data: InspectionReportData): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { meta, sections, scope, summary, registerRows, records, decisions, photoMap, verificationStats, omittedSections, signatures } = data;

  const hasToc = sections.toc;
  const hasScope = sections.scope;
  const hasSummary = sections.summary;
  const hasRegister = sections.register;
  const hasItems = sections.items && records.length > 0;
  const hasDecisions = sections.decisions;
  const hasPhotoMap = sections.photoMap && photoMap != null;
  const hasVerification = sections.verification;
  const hasSignOff = sections.signOff;

  let page = 2; // page 1 is the cover
  if (hasToc) page++;
  const scopePage = hasScope ? page++ : 0;
  const summaryPage = hasSummary ? page++ : 0;
  const registerPage = hasRegister ? page : 0;
  if (hasRegister) page += paginateRegister(registerRows).length;
  const itemsPage = hasItems ? page : 0;
  if (hasItems) page += paginateItemRecords(records).length;
  const decisionsPage = hasDecisions ? page++ : 0;
  const photoMapPage = hasPhotoMap ? page++ : 0;
  const verificationPage = hasVerification ? page : 0;
  if (hasVerification) page += verificationPageCount(verificationStats);
  const signOffPage = hasSignOff ? page++ : 0;

  const tocEntries: TocEntry[] = [];
  if (hasScope) tocEntries.push({ title: "Scope, Method and Limitations", page: scopePage });
  if (hasSummary) tocEntries.push({ title: "Summary at the Issue Date", page: summaryPage });
  if (hasRegister) tocEntries.push({ title: "Defect Register", page: registerPage });
  if (hasItems) tocEntries.push({ title: "Item Records", page: itemsPage });
  if (hasDecisions) tocEntries.push({ title: "Decisions and Outstanding Matters", page: decisionsPage });
  if (hasPhotoMap) tocEntries.push({ title: "Photo Location Map", page: photoMapPage });
  if (hasVerification) tocEntries.push({ title: "Verification & Data Integrity", page: verificationPage });
  if (hasSignOff) tocEntries.push({ title: "Sign-Off", page: signOffPage });

  const children = [
    createElement(InspectionCoverPage, { key: "cover", meta }),
    ...(hasToc ? [createElement(TableOfContents, { key: "toc", meta, entries: tocEntries, omitted: omittedSections })] : []),
    ...(hasScope ? [createElement(ScopeLimitationsPage, { key: "scope", meta, data: scope, startPage: scopePage })] : []),
    ...(hasSummary ? [createElement(InspectionSummaryPage, { key: "summary", meta, data: summary, startPage: summaryPage })] : []),
    ...(hasRegister ? [createElement(DefectRegisterPages, { key: "register", meta, rows: registerRows, startPage: registerPage })] : []),
    ...(hasItems ? [createElement(ItemRecordPages, { key: "items", meta, records, startPage: itemsPage })] : []),
    ...(hasDecisions ? [createElement(DecisionsPage, { key: "decisions", meta, data: decisions, startPage: decisionsPage })] : []),
    ...(hasPhotoMap ? [createElement(PhotoMapPage, { key: "map", meta, data: photoMap!, startPage: photoMapPage })] : []),
    ...(hasVerification ? [createElement(VerificationPage, { key: "verification", meta, stats: verificationStats, startPage: verificationPage })] : []),
    ...(hasSignOff ? [createElement(InspectionSignOffPage, { key: "signoff", meta, signatures, startPage: signOffPage })] : []),
  ];
  // eslint-disable-next-line react/no-children-prop -- same call shape as renderReportHTML
  const html = renderToStaticMarkup(createElement(ReportShell, { meta, children }));
  return "<!DOCTYPE html>" + html;
}
