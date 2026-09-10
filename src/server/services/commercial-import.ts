/**
 * CEMAR register import (package 4). Parses the EW and CE register CSV
 * exports exactly as CEMAR emits them (column names verbatim), maps the
 * dd/mm/yyyy dates to ISO and the money to a decimal string, and builds
 * the counts the desk page and the report's commercial section print.
 *
 * Descriptions arrive redacted ("Content unavailable") in most exports —
 * summaries are built from refs, titles, dates and statuses, never from
 * the description text.
 */

export type CommercialKind = "ew" | "ce";

export interface CommercialRow {
  kind: CommercialKind;
  eventId: number | null;
  ref: string;
  crossRef: string | null;
  title: string;
  fromParty: string | null;
  author: string | null;
  status: string | null;
  notifiedOn: string | null;
  replyDue: string | null;
  replyDate: string | null;
  avoidedOn: string | null;
  score: number | null;
  price: string | null;
  days: number | null;
  implementedOn: string | null;
  tba: boolean | null;
  ceType: string | null;
  category: string | null;
  quotationDue: string | null;
  assessmentDue: string | null;
  description: string | null;
  decision: string | null;
}

/** RFC 4180 parser: quoted fields, doubled quotes, embedded newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "").replace(/�/g, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* swallow */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const EW_REQUIRED = ["Ref", "Title", "Communicated", "Reply Due"];
const CE_REQUIRED = ["Ref", "Title", "Notification Date", "Price"];

export function detectKind(headers: string[]): CommercialKind | null {
  const h = new Set(headers.map((x) => x.trim()));
  if (EW_REQUIRED.every((k) => h.has(k))) return "ew";
  if (CE_REQUIRED.every((k) => h.has(k))) return "ce";
  return null;
}

function ukDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
function int(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
function money(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/[£,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}
function str(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}
function bool(v: string | undefined): boolean | null {
  const s = (v ?? "").trim().toUpperCase();
  return s === "TRUE" ? true : s === "FALSE" ? false : null;
}

export interface ParsedRegister {
  kind: CommercialKind;
  rows: CommercialRow[];
  warnings: string[];
  headers: string[];
}

export function parseCemarRegister(text: string, forcedKind?: CommercialKind): ParsedRegister {
  const table = parseCsv(text);
  if (table.length < 1) throw new Error("The file is empty.");
  const headers = table[0].map((h) => h.trim());
  const kind = forcedKind ?? detectKind(headers);
  if (!kind) {
    throw new Error(`Not a CEMAR EW or CE register — expected columns like ${EW_REQUIRED.join(", ")} or ${CE_REQUIRED.join(", ")}. Found: ${headers.slice(0, 8).join(", ")}.`);
  }
  const required = kind === "ew" ? EW_REQUIRED : CE_REQUIRED;
  const missing = required.filter((k) => !headers.includes(k));
  if (missing.length) throw new Error(`Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  const idx = (name: string) => headers.indexOf(name);
  const col = (r: string[], name: string) => (idx(name) >= 0 ? r[idx(name)] : undefined);
  const warnings: string[] = [];
  const rows: CommercialRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const ref = (col(r, "Ref") ?? "").trim() || `ROW-${i}`;
    const title = (col(r, "Title") ?? "").trim();
    if (!title && !col(r, "Event Id")) { warnings.push(`Row ${i + 1} skipped — no title or event id.`); continue; }
    if (seen.has(ref) && ref !== "DRAFT") warnings.push(`Duplicate ref ${ref} at row ${i + 1} — both kept.`);
    seen.add(ref);
    const base = {
      kind,
      eventId: int(col(r, "Event Id")),
      ref,
      crossRef: str(col(r, "Cross Ref")),
      title: title || "(untitled)",
      fromParty: str(col(r, "From")),
      author: str(col(r, "Author")),
      status: str(col(r, "Status"))?.toUpperCase() ?? null,
      description: str(col(r, "Description")),
      replyDue: null, replyDate: null, avoidedOn: null, score: null,
      price: null, days: null, implementedOn: null, tba: null, ceType: null, category: null, quotationDue: null, assessmentDue: null, decision: null,
      notifiedOn: null as string | null,
    };
    if (kind === "ew") {
      rows.push({
        ...base,
        notifiedOn: ukDate(col(r, "Communicated")),
        replyDue: ukDate(col(r, "Reply Due")),
        replyDate: ukDate(col(r, "Reply Date")),
        avoidedOn: ukDate(col(r, "Avoided / Passed")),
        score: int(col(r, "Score")),
        decision: str(col(r, "Reply Description")),
      });
    } else {
      rows.push({
        ...base,
        notifiedOn: ukDate(col(r, "Notification Date")),
        price: money(col(r, "Price")),
        days: int(col(r, "Days")),
        implementedOn: ukDate(col(r, "Implemented")),
        tba: bool(col(r, "TBA")),
        ceType: str(col(r, "Type")),
        category: str(col(r, "Category")),
        quotationDue: ukDate(col(r, "Quotation Due Date")),
        assessmentDue: ukDate(col(r, "Assessment Due Date")),
        decision: str(col(r, "Decision Description")),
      });
    }
  }
  if (rows.length === 0) warnings.push("No data rows found under the header.");
  return { kind, rows, warnings, headers };
}

// ─── Summary for desk + report ───────────────────────────────────────────────

export interface EwSummary {
  total: number;
  open: number; // communicated, not avoided/passed
  avoided: number;
  repliedOnTime: number;
  repliedLate: number;
  awaitingReply: number; // no reply yet, due in future
  replyOverdue: number; // no reply yet, past due
  avgReplyDays: number | null;
  raisedThisPeriod: number;
  closedThisPeriod: number;
}
export interface CeSummary {
  total: number;
  implemented: number;
  implementedValue: string; // decimal string
  implementedDays: number;
  outstanding: number; // notified, not implemented, not draft
  outstandingValue: string;
  draft: number;
  quotationOverdue: number;
  raisedThisPeriod: number;
  implementedThisPeriod: number;
  implementedValueThisPeriod: string;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const inPeriod = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;

export function summariseEw(rows: CommercialRow[], from: string, to: string, today: string): EwSummary {
  const ew = rows.filter((r) => r.kind === "ew");
  const isAvoided = (r: CommercialRow) => !!r.avoidedOn || (r.status ?? "").includes("AVOIDED");
  let onTime = 0, late = 0, awaiting = 0, overdue = 0;
  const replyDays: number[] = [];
  for (const r of ew) {
    if (r.replyDate) {
      if (r.replyDue && r.replyDate > r.replyDue) late++; else onTime++;
      if (r.notifiedOn) replyDays.push(daysBetween(r.notifiedOn, r.replyDate));
    } else if (!isAvoided(r)) {
      if (r.replyDue && r.replyDue < today) overdue++; else awaiting++;
    }
  }
  return {
    total: ew.length,
    open: ew.filter((r) => !isAvoided(r)).length,
    avoided: ew.filter(isAvoided).length,
    repliedOnTime: onTime,
    repliedLate: late,
    awaitingReply: awaiting,
    replyOverdue: overdue,
    avgReplyDays: replyDays.length ? Math.round(replyDays.reduce((a, b) => a + b, 0) / replyDays.length) : null,
    raisedThisPeriod: ew.filter((r) => inPeriod(r.notifiedOn, from, to)).length,
    closedThisPeriod: ew.filter((r) => inPeriod(r.avoidedOn, from, to)).length,
  };
}

export function summariseCe(rows: CommercialRow[], from: string, to: string, today: string): CeSummary {
  const ce = rows.filter((r) => r.kind === "ce");
  const isDraft = (r: CommercialRow) => (r.status ?? "") === "DRAFT" || r.ref === "DRAFT";
  const isImpl = (r: CommercialRow) => !!r.implementedOn || (r.status ?? "") === "IMPLEMENTED";
  const sum = (list: CommercialRow[]) => list.reduce((s, r) => s + (r.price ? Number(r.price) : 0), 0).toFixed(2);
  const impl = ce.filter(isImpl);
  const outstanding = ce.filter((r) => !isImpl(r) && !isDraft(r));
  const implThisPeriod = impl.filter((r) => inPeriod(r.implementedOn, from, to));
  return {
    total: ce.length,
    implemented: impl.length,
    implementedValue: sum(impl),
    implementedDays: impl.reduce((s, r) => s + (r.days ?? 0), 0),
    outstanding: outstanding.length,
    outstandingValue: sum(outstanding),
    draft: ce.filter(isDraft).length,
    quotationOverdue: outstanding.filter((r) => r.quotationDue && r.quotationDue < today).length,
    raisedThisPeriod: ce.filter((r) => inPeriod(r.notifiedOn, from, to)).length,
    implementedThisPeriod: implThisPeriod.length,
    implementedValueThisPeriod: sum(implThisPeriod),
  };
}

export function fmtGbp(decimal: string | number | null | undefined): string {
  if (decimal == null || decimal === "") return "—";
  const n = typeof decimal === "number" ? decimal : Number(decimal);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}
