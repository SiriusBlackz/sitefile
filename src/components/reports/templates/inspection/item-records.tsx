import { PageFooter } from "../report-shell";
import { type InspectionMeta, STATUS_LABEL, STATUS_BADGE, TYPE_LABEL, fmtDate, fmtDateTime } from "./inspection-meta";

export interface ItemPhoto {
  url: string;
  role: string;
  capturedAt: string | null;
  uploadedAt: string | null;
  hasGps: boolean;
  uploader: string | null;
  evidenceNo: number;
}

export interface ItemRecord {
  ref: string;
  type: string;
  title: string;
  status: string;
  locationLine: string;
  finding: string;
  suspectedCause: string | null;
  acceptanceBasis: string | null;
  interimAction: string | null;
  accessNote: string | null;
  responsible: string | null;
  repairTarget: string | null;
  correctionDue: string | null;
  notified: string | null;
  flags: string[];
  photos: ItemPhoto[];
  morePhotos: number;
  trail: { at: string; text: string }[];
}

// Calibrated against a rendered A4 page (Sep 2026): a record with no photo
// measures ~120px, a photo row adds ~200px, the usable page is ~930px.
const PAGE_BUDGET = 930;
const BASE_H = 105;
const PHOTO_ROW_H = 200;
const TRAIL_LINE_H = 12;

function recordHeight(r: ItemRecord): number {
  const textLines = Math.ceil((r.finding.length + (r.suspectedCause?.length ?? 0) + (r.interimAction?.length ?? 0)) / 95);
  return BASE_H + textLines * 14 + (r.photos.length ? PHOTO_ROW_H : 0) + Math.min(r.trail.length, 4) * TRAIL_LINE_H;
}

export function paginateItemRecords(records: ItemRecord[]): ItemRecord[][] {
  const pages: ItemRecord[][] = [];
  let cur: ItemRecord[] = [];
  let used = 0;
  for (const r of records) {
    const h = recordHeight(r);
    if (cur.length > 0 && used + h > PAGE_BUDGET) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(r);
    used += h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export function ItemRecordPages({ meta, records, startPage }: { meta: InspectionMeta; records: ItemRecord[]; startPage: number }) {
  const pages = paginateItemRecords(records);
  if (pages.length === 0) return null;
  return (
    <>
      {pages.map((page, pi) => (
        <div className="page" key={pi}>
          <h2>Item Records{pi > 0 ? " (continued)" : ""}</h2>
          {page.map((r) => (
            <div key={r.ref} className="evidence-card" style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>{r.ref}</span> · {r.title}
                </div>
                <span className={`badge ${STATUS_BADGE[r.status] ?? "badge-gray"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
                {TYPE_LABEL[r.type] ?? r.type} · {r.locationLine}
              </div>
              <div style={{ fontSize: 10.5, marginBottom: 4 }}><b>Finding.</b> {r.finding}</div>
              {r.suspectedCause && <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}><b>Suspected cause (not verified).</b> {r.suspectedCause}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", fontSize: 9.5, color: "#475569", marginBottom: 6 }}>
                <div><b>Acceptance basis:</b> {r.acceptanceBasis ?? "unconfirmed"}</div>
                <div><b>Responsible:</b> {r.responsible ?? "—"}</div>
                <div><b>Repair target:</b> {r.repairTarget ? fmtDate(r.repairTarget) : "—"}</div>
                <div><b>Contractual deadline:</b> {r.correctionDue ? `${fmtDate(r.correctionDue)} (computed — confirm with contract)` : "not confirmed"}</div>
                {r.notified && <div><b>Notified:</b> {r.notified}</div>}
                {r.interimAction && <div><b>Risk / interim action:</b> {r.interimAction}</div>}
                {r.accessNote && <div><b>Access:</b> {r.accessNote}</div>}
                {r.flags.length > 0 && <div><b>Flags:</b> {r.flags.join(", ")}</div>}
              </div>
              {r.photos.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  {r.photos.map((p) => (
                    <figure key={p.evidenceNo} style={{ width: `${Math.floor(100 / Math.max(r.photos.length, 2))}%`, maxWidth: 240 }}>
                      {meta.kind === "closeout" && (
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: p.role === "defect" ? "#b45309" : "#15803d", marginBottom: 2 }}>
                          {p.role === "defect" ? "As found" : p.role === "verified" ? "Verified" : "Reported rectified (not verified)"}
                        </div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
                      <img src={p.url} alt="" data-evidence style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} />
                      <figcaption className="text-xs text-muted" style={{ marginTop: 3, lineHeight: 1.4 }}>
                        P-{String(p.evidenceNo).padStart(2, "0")} · {p.role} · {p.capturedAt ? fmtDateTime(p.capturedAt) : "capture time not recorded"}{p.hasGps ? " · GPS" : ""}{p.uploader ? ` · ${p.uploader}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {r.morePhotos > 0 && <div className="text-xs text-muted" style={{ marginBottom: 4 }}>and {r.morePhotos} more photograph{r.morePhotos === 1 ? "" : "s"} on file.</div>}
              {r.trail.length > 0 && (
                <div style={{ fontSize: 9, color: "#64748b", borderTop: "1px dashed #e2e8f0", paddingTop: 4 }}>
                  {r.trail.slice(0, 4).map((t, i) => (
                    <div key={i}>{fmtDateTime(t.at)} — {t.text}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <PageFooter meta={meta} pageNum={startPage + pi} />
        </div>
      ))}
    </>
  );
}
