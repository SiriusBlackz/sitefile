import { PageFooter, type ReportMeta } from "./report-shell";

/**
 * Key Issues & Early Warnings — the PM's issues list (modelled on the
 * "Key Issues" section of NEC-style progress reports). Entries are
 * seeded from the programme in the generate dialog and edited by the
 * PM, so they carry commercial matters the programme can't derive
 * (EWNs, decisions awaited, holdups). One page; the generate input is
 * capped well inside the page budget.
 */

export function KeyIssuesPage({
  meta,
  issues,
  startPage,
}: {
  meta: ReportMeta;
  issues: string[];
  startPage: number;
}) {
  return (
    <div className="page">
      <h2>Key Issues &amp; Early Warnings</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Matters requiring the project team&apos;s attention, as recorded at
        report generation.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {issues.map((issue, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 14px",
              border: "1px solid #e2e8f0",
              borderLeft: "3px solid var(--brand)",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                minWidth: 18,
              }}
            >
              {i + 1}.
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: "#1e293b" }}>
              {issue}
            </div>
          </div>
        ))}
      </div>

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}
