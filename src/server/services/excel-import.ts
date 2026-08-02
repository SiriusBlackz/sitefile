import ExcelJS from "exceljs";
import type { ParsedTask } from "./programme-import";

export interface ColumnMapping {
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  progressPct: string | null;
  wbs: string | null;
  parent: string | null;
}

export interface ExcelInspection {
  status: "needs_mapping";
  headers: string[];
  sampleRows: Record<string, string>[];
  suggested: ColumnMapping;
  totalRows: number;
}

const HEADER_HINTS: Record<keyof ColumnMapping, RegExp[]> = {
  name: [/\b(task|activity|name|description|item)\b/i],
  plannedStart: [/\b(planned\s*start|start\s*date|start|begin)\b/i],
  plannedEnd: [/\b(planned\s*(end|finish)|end\s*date|finish|end|due)\b/i],
  progressPct: [/\b(%\s*complete|percent|progress|complete|done)\b/i],
  wbs: [/\b(wbs|outline|level|code)\b/i],
  parent: [/\b(parent|summary|group)\b/i],
};

function suggestMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {
    name: headers[0] ?? "",
    plannedStart: null,
    plannedEnd: null,
    progressPct: null,
    wbs: null,
    parent: null,
  };
  for (const field of Object.keys(HEADER_HINTS) as (keyof ColumnMapping)[]) {
    const patterns = HEADER_HINTS[field];
    const match = headers.find((h) => patterns.some((p) => p.test(h)));
    if (match) {
      result[field] = match;
    }
  }
  // If "name" wasn't matched by hint, keep the first header as a fallback.
  if (!HEADER_HINTS.name.some((p) => p.test(result.name))) {
    result.name = headers[0] ?? "";
  }
  return result;
}

async function loadFirstSheet(buf: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  // exceljs ships older Node Buffer typings; cast to match its expected shape.
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new Error("Excel file has no worksheets.");
  }
  return sheet;
}

function rowStrings(sheet: ExcelJS.Worksheet, r: number): string[] {
  const cells = sheet.getRow(r).values;
  const out: string[] = [];
  if (!Array.isArray(cells)) return out;
  for (let i = 1; i < cells.length; i++) {
    const v = cells[i];
    if (v == null) continue;
    out.push(cellToString(v as ExcelJS.CellValue).trim());
  }
  return out;
}

/**
 * Real spreadsheets rarely put headers in row 1 — title banners and merged
 * cells come first. Score the first rows by how many DISTINCT textual
 * column titles they contain and pick the best. A sheet whose best row has
 * fewer than 3 distinct text headers isn't a task table at all (usually a
 * "painted" calendar-grid programme) — reject it with guidance instead of
 * offering a mapping that can never work.
 */
export function findHeaderRow(sheet: ExcelJS.Worksheet): {
  rowNumber: number;
  headers: string[];
} {
  let best = { rowNumber: 1, headers: [] as string[], score: 0 };
  const maxScan = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= maxScan; r++) {
    const values = rowStrings(sheet, r).filter(Boolean);
    const textValues = values.filter((v) => !/^[\d.,/\-\s:%£$]+$/.test(v));
    const distinctText = new Set(textValues).size;
    if (distinctText > best.score) {
      best = { rowNumber: r, headers: values, score: distinctText };
    }
  }
  if (best.score < 3) {
    throw new Error(
      "This spreadsheet doesn't look like a task table — it appears to be a visual programme (a calendar grid with painted bars). Import the PDF version of the programme instead, or use a sheet with columns like Task, Start Date, End Date."
    );
  }
  return { rowNumber: best.rowNumber, headers: best.headers };
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val == null) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "object") {
    if ("text" in val && typeof val.text === "string") return val.text;
    if ("result" in val) return String((val as { result: unknown }).result ?? "");
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join("");
    }
  }
  return String(val);
}

function cellToDate(val: ExcelJS.CellValue): string | null {
  if (val == null) return null;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = cellToString(val).trim();
  if (!str) return null;
  // ISO already
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // DD/MM/YYYY (UK construction default per plan) and DD-MM-YYYY
  const ukDate = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (ukDate) {
    const [, d, m, y] = ukDate;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Fallback: let JS parse
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function cellToPct(val: ExcelJS.CellValue): number {
  if (val == null) return 0;
  if (typeof val === "number") {
    // Excel often stores percentages as fractions (0.5 = 50%)
    return val <= 1 ? Math.round(val * 100) : Math.min(Math.round(val), 100);
  }
  const str = cellToString(val).replace("%", "").trim();
  const n = Number(str);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

export async function inspectExcel(buf: Buffer): Promise<ExcelInspection> {
  const sheet = await loadFirstSheet(buf);
  const { rowNumber: headerRowNum, headers } = findHeaderRow(sheet);

  const sampleRows: Record<string, string>[] = [];
  // Sample up to 5 data rows below the detected header row.
  const maxSample = Math.min(sheet.rowCount, headerRowNum + 5);
  for (let r = headerRowNum + 1; r <= maxSample; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, string> = {};
    for (let c = 1; c <= headers.length; c++) {
      obj[headers[c - 1]] = cellToString(row.getCell(c).value);
    }
    sampleRows.push(obj);
  }

  return {
    status: "needs_mapping",
    headers,
    sampleRows,
    suggested: suggestMapping(headers),
    // Rows below the detected header row.
    totalRows: Math.max(0, sheet.rowCount - headerRowNum),
  };
}

function colIndex(headers: string[], header: string | null): number {
  if (!header) return -1;
  return headers.findIndex((h) => h === header);
}

export async function parseExcelWithMapping(
  buf: Buffer,
  mapping: ColumnMapping
): Promise<ParsedTask[]> {
  if (!mapping.name) {
    throw new Error("Task name column is required.");
  }
  const sheet = await loadFirstSheet(buf);
  const { rowNumber: headerRowNum, headers } = findHeaderRow(sheet);

  const idx = {
    name: colIndex(headers, mapping.name),
    start: colIndex(headers, mapping.plannedStart),
    end: colIndex(headers, mapping.plannedEnd),
    pct: colIndex(headers, mapping.progressPct),
    wbs: colIndex(headers, mapping.wbs),
    parent: colIndex(headers, mapping.parent),
  };

  if (idx.name < 0) {
    throw new Error(`Column "${mapping.name}" not found in sheet.`);
  }

  const result: ParsedTask[] = [];
  // exceljs columns are 1-indexed.
  const lastRow = sheet.rowCount;
  let sortOrder = 0;

  // For WBS-based hierarchy, build a map "1.2.3" -> sourceRef.
  const wbsToRef = new Map<string, string>();

  for (let r = headerRowNum + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const nameVal = cellToString(row.getCell(idx.name + 1).value).trim();
    if (!nameVal) continue; // skip blank rows

    const wbs =
      idx.wbs >= 0 ? cellToString(row.getCell(idx.wbs + 1).value).trim() : "";
    const sourceRef = wbs || `row-${r}`;

    let parentSourceRef: string | null = null;
    if (idx.wbs >= 0 && wbs) {
      // "1.2.3" -> parent "1.2"
      const lastDot = wbs.lastIndexOf(".");
      if (lastDot > 0) {
        const parentWbs = wbs.slice(0, lastDot);
        parentSourceRef = wbsToRef.get(parentWbs) ?? null;
      }
      wbsToRef.set(wbs, sourceRef);
    } else if (idx.parent >= 0) {
      const parentName = cellToString(row.getCell(idx.parent + 1).value).trim();
      // best-effort match by name (parent must appear earlier in the sheet)
      if (parentName) {
        const earlier = result.find((t) => t.name === parentName);
        parentSourceRef = earlier ? earlier.sourceRef : null;
      }
    }

    result.push({
      sourceRef,
      name: nameVal,
      parentSourceRef,
      plannedStart:
        idx.start >= 0 ? cellToDate(row.getCell(idx.start + 1).value) : null,
      plannedEnd:
        idx.end >= 0 ? cellToDate(row.getCell(idx.end + 1).value) : null,
      actualStart: null,
      actualEnd: null,
      progressPct:
        idx.pct >= 0 ? cellToPct(row.getCell(idx.pct + 1).value) : 0,
      sortOrder: sortOrder++,
    });
  }

  if (result.length === 0) {
    throw new Error(
      "No tasks found in spreadsheet. Check the column mapping and that the sheet has data rows below the header."
    );
  }

  return result;
}
