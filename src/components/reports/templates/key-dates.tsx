import { PageFooter, type ReportMeta } from "./report-shell";

/**
 * Key Dates & Milestones — the planned-vs-actual dates table clients read
 * first (modelled on the "Contract Dates" block of NEC-style progress
 * reports). One page; rows beyond the cap are summarised in a footnote.
 */

export interface KeyDateEntry {
  name: string;
  planned: string; // ISO date
  actual: string | null; // ISO date when actualised
  state: "actualised" | "overdue" | "forecast";
  /** Days late (+) or early (−); for overdue rows, days past planned as of the data date. */
  varianceDays: number;
  /** The accepted baseline's date for this milestone, when matched. */
  baseline?: string | null;
  /** Days the current planned date has moved vs baseline (+ = later). */
  baselineVarianceDays?: number | null;
}

export function KeyDatesPage({
  meta,
  entries,
  totalCount,
  dataDate,
  startPage,
  programmeElapsed = false,
  programmeLastDate = null,
}: {
  meta: ReportMeta;
  entries: KeyDateEntry[];
  /** Total milestones on the programme; entries may be a data-date-centred selection. */
  totalCount: number;
  dataDate: string;
  startPage: number;
  /** Every programmed date predates the reporting period. */
  programmeElapsed?: boolean;
  programmeLastDate?: string | null;
}) {
  const overflow = totalCount - entries.length;

  return (
    <div className="page">
      <h2>Key Dates &amp; Milestones</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Programme milestones against their planned dates, as of{" "}
        {formatDate(dataDate)} (data date).
      </div>

      {programmeElapsed && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            border: "1px solid #fcd34d",
            borderRadius: 6,
            background: "#fffbeb",
            fontSize: 10,
            color: "#92400e",
            lineHeight: 1.6,
          }}
        >
          The current programme revision ends
          {programmeLastDate ? ` on ${formatDate(programmeLastDate)}` : ""} —
          before this reporting period. Overdue variances below measure
          against that historical revision and should be read alongside a
          re-baselined programme, not as current forecast slippage.
        </div>
      )}

      {(() => {
        const hasBaseline = entries.some((e) => e.baseline != null);
        return (
          <table>
            <thead>
              <tr>
                <th>Milestone</th>
                {hasBaseline && <th style={{ textAlign: "right" }}>Baseline</th>}
                <th style={{ textAlign: "right" }}>
                  {hasBaseline ? "Current" : "Planned"}
                </th>
                <th style={{ textAlign: "right" }}>Actual</th>
                <th style={{ textAlign: "right" }}>Variance</th>
                <th style={{ textAlign: "right" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <MilestoneRow key={i} entry={e} showBaseline={hasBaseline} />
              ))}
            </tbody>
          </table>
        );
      })()}

      {overflow > 0 && (
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          {overflow} further milestone{overflow === 1 ? "" : "s"} not shown —
          the {entries.length} closest to the data date are listed above.
        </div>
      )}

      <div className="text-xs text-muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
        Variance compares the actual date against the planned date for
        actualised milestones. Milestones past their planned date without a
        recorded actual are shown as overdue, measured to the data date.
        Forecast milestones are yet to fall due and are assumed on plan
        unless flagged elsewhere in this report.
      </div>

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}

function MilestoneRow({
  entry,
  showBaseline = false,
}: {
  entry: KeyDateEntry;
  showBaseline?: boolean;
}) {
  const late = entry.varianceDays > 0;
  const early = entry.varianceDays < 0;

  let varianceText: string;
  let varianceColor: string;
  if (entry.state === "forecast") {
    varianceText = "—";
    varianceColor = "#64748b";
  } else if (entry.varianceDays === 0) {
    varianceText = "On time";
    varianceColor = "#166534";
  } else {
    const d = Math.abs(entry.varianceDays);
    varianceText = `${d}d ${late ? "late" : "early"}`;
    varianceColor = late ? "#991b1b" : "#166534";
  }

  const badge =
    entry.state === "actualised"
      ? { cls: early || entry.varianceDays === 0 ? "badge-green" : "badge-amber", label: "Actualised" }
      : entry.state === "overdue"
        ? { cls: "badge-red", label: "Overdue" }
        : { cls: "badge-gray", label: "Forecast" };

  const drift = entry.baselineVarianceDays ?? 0;
  return (
    <tr>
      <td>{entry.name}</td>
      {showBaseline && (
        <td style={{ textAlign: "right", whiteSpace: "nowrap", color: "#64748b" }}>
          {entry.baseline ? formatDate(entry.baseline) : "—"}
        </td>
      )}
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {formatDate(entry.planned)}
        {showBaseline && entry.baseline && drift !== 0 && (
          <span
            style={{
              marginLeft: 4,
              fontSize: 8,
              fontWeight: 600,
              color: drift > 0 ? "#991b1b" : "#166534",
            }}
          >
            {drift > 0 ? "+" : "−"}
            {Math.abs(drift)}d
          </span>
        )}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {entry.actual ? formatDate(entry.actual) : "—"}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: varianceColor }}>
        {varianceText}
      </td>
      <td style={{ textAlign: "right" }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </td>
    </tr>
  );
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
