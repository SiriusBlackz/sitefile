import { PageFooter } from "../report-shell";
import { type InspectionMeta, STATUS_LABEL, STATUS_BADGE, TYPE_LABEL, fmtDate } from "./inspection-meta";

export interface RegisterRow {
  ref: string;
  locationLine: string;
  type: string;
  title: string;
  priority: string | null;
  responsible: string | null;
  status: string;
  repairTarget: string | null;
  correctionDue: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

const ROWS_PER_PAGE = 16;

export function paginateRegister(rows: RegisterRow[]): RegisterRow[][] {
  const pages: RegisterRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  return pages.length ? pages : [[]];
}

export function DefectRegisterPages({ meta, rows, startPage }: { meta: InspectionMeta; rows: RegisterRow[]; startPage: number }) {
  const pages = paginateRegister(rows);
  return (
    <>
      {pages.map((page, pi) => (
        <div className="page" key={pi}>
          <h2>Defect Register{pi > 0 ? " (continued)" : ""}</h2>
          {pi === 0 && (
            <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
              One row per item, ordered by location then reference. Repair targets are operational dates; a correction due date is only shown where the item has been formally notified.
            </div>
          )}
          {page.length === 0 ? (
            <p style={{ fontSize: 10.5 }}>No items were recorded on this visit.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: "9%" }}>Ref</th>
                  <th style={{ width: "24%" }}>Location</th>
                  <th style={{ width: "8%" }}>Type</th>
                  <th>Finding</th>
                  <th style={{ width: "12%" }}>Responsible</th>
                  <th style={{ width: "12%" }}>Status</th>
                  <th style={{ width: "11%" }}>Target / due</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.ref}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{r.ref}</td>
                    <td>{r.locationLine}</td>
                    <td>{TYPE_LABEL[r.type] ?? r.type}</td>
                    <td>{r.title}{r.priority ? <span className="text-xs text-muted"> · {r.priority}</span> : null}</td>
                    <td>{r.responsible ?? "—"}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status] ?? "badge-gray"}`}>{STATUS_LABEL[r.status] ?? r.status}</span>{r.verifiedAt ? <div className="text-xs text-muted">{fmtDate(r.verifiedAt)}{r.verifiedBy ? ` · ${r.verifiedBy}` : ""}</div> : null}</td>
                    <td>{r.repairTarget ? fmtDate(r.repairTarget) : "—"}{r.correctionDue ? <div className="text-xs text-muted">due {fmtDate(r.correctionDue)}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PageFooter meta={meta} pageNum={startPage + pi} />
        </div>
      ))}
    </>
  );
}
