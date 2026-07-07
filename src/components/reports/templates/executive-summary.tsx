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

export function ExecutiveSummary({
  meta,
  stats,
  startPage,
}: {
  meta: ReportMeta;
  stats: SummaryStats;
  startPage: number;
}) {
  const varianceColor =
    stats.variance >= 0 ? "#166534" : stats.variance >= -10 ? "#92400e" : "#991b1b";
  const varianceBg =
    stats.variance >= 0 ? "#dcfce7" : stats.variance >= -10 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="page">
      <h2>Executive Summary</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 20 }}>
        Reporting period: {meta.periodStart} to {meta.periodEnd}
      </div>

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
          label="Evidence Items"
          value={String(stats.totalEvidence)}
          color="#6366f1"
        />
      </div>

      {/* Task breakdown */}
      <h3>Task Status Breakdown</h3>
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

      {/* Progress bar visual */}
      <h3>Overall Progress</h3>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            marginBottom: 4,
          }}
        >
          <span>Planned: {stats.averagePlannedProgress}%</span>
          <span>Actual: {stats.averageActualProgress}%</span>
        </div>
        <div style={{ position: "relative", height: 24, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${Math.min(stats.averagePlannedProgress, 100)}%`,
              background: "#bfdbfe",
              borderRadius: 6,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${Math.min(stats.averageActualProgress, 100)}%`,
              background: "#10b981",
              borderRadius: 6,
              opacity: 0.85,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 9, color: "#64748b", marginTop: 6 }}>
          <span>■ Planned</span>
          <span style={{ color: "#10b981" }}>■ Actual</span>
        </div>
      </div>

      {/* Evidence summary */}
      <h3>Evidence Summary</h3>
      <div style={{ marginBottom: 24, fontSize: 11 }}>
        <strong>{stats.evidenceThisPeriod}</strong> new evidence items uploaded during this
        reporting period, from a total of <strong>{stats.totalEvidence}</strong> project evidence
        items.
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
