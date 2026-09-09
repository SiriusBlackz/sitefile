import { PageFooter } from "../report-shell";
import { type InspectionMeta, fmtDate } from "./inspection-meta";
import { INSPECTION_FIXED_TEXT } from "@/lib/inspection-report-sections";

export interface ScopeData {
  scopeNote: string | null;
  methodLine: string | null;
  weather: string | null;
  attendees: { name: string; org?: string; role?: string; authority?: string }[];
  notInspected: { area: string; reason?: string; owner?: string; followUp?: string }[];
  existingRecords: string | null;
}

export function ScopeLimitationsPage({ meta, data, startPage }: { meta: InspectionMeta; data: ScopeData; startPage: number }) {
  const cd = meta.contractDates;
  const flag = (ok: boolean) => (ok ? "confirmed" : "not confirmed");
  return (
    <div className="page">
      <h2>Scope, Method and Limitations</h2>

      <h3>Areas inspected</h3>
      <p style={{ marginBottom: 14, fontSize: 10.5 }}>{data.scopeNote || "As recorded against each item in the register. No separate scope statement was entered for this visit."}</p>

      <h3>Method and conditions</h3>
      <p style={{ marginBottom: 6, fontSize: 10.5 }}>{data.methodLine || "Visual walkover inspection from ground level and accessible positions; no opening up, testing or measurement beyond what is stated against an item."}</p>
      <p style={{ marginBottom: 14, fontSize: 10.5 }}>Weather and conditions: {data.weather || "not recorded"}.</p>
      <p style={{ marginBottom: 14, padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 9.5, color: "#475569" }}>
        {INSPECTION_FIXED_TEXT.scopeMethod}
      </p>

      <h3>Not inspected or not verified</h3>
      {data.notInspected.length === 0 ? (
        <p style={{ marginBottom: 14, fontSize: 10.5 }}>No areas were declared as not inspected for this visit.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead><tr><th>Area</th><th>Reason</th><th>Owner</th><th>Follow-up</th></tr></thead>
          <tbody>
            {data.notInspected.map((r, i) => (
              <tr key={i}><td>{r.area}</td><td>{r.reason ?? "—"}</td><td>{r.owner ?? "—"}</td><td>{r.followUp ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Attendance</h3>
      {data.attendees.length === 0 ? (
        <p style={{ marginBottom: 14, fontSize: 10.5 }}>Attendance was not recorded against this visit.</p>
      ) : (
        <table style={{ marginBottom: 14 }}>
          <thead><tr><th>Name</th><th>Organisation</th><th>Role at inspection</th><th>Decision authority</th></tr></thead>
          <tbody>
            {data.attendees.map((a, i) => (
              <tr key={i}><td>{a.name}</td><td>{a.org ?? "—"}</td><td>{a.role ?? "—"}</td><td>{a.authority ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Contract dates</h3>
      <table style={{ marginBottom: 14 }}>
        <tbody>
          <tr><td style={{ width: "40%", fontWeight: 600 }}>Contract form</td><td>{meta.contractFormLabel ?? "not set"}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Completion</td><td>{cd.completion ? `${fmtDate(cd.completion)} (${flag(cd.completionConfirmed)})` : "not confirmed"}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Defects date</td><td>{cd.defectsDate ? `${fmtDate(cd.defectsDate)} (${flag(cd.defectsConfirmed)})` : "not confirmed"}</td></tr>
          <tr><td style={{ fontWeight: 600 }}>Default correction period</td><td>{meta.defaultCorrectionPeriodDays ? `${meta.defaultCorrectionPeriodDays} days (project setting — confirm with contract)` : "not set"}</td></tr>
        </tbody>
      </table>

      <h3>Existing records</h3>
      <p style={{ fontSize: 10.5 }}>{data.existingRecords ?? "No earlier defects list was imported. Every item in this report was recorded by the inspection team through Sitefile on the visit date shown; nothing has been back-dated."}</p>

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}
