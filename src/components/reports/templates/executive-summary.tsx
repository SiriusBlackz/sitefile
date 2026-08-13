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

/**
 * Height-budget pagination, same approach as the evidence gallery: the
 * narrative is free-length prose (especially AI drafts), so a fixed
 * one-page Executive Summary overflows the A4 box, breaks mid-section
 * across sheets, and throws every downstream page number off by one.
 * Pack blocks by estimated pixels instead; paragraphs and risk bullets
 * are the splittable units (never split mid-paragraph).
 */
const PAGE_BUDGET = 880; // usable px inside the A4 .page below the title
const PERIOD_LINE_H = 30;
const H3_H = 32; // section heading + margin
const STAT_CARDS_H = 122; // cards row + margin
const TASK_TABLE_H = 270; // heading + note + 4 rows + total + margin
const EVIDENCE_H = 78; // heading + line + margin

// ~110 chars/line at 11px in the 657px content column; 19px per line.
const paraHeight = (text: string) => Math.ceil(text.length / 110) * 19 + 10;
const riskHeight = (text: string) => Math.ceil(text.length / 105) * 20 + 6;

type SummaryItem =
  | { type: "para"; text: string; withHeading: boolean }
  | { type: "stats" }
  | { type: "table" }
  | { type: "evidence" }
  | { type: "risk"; text: string; withHeading: boolean };

export function paginateSummary(
  narrative: ReportNarrative,
  stats: SummaryStats
): SummaryItem[][] {
  // Flat block list with heights; headings ride with their first item so
  // a heading is never orphaned at the bottom of a page.
  const blocks: { item: SummaryItem; height: number }[] = [];
  narrative.paragraphs.forEach((p, i) => {
    blocks.push({
      item: { type: "para", text: p, withHeading: i === 0 },
      height: paraHeight(p) + (i === 0 ? H3_H : 0),
    });
  });
  blocks.push({ item: { type: "stats" }, height: STAT_CARDS_H });
  blocks.push({ item: { type: "table" }, height: TASK_TABLE_H });
  blocks.push({ item: { type: "evidence" }, height: EVIDENCE_H });
  stats.keyRisks.forEach((r, i) => {
    blocks.push({
      item: { type: "risk", text: r, withHeading: i === 0 },
      height: riskHeight(r) + (i === 0 ? H3_H : 0),
    });
  });

  const pages: SummaryItem[][] = [];
  let current: SummaryItem[] = [];
  // First page also carries the reporting-period line under the title.
  let used = PERIOD_LINE_H;
  for (const b of blocks) {
    if (current.length > 0 && used + b.height > PAGE_BUDGET) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(b.item);
    used += b.height;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

export function summaryPageCount(
  narrative: ReportNarrative,
  stats: SummaryStats
): number {
  return paginateSummary(narrative, stats).length;
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
  const pages = paginateSummary(narrative, stats);

  return (
    <>
      {pages.map((items, pageIdx) => (
        <div className="page" key={pageIdx}>
          <h2>
            Executive Summary
            {pageIdx > 0 ? " (continued)" : ""}
          </h2>
          {pageIdx === 0 && (
            <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Reporting period: {formatPeriodDate(meta.periodStart)} to{" "}
              {formatPeriodDate(meta.periodEnd)}
            </div>
          )}

          {items.map((item, i) => renderItem(item, i, stats))}

          <PageFooter meta={meta} pageNum={startPage + pageIdx} />
        </div>
      ))}
    </>
  );
}

function renderItem(item: SummaryItem, key: number, stats: SummaryStats) {
  switch (item.type) {
    case "para":
      return (
        <div key={key}>
          {item.withHeading && <h3>Progress This Period</h3>}
          <p style={{ fontSize: 11, lineHeight: 1.7, color: "#1e293b", margin: "0 0 10px" }}>
            {item.text}
          </p>
        </div>
      );
    case "stats":
      return <StatCards key={key} stats={stats} />;
    case "table":
      return <TaskTable key={key} stats={stats} />;
    case "evidence":
      return (
        <div key={key}>
          <h3>Evidence Summary</h3>
          <div style={{ marginBottom: 20, fontSize: 11 }}>
            <strong>{stats.evidenceThisPeriod}</strong> evidence item
            {stats.evidenceThisPeriod !== 1 ? "s" : ""} captured during this reporting
            period; <strong>{stats.totalEvidence}</strong> held on the project to date.
          </div>
        </div>
      );
    case "risk":
      return (
        <div key={key}>
          {item.withHeading && <h3>Key Risks & Observations</h3>}
          <ul style={{ paddingLeft: 18, fontSize: 11, lineHeight: 1.8, margin: 0 }}>
            <li style={{ marginBottom: 6 }}>{item.text}</li>
          </ul>
        </div>
      );
  }
}

function StatCards({ stats }: { stats: SummaryStats }) {
  const varianceColor =
    stats.variance >= 0 ? "#166534" : stats.variance >= -10 ? "#92400e" : "#991b1b";
  const varianceBg =
    stats.variance >= 0 ? "#dcfce7" : stats.variance >= -10 ? "#fef3c7" : "#fee2e2";
  return (
    <div style={{ display: "flex", gap: 12, margin: "4px 0 24px" }}>
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
  );
}

function TaskTable({ stats }: { stats: SummaryStats }) {
  return (
    <div>
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
