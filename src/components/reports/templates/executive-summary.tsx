import { PageFooter, type ReportMeta } from "./report-shell";
import type { PeriodWeather } from "@/server/services/weather";

export interface SinceLastReport {
  reportNumber: number;
  periodEnd: string;
  completedDelta: number;
  progressDelta: number;
  newEvidence: number;
}

export interface HealthSafetyStats {
  accidents: number;
  nearMisses: number;
  riddor: number;
  toolboxTalks: number;
  inductions: number;
  note?: string;
}

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
  /** Movement since the previous completed report, when one exists. */
  sinceLastReport?: SinceLastReport | null;
  /** Period weather at the site location, when derivable. */
  weather?: PeriodWeather | null;
  /** Cumulative weather since project start, when the start predates the period. */
  weatherToDate?: (PeriodWeather & { since: string }) | null;
  /** PM-entered H&S figures, when provided. */
  healthSafety?: HealthSafetyStats | null;
  /** Site-diary labour aggregate (avg/peak operatives), when kept. */
  labour?: { avg: number; peak: number; daysCounted: number } | null;
  /** Current programme completion vs the accepted baseline, when one exists. */
  baseline?: BaselineComparison | null;
}

export interface BaselineComparison {
  setAt: string | null; // ISO datetime the baseline was snapshotted
  source: string; // "first-import" | "rebaseline"
  baselineCompletion: string | null; // ISO date — baseline programme end
  currentCompletion: string | null; // ISO date — current programme end
  /** Days the programmed completion has moved vs baseline (+ = later). */
  slipDays: number | null;
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

const DELTA_STRIP_H = 46;
const WEATHER_H = 100; // heading + two lines + source note
const HS_H = 130; // heading + stat row + optional note
const LABOUR_H = 46; // one-line strip, same shape as delta

type SummaryItem =
  | { type: "para"; text: string; withHeading: boolean }
  | { type: "stats" }
  | { type: "delta" }
  | { type: "labour" }
  | { type: "table" }
  | { type: "evidence" }
  | { type: "weather" }
  | { type: "hs" }
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
  blocks.push({
    item: { type: "stats" },
    // The baseline strip and the method-disclosure line under the cards
    // add their own height.
    height: STAT_CARDS_H + (stats.baseline ? 34 : 0) + 26,
  });
  if (stats.sinceLastReport) {
    blocks.push({ item: { type: "delta" }, height: DELTA_STRIP_H });
  }
  if (stats.labour) {
    blocks.push({ item: { type: "labour" }, height: LABOUR_H });
  }
  blocks.push({ item: { type: "table" }, height: TASK_TABLE_H });
  blocks.push({ item: { type: "evidence" }, height: EVIDENCE_H });
  if (stats.weather) {
    blocks.push({
      item: { type: "weather" },
      // The project-to-date line adds one row when present.
      height: stats.weatherToDate ? WEATHER_H + 18 : WEATHER_H,
    });
  }
  if (stats.healthSafety) {
    blocks.push({ item: { type: "hs" }, height: HS_H });
  }
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
      return (
        <div key={key}>
          <StatCards stats={stats} />
          {stats.baseline && <BaselineStrip baseline={stats.baseline} />}
          {/* Declared method — a disclosed simple measure is defensible;
              a silent one reads as false precision. */}
          <div
            style={{
              margin: stats.baseline ? "-14px 0 24px" : "-14px 0 24px",
              fontSize: 8.5,
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Method: progress figures are the simple average of activity
            percent-complete across the programme, unweighted by duration,
            quantity or value. Planned progress assumes linear elapsed time
            within each activity&apos;s programmed dates.
          </div>
        </div>
      );
    case "delta":
      return stats.sinceLastReport ? (
        <DeltaStrip key={key} delta={stats.sinceLastReport} />
      ) : null;
    case "labour":
      return stats.labour ? (
        <LabourStrip key={key} labour={stats.labour} />
      ) : null;
    case "table":
      return <TaskTable key={key} stats={stats} />;
    case "weather":
      return stats.weather ? (
        <WeatherBlock
          key={key}
          weather={stats.weather}
          toDate={stats.weatherToDate ?? null}
        />
      ) : null;
    case "hs":
      return stats.healthSafety ? (
        <HealthSafetyBlock key={key} hs={stats.healthSafety} />
      ) : null;
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

/** One-line planned-completion movement against the accepted baseline. */
function BaselineStrip({ baseline }: { baseline: BaselineComparison }) {
  if (!baseline.currentCompletion || !baseline.baselineCompletion) return null;
  const slip = baseline.slipDays ?? 0;
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return (
    <div
      style={{
        margin: "-14px 0 24px",
        padding: "8px 12px",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        fontSize: 10,
        color: "#475569",
        lineHeight: 1.6,
      }}
    >
      <strong>Programme completion:</strong> currently programmed for{" "}
      {fmt(baseline.currentCompletion)} —{" "}
      {slip === 0 ? (
        <span style={{ color: "#166534", fontWeight: 600 }}>
          in line with the baseline programme
        </span>
      ) : (
        <span style={{ color: slip > 0 ? "#991b1b" : "#166534", fontWeight: 600 }}>
          {Math.abs(slip)} day{Math.abs(slip) === 1 ? "" : "s"}{" "}
          {slip > 0 ? "later" : "earlier"} than the baseline programme
        </span>
      )}{" "}
      of {fmt(baseline.baselineCompletion)}
      {baseline.setAt
        ? ` (reference baseline ${baseline.source === "rebaseline" ? "re-set by the contractor" : "recorded at first import"})`
        : ""}
      .
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

function LabourStrip({
  labour,
}: {
  labour: { avg: number; peak: number; daysCounted: number };
}) {
  return (
    <div
      style={{
        margin: "0 0 20px",
        padding: "9px 14px",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        borderLeft: "3px solid var(--brand)",
        background: "#f8fafc",
        fontSize: 10.5,
        color: "#334155",
      }}
    >
      <strong>Resourcing</strong> (from daily site diaries): average{" "}
      <strong>{labour.avg}</strong> operatives on site, peak{" "}
      <strong>{labour.peak}</strong>, across {labour.daysCounted} recorded
      working day{labour.daysCounted === 1 ? "" : "s"}
    </div>
  );
}

function DeltaStrip({ delta }: { delta: SinceLastReport }) {
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return (
    <div
      style={{
        margin: "0 0 20px",
        padding: "9px 14px",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        borderLeft: "3px solid var(--brand)",
        background: "#f8fafc",
        fontSize: 10.5,
        color: "#334155",
      }}
    >
      <strong>Since Report #{delta.reportNumber}</strong> (period ended{" "}
      {formatPeriodDate(delta.periodEnd)}):{" "}
      {sign(delta.completedDelta)} activit
      {Math.abs(delta.completedDelta) === 1 ? "y" : "ies"} completed
      {" · "}overall progress {sign(delta.progressDelta)}%{" · "}
      {delta.newEvidence} new photo{delta.newEvidence === 1 ? "" : "s"}
    </div>
  );
}

function WeatherBlock({
  weather,
  toDate,
}: {
  weather: PeriodWeather;
  toDate: (PeriodWeather & { since: string }) | null;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3>Weather — Reporting Period</h3>
      <div style={{ fontSize: 11, lineHeight: 1.7, color: "#1e293b" }}>
        Rainfall of at least 1mm fell on <strong>{weather.wetDays}</strong> of{" "}
        {weather.daysCovered} recorded day{weather.daysCovered === 1 ? "" : "s"}
        {weather.heavyRainDays > 0 && (
          <>
            , including <strong>{weather.heavyRainDays}</strong> day
            {weather.heavyRainDays === 1 ? "" : "s"} of heavy rain (≥10mm)
          </>
        )}
        ; total precipitation <strong>{weather.totalPrecipMm}mm</strong>.
        Temperatures ranged {weather.minTempC}°C to {weather.maxTempC}°C
        {weather.frostDays > 0 && (
          <>
            , with <strong>{weather.frostDays}</strong> air-frost day
            {weather.frostDays === 1 ? "" : "s"}
          </>
        )}
        .
        {toDate && (
          <>
            {" "}
            Project to date (since{" "}
            {new Date(toDate.since).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            ): <strong>{toDate.totalPrecipMm}mm</strong> total precipitation
            across {toDate.wetDays} wet day{toDate.wetDays === 1 ? "" : "s"} in{" "}
            {toDate.daysCovered} recorded days.
          </>
        )}
      </div>
      <div style={{ fontSize: 8.5, color: "#94a3b8", marginTop: 4 }}>
        Source: Open-Meteo historical weather for the site location
        {weather.daysCovered < weather.totalDays
          ? ` (${weather.daysCovered} of ${weather.totalDays} period days with data)`
          : ""}
        .
      </div>
    </div>
  );
}

function HealthSafetyBlock({ hs }: { hs: HealthSafetyStats }) {
  const items = [
    { label: "Accidents", value: hs.accidents, alert: hs.accidents > 0 },
    { label: "Near Misses", value: hs.nearMisses, alert: hs.nearMisses > 0 },
    { label: "RIDDOR", value: hs.riddor, alert: hs.riddor > 0 },
    { label: "Toolbox Talks", value: hs.toolboxTalks, alert: false },
    { label: "Inductions", value: hs.inductions, alert: false },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <h3>Health &amp; Safety</h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              flex: 1,
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: it.alert ? "#fef2f2" : "#fff",
            }}
          >
            <div
              style={{
                fontSize: 8,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 2,
              }}
            >
              {it.label}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: it.alert ? "#991b1b" : "#0f172a",
              }}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>
      {hs.note && (
        <div style={{ fontSize: 10.5, color: "#334155", lineHeight: 1.6 }}>
          {hs.note}
        </div>
      )}
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
