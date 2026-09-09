import { PageFooter } from "../report-shell";
import { type InspectionMeta, STATUS_LABEL, fmtDate } from "./inspection-meta";
import { INSPECTION_FIXED_TEXT } from "@/lib/inspection-report-sections";

export interface UnresolvedRow {
  ref: string;
  status: string;
  reason: string;
  nextAction: string | null;
  owner: string | null;
  due: string | null;
}

export interface DecisionsData {
  unresolved: UnresolvedRow[];
  formalDecisions: string[];
}

const MAX_ROWS = 26;

export function DecisionsPage({ meta, data, startPage }: { meta: InspectionMeta; data: DecisionsData; startPage: number }) {
  const rows = data.unresolved.slice(0, MAX_ROWS);
  const more = data.unresolved.length - rows.length;
  return (
    <div className="page">
      <h2>Decisions and Outstanding Matters</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
        Report #{meta.reportNumber}, revision {meta.revision}, visit {fmtDate(meta.visitDate)}. Decisions apply only to the items listed in this report and the evidence cited.
      </div>

      <h3>Items remaining unresolved</h3>
      {rows.length === 0 ? (
        <p style={{ marginBottom: 12, fontSize: 10.5 }}>No unresolved items within the inspected scope at the issue date.</p>
      ) : (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th style={{ width: "10%" }}>Ref</th><th style={{ width: "14%" }}>Status</th><th>Reason and next action</th><th style={{ width: "16%" }}>Owner</th><th style={{ width: "12%" }}>Date</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref}>
                <td style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{r.ref}</td>
                <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                <td>{r.reason}{r.nextAction ? ` — ${r.nextAction}` : ""}</td>
                <td>{r.owner ?? "—"}</td>
                <td>{r.due ? fmtDate(r.due) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && <div className="text-xs text-muted" style={{ marginBottom: 12 }}>and {more} more unresolved items — see the register.</div>}

      <h3>Formal decisions referenced</h3>
      {data.formalDecisions.length === 0 ? (
        <p style={{ marginBottom: 12, fontSize: 10.5 }}>None recorded. No item in this report has been accepted as-is or voided, and no notice or certificate is referenced.</p>
      ) : (
        <ul style={{ marginBottom: 12, paddingLeft: 16, fontSize: 10.5 }}>
          {data.formalDecisions.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}

      <div style={{ padding: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 9, color: "#475569", lineHeight: 1.7 }}>
        {INSPECTION_FIXED_TEXT.signatures}
      </div>
      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}
