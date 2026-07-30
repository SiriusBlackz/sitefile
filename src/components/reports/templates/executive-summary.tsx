import { PageFooter, type ReportMeta } from "./report-shell";

export interface SummaryStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  delayedTasks: number;
  notStartedTasks: number;
  averagePlannedProgress: number;
  averageActualProgress: number;
  variance: number;
  totalEvidence: number;
  evidenceThisPeriod: number;
  keyRisks: string[];
}

export interface ReportNarrative {
  paragraphs: string[];
}

export function ExecutiveSummary({
  meta,
  stats,
  narrative,
  startPage,
}: {
  meta: ReportMeta;
  stats: SummaryStats;
  narrative: ReportNarrative;
  startPage: number;
}) {
  const varianceColor =
    stats.variance >= 0 ? "#166534" : stats.variance >= -10 ? "#92400e" : "#991b1b";
  const varianceBg =
    stats.variance >= 0 ? "#dcfce7" : stats.variance >= -10 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="page">
      <h2>Executive Summary</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Reporting period: {formatPeriodDate(meta.periodStart)} to{" "}
        {formatPeriodDate(meta.periodEnd)}
      </div>

      {/* Narrative — what actually happened this period, in prose */}
      {narrative.paragraphs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3>Progress This Period</h3>
          {narrative.paragraphs.map((p, i) => (
            <p
              key={i}
              style={{ fontSize: 11, lineHeight: 1.7, color: "#1e293b", margin: "0 0 8px" }}
            >
              {p}
            </p>
          ))}
        </div>
      )}

      {/* Progress overview cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Planned Progress"
          value={`${stats.averagePlannedProgress}%`}
          color="#3b82f6"
        />
        <StatCard
          label="Actual Progress"
          value={`${stats.averageActualProgress}%`}
          color="#10b981"
        />
        <StatCard
          label="Variance"
          value={`${stats.variance >= 0 ? "+" : ""}${stats.variance}%`}
          color={varianceColor}
          bg={varianceBg}
        />
        <StatCard
          label="Evidence (This Period)"
          value={String(stats.evidenceThisPeriod)}
          color="#6366f1"
        />
      </div>

      {/* Task breakdown */}
      <h3>Task Status Breakdown</h3>
      <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
        Site activities only — phase headings are excluded from the counts.
      </div>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Count</th>
            <th style={{ textAlign: "right" }}>Percentage</th>
          </tr>
        </thead>
        <tbody>
          <StatusRow
            label="Completed"
            count={stats.completedTasks}
            total={stats.totalTasks}
            badgeClass="badge-green"
          />
          <StatusRow
            label="In Progress"
            count={stats.inProgressTasks}
            total={stats.totalTasks}
            badgeClass="badge-blue"
          />
          <StatusRow
            label="Delayed"
            count={stats.delayedTasks}
            total={stats.totalTasks}
            badgeClass="badge-red"
          />
          <StatusRow
            label="Not Started"
            count={stats.notStartedTasks}
            total={stats.totalTasks}
            badgeClass="badge-gray"
          />
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 600, borderTop: "2px solid #e2e8f0", paddingTop: 8 }}>
              Total
            </td>
            <td
              style={{
                textAlign: "right",
                fontWeight: 600,
                borderTop: "2px solid #e2e8f0",
                paddingTop: 8,
              }}
            >
              {stats.totalTasks}
            </td>
            <td
              style={{
                textAlign: "right",
                borderTop: "2px solid #e2e8f0",
                paddingTop: 8,
              }}
            >
              100%
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Evidence summary */}
      <h3>Evidence Summary</h3>
      <div style={{ marginBottom: 20, fontSize: 11 }}>
        <strong>{stats.evidenceThisPeriod}</strong> evidence item
        {stats.evidenceThisPeriod !== 1 ? "s" : ""} captured during this reporting period;{" "}
        <strong>{stats.totalEvidence}</strong> held on the project to date.
      </div>

      {/* Key risks */}
      {stats.keyRisks.length > 0 && (
        <>
          <h3>Key Risks & Observations</h3>
          <ul style={{ paddingLeft: 18, fontSize: 11, lineHeight: 1.8 }}>
            {stats.keyRisks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        </>
      )}

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}

function formatPeriodDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string;
  color: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "14px 16px",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        background: bg ?? "#fff",
      }}
    >
      <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function StatusRow({
  label,
  count,
  total,
  badgeClass,
}: {
  label: string;
  count: number;
  total: number;
  badgeClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <tr>
      <td>
        <span className={`badge ${badgeClass}`}>{label}</span>
      </td>
      <td style={{ textAlign: "right" }}>{count}</td>
      <td style={{ textAlign: "right" }}>{pct}%</td>
    </tr>
  );
}
