import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { createElement } from "react";
import type { db as dbType } from "@/server/db";
import {
  projects,
  users,
  tasks,
  evidence,
  diaryEntries,
  diaryEvents,
  diaryHoldupDays,
} from "@/server/db/schema";
import { getReadUrl } from "@/server/services/storage";
import { isPlaceholderOrgName } from "@/lib/org-name";
import { DEFAULT_WORKING_DAYS, isWorkingDay, type WorkingDays } from "@/lib/dates";
import { HOLDUP_CAUSE_LABELS } from "@/lib/holdup-causes";
import { ReportShell, type ReportMeta } from "@/components/reports/templates/report-shell";
import { DiaryRecordPages, type DiaryRecordData, type DiaryRecordDay, type DiaryRecordEntry } from "@/components/reports/templates/diary-record";

type DB = typeof dbType;

/**
 * Site Diary Record — the diary itself on paper, one page per day per
 * author, in the shape of a contractor's end-of-shift report: what was
 * done by activity, crew and kit, hold-ups with hours, people and safety,
 * notes, photos, amendments, and the entered / received / locked stamps.
 * INTERNAL record: it prints names. The client progress report keeps
 * its aggregated Site Diary Summary; this is what a contractor reaches
 * for in a dispute.
 */
export interface DiaryRecordInput {
  projectId: string;
  from: string; // yyyy-mm-dd inclusive
  to: string;
  generatedBy: string;
  /** When set, only this author's entries are included (non-PM export). */
  onlyAuthorId?: string | null;
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`).getTime();
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function gatherDiaryRecord(db: DB, input: DiaryRecordInput): Promise<DiaryRecordData> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, input.projectId), with: { organisation: true } });
  if (!project) throw new Error("Project not found");
  const org = project.organisation;
  const wd = project.workingDays;
  const workingDays: WorkingDays = Array.isArray(wd) && wd.every((n) => typeof n === "number") ? (wd as WorkingDays) : DEFAULT_WORKING_DAYS;

  const entryWhere = [
    eq(diaryEntries.projectId, input.projectId),
    gte(diaryEntries.entryDate, input.from),
    lte(diaryEntries.entryDate, input.to),
  ];
  if (input.onlyAuthorId) entryWhere.push(eq(diaryEntries.authorId, input.onlyAuthorId));
  const entries = await db.query.diaryEntries.findMany({
    where: and(...entryWhere),
    orderBy: [asc(diaryEntries.entryDate)],
    with: {
      workLines: { orderBy: (t, { asc: a }) => [a(t.sortOrder)] },
      resources: true,
      author: { columns: { id: true, name: true } },
    },
  });
  const entryIds = entries.map((e) => e.id);
  const [amendments, holdupDays] = await Promise.all([
    entryIds.length
      ? db.query.diaryEvents.findMany({ where: and(inArray(diaryEvents.entryId, entryIds), eq(diaryEvents.kind, "amended")), orderBy: [asc(diaryEvents.createdAt)] })
      : Promise.resolve([]),
    db.query.diaryHoldupDays.findMany({
      where: and(eq(diaryHoldupDays.projectId, input.projectId), gte(diaryHoldupDays.occurredOn, input.from), lte(diaryHoldupDays.occurredOn, input.to)),
      with: { holdup: { columns: { id: true, cause: true, note: true, status: true, taskId: true, authorId: true } } },
    }),
  ]);
  const personIds = Array.from(new Set([...amendments.map((a) => a.actorId), ...holdupDays.map((h) => h.reportedBy)].filter((x): x is string => !!x)));
  const people = personIds.length ? await db.query.users.findMany({ where: inArray(users.id, personIds), columns: { id: true, name: true } }) : [];
  const personName = new Map(people.map((u) => [u.id, u.name]));
  const taskIds = Array.from(new Set([...entries.flatMap((e) => e.workLines.map((w) => w.taskId)), ...holdupDays.map((h) => h.holdup.taskId)].filter((x): x is string => !!x)));
  const taskRows = taskIds.length ? await db.query.tasks.findMany({ where: inArray(tasks.id, taskIds), columns: { id: true, name: true } }) : [];
  const taskName = new Map(taskRows.map((t) => [t.id, t.name]));

  // Photos: those cited by work lines, plus every photo captured on a day in range.
  const citedIds = Array.from(new Set(entries.flatMap((e) => e.workLines.flatMap((w) => (Array.isArray(w.evidenceIds) ? (w.evidenceIds as string[]) : [])))));
  const from0 = new Date(`${input.from}T00:00:00Z`);
  const to24 = new Date(`${input.to}T23:59:59.999Z`);
  const dayPhotos = await db.query.evidence.findMany({
    where: and(eq(evidence.projectId, input.projectId), isNull(evidence.deletedAt), gte(evidence.capturedAt, from0), lte(evidence.capturedAt, to24)),
    columns: { id: true, storageKey: true, thumbnailKey: true, capturedAt: true, uploadedAt: true, latitude: true, longitude: true, uploadedBy: true, note: true },
    orderBy: [asc(evidence.capturedAt)],
  });
  const citedRows = citedIds.length
    ? await db.query.evidence.findMany({ where: and(inArray(evidence.id, citedIds), isNull(evidence.deletedAt)), columns: { id: true, storageKey: true, thumbnailKey: true, capturedAt: true, uploadedAt: true, latitude: true, longitude: true, uploadedBy: true, note: true } })
    : [];
  const photoRows = new Map<string, (typeof dayPhotos)[number]>();
  for (const p of [...dayPhotos, ...citedRows]) photoRows.set(p.id, p);
  const uploaderIds = Array.from(new Set(Array.from(photoRows.values()).map((p) => p.uploadedBy)));
  const uploaders = uploaderIds.length ? await db.query.users.findMany({ where: inArray(users.id, uploaderIds), columns: { id: true, name: true } }) : [];
  const uploaderName = new Map(uploaders.map((u) => [u.id, u.name]));
  const urlCache = new Map<string, string | null>();
  const thumb = async (p: { storageKey: string; thumbnailKey: string | null }) => {
    const key = p.thumbnailKey ?? p.storageKey;
    if (!urlCache.has(key)) urlCache.set(key, await getReadUrl(key));
    return urlCache.get(key) ?? null;
  };
  const photoOut = async (p: (typeof dayPhotos)[number]) => ({
    id: p.id,
    url: await thumb(p),
    capturedAt: p.capturedAt?.toISOString() ?? null,
    uploadedAt: p.uploadedAt?.toISOString() ?? null,
    hasGps: p.latitude != null && p.longitude != null,
    uploader: uploaderName.get(p.uploadedBy) ?? null,
    note: p.note,
  });

  const preparer = await db.query.users.findFirst({ where: eq(users.id, input.generatedBy), columns: { name: true } });
  const logoUrl = org.logoUrl ? (org.logoUrl.startsWith("http") ? org.logoUrl : await getReadUrl(org.logoUrl)) : null;
  const meta: ReportMeta = {
    organisationName: isPlaceholderOrgName(org.name) ? null : org.name,
    logoUrl,
    clientLogoUrl: null,
    brandColor: org.brandColor,
    companyDetails: org.companyDetails,
    projectName: project.name,
    projectReference: project.reference,
    clientName: project.clientName,
    contractType: project.contractType,
    reportNumber: 0,
    periodStart: input.from,
    periodEnd: input.to,
    generatedAt: new Date().toISOString(),
  };

  const days: DiaryRecordDay[] = [];
  for (const date of dateRange(input.from, input.to)) {
    const dayEntries = entries.filter((e) => e.entryDate === date);
    const dayHoldups = holdupDays.filter((h) => h.occurredOn === date);
    const photosOfDay = dayPhotos.filter((p) => p.capturedAt && p.capturedAt.toISOString().slice(0, 10) === date);
    const entriesOut: DiaryRecordEntry[] = [];
    for (const e of dayEntries) {
      const workLines = [];
      for (const w of e.workLines) {
        const ids = Array.isArray(w.evidenceIds) ? (w.evidenceIds as string[]) : [];
        const photos = [];
        for (const id of ids.slice(0, 4)) { const r = photoRows.get(id); if (r) photos.push(await photoOut(r)); }
        workLines.push({ task: w.taskId ? (taskName.get(w.taskId) ?? null) : null, body: w.body, source: w.source, provenance: w.provenance, confirmed: w.confirmed, photos, morePhotos: Math.max(0, ids.length - 4) });
      }
      // Frozen AUTO snapshot shape: { totalPrecipMm, minTempC, maxTempC, wetDays, heavyRainDays, frostDays }.
      const w = e.weather as { totalPrecipMm?: number; minTempC?: number; maxTempC?: number; wetDays?: number; heavyRainDays?: number; frostDays?: number; summary?: string } | null;
      const weather = w
        ? { summary: w.summary ?? (w.heavyRainDays ? "Heavy rain" : w.wetDays ? "Wet" : w.frostDays ? "Frost" : "Dry"), precipMm: w.totalPrecipMm, minC: w.minTempC, maxC: w.maxTempC }
        : null;
      entriesOut.push({
        id: e.id,
        author: e.author?.name ?? "Unknown",
        status: e.status,
        late: e.late,
        enteredAt: e.enteredAt?.toISOString() ?? null,
        receivedAt: e.receivedAt?.toISOString() ?? null,
        lockedAt: e.lockedAt?.toISOString() ?? null,
        amendedAt: e.amendedAt?.toISOString() ?? null,
        weather: weather ? `${weather.summary ? weather.summary + " · " : ""}${weather.precipMm != null ? `${weather.precipMm} mm` : ""}${weather.minC != null && weather.maxC != null ? ` · ${weather.minC}–${weather.maxC}°C` : ""}`.trim() : null,
        workLines,
        resources: e.resources.map((r) => ({ kind: r.kind, label: r.label, qty: r.qty, note: r.note, provenance: r.provenance })),
        holdups: dayHoldups.filter((h) => h.entryId === e.id || (!h.entryId && h.holdup.authorId === e.authorId)).map((h) => ({ cause: (HOLDUP_CAUSE_LABELS as Record<string, string>)[h.holdup.cause] ?? h.holdup.cause, hours: h.hoursLost, note: h.note ?? h.holdup.note, threadStatus: h.holdup.status, task: h.holdup.taskId ? (taskName.get(h.holdup.taskId) ?? null) : null, loggedAt: h.loggedAt.toISOString(), reporter: personName.get(h.reportedBy) ?? null })),
        visitors: e.visitorsCount,
        inspections: e.inspectionsCount,
        toolboxTalk: e.toolboxTalk,
        toolboxTopic: e.toolboxTopic,
        incidents: e.incidentsCount,
        safetyNote: e.safetyNote,
        workNote: e.workNote,
        amendments: amendments.filter((a) => a.entryId === e.id).map((a) => { const p = a.payload as { field?: string; previous?: string | null; next?: string | null; note?: string }; return { field: p.field ?? "note", previous: p.previous ?? null, next: p.next ?? null, note: p.note ?? null, at: a.createdAt.toISOString(), by: a.actorId ? (personName.get(a.actorId) ?? null) : null }; }),
      });
    }
    // Hold-ups logged on a day with no entry at all (rare) still print.
    const orphanHoldups = dayHoldups.filter((h) => !dayEntries.some((e) => e.id === h.entryId || (!h.entryId && h.holdup.authorId === e.authorId)));
    const photos = [];
    for (const p of photosOfDay.slice(0, 6)) photos.push(await photoOut(p));
    days.push({
      date,
      workingDay: isWorkingDay(date, workingDays),
      entries: entriesOut,
      orphanHoldups: orphanHoldups.map((h) => ({ cause: (HOLDUP_CAUSE_LABELS as Record<string, string>)[h.holdup.cause] ?? h.holdup.cause, hours: h.hoursLost, note: h.note ?? h.holdup.note, threadStatus: h.holdup.status, task: h.holdup.taskId ? (taskName.get(h.holdup.taskId) ?? null) : null, loggedAt: h.loggedAt.toISOString(), reporter: personName.get(h.reportedBy) ?? null })),
      photos,
      morePhotos: Math.max(0, photosOfDay.length - 6),
    });
  }

  const locked = entries.filter((e) => e.status === "locked").length;
  return {
    meta,
    from: input.from,
    to: input.to,
    preparedBy: preparer?.name ?? "—",
    scope: input.onlyAuthorId ? "own" : "all",
    days,
    totals: {
      days: days.length,
      workingDays: days.filter((d) => d.workingDay).length,
      daysWithRecord: new Set(entries.map((e) => e.entryDate)).size,
      entries: entries.length,
      locked,
      late: entries.filter((e) => e.late).length,
      amended: entries.filter((e) => e.amendedAt).length,
      hoursLost: holdupDays.reduce((s, h) => s + h.hoursLost, 0),
      incidents: entries.reduce((s, e) => s + e.incidentsCount, 0),
      photos: dayPhotos.length,
    },
  };
}

export async function renderDiaryRecordHTML(data: DiaryRecordData): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const children = [createElement(DiaryRecordPages, { key: "pages", data })];
  // eslint-disable-next-line react/no-children-prop -- same call shape as renderReportHTML
  return "<!DOCTYPE html>" + renderToStaticMarkup(createElement(ReportShell, { meta: data.meta, children }));
}

/** Flat CSV: one row per entry (a day with no entry still appears). */
export function diaryRecordCsv(data: DiaryRecordData): string {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["date", "working_day", "author", "status", "late", "entered_at", "received_at", "locked_at", "amended", "weather", "labour", "plant", "materials", "hours_lost", "holdup_causes", "visitors", "inspections", "toolbox_talk", "toolbox_topic", "incidents", "work_lines", "safety_note", "work_note", "photos_on_day"];
  const rows = [head.join(",")];
  for (const d of data.days) {
    if (d.entries.length === 0) { rows.push([d.date, d.workingDay ? "yes" : "no", "", "no record", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", d.photos.length + d.morePhotos].map(esc).join(",")); continue; }
    for (const e of d.entries) {
      const sum = (k: string) => e.resources.filter((r) => r.kind === k).reduce((s, r) => s + r.qty, 0);
      rows.push([
        d.date, d.workingDay ? "yes" : "no", e.author, e.status, e.late ? "yes" : "no", e.enteredAt ?? "", e.receivedAt ?? "", e.lockedAt ?? "", e.amendments.length ? "yes" : "no", e.weather ?? "",
        sum("labour"), sum("plant"), e.resources.filter((r) => r.kind === "materials").map((r) => `${r.label}${r.qty ? ` ×${r.qty}` : ""}${r.note ? ` (${r.note})` : ""}`).join("; "),
        e.holdups.reduce((s, h) => s + h.hours, 0), e.holdups.map((h) => h.cause).join("; "),
        e.visitors, e.inspections, e.toolboxTalk ? "yes" : "no", e.toolboxTopic ?? "", e.incidents,
        e.workLines.map((w) => `${w.task ? w.task + ": " : ""}${w.body}`).join(" | "), e.safetyNote ?? "", e.workNote ?? "", d.photos.length + d.morePhotos,
      ].map(esc).join(","));
    }
  }
  return rows.join("\n") + "\n";
}
