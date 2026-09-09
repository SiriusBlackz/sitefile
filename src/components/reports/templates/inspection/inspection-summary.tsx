import { PageFooter } from "../report-shell";
import type { InspectionMeta } from "./inspection-meta";
import { INSPECTION_FIXED_TEXT } from "@/lib/inspection-report-sections";

export interface InspectionSummaryData {
  total: number;
  verifiedClosed: number;
  readyForReview: number;
  openOrInProgress: number;
  reopened: number;
  otherDisposition: number;
  otherDispositionRefs: string[];
  overdue: number;
  overdueRefs: string[];
  flagged: { accessBlocked: string[]; disputed: string[]; awaitingTest: string[] };
  newThisVisit: number;
  closedThisVisit: number;
  byType: { type: string; count: number }[];
  withPhotos: number;
  urgentConcerns: string | null;
}

export function InspectionSummaryPage({ meta, data, startPage }: { meta: InspectionMeta; data: InspectionSummaryData; startPage: number }) {
  const tiles = [
    { label: "Items in scope", value: data.total, cls: "" },
    { label: "Verified closed", value: data.verifiedClosed, cls: "#166534" },
    { label: "Ready for review", value: data.readyForReview, cls: "#1e40af" },
    { label: "Open / in progress", value: data.openOrInProgress, cls: "#92400e" },
    { label: "Reopened", value: data.reopened, cls: "#991b1b" },
    { label: "Accepted as-is / void", value: data.otherDisposition, cls: "#475569" },
  ];
  const list = (refs: string[]) => (refs.length ? refs.join(", ") : "none");
  return (
    <div className="page">
      <h2>Summary at the Issue Date</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" }}>
            <div className="text-xs text-muted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: t.cls || "#0f172a" }}>{t.value}</div>
          </div>
        ))}
      </div>
      <p style={{ marginBottom: 14, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 9.5, color: "#475569" }}>
        {INSPECTION_FIXED_TEXT.summaryCounts}
      </p>

      <table style={{ marginBottom: 14 }}>
        <tbody>
          <tr><td style={{ width: "36%", fontWeight: 600 }}>New this visit</td><td>{data.newThisVisit}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Verified closed this visit</td><td>{data.closedThisVisit}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Overdue against a notified correction period</td><td>{data.overdue} — {list(data.overdueRefs)}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Access blocked (subset)</td><td>{list(data.flagged.accessBlocked)}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Disputed (subset)</td><td>{list(data.flagged.disputed)}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Awaiting test or record (subset)</td><td>{list(data.flagged.awaitingTest)}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Other authorised disposition</td><td>{data.otherDisposition} — {list(data.otherDispositionRefs)}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Items with photographs</td><td>{data.withPhotos} of {data.total}</td></tr>
        </tbody>
      </table>

      <h3>Items by type</h3>
      <table style={{ marginBottom: 14, maxWidth: 360 }}>
        <tbody>
          {data.byType.map((t) => (
            <tr key={t.type}><td style={{ fontWeight: 600 }}>{t.type}</td><td>{t.count}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Urgent concerns</h3>
      <p style={{ fontSize: 10.5 }}>{data.urgentConcerns || "None observed within the inspected scope."}</p>

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}
