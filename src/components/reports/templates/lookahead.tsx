import { PageFooter, type ReportMeta } from "./report-shell";

/**
 * Lookahead — activities the reader should expect on site next period,
 * derived from the programme (the "next period lookahead" block every
 * NEC-style progress report carries). The window mirrors the reporting
 * period length. One page; rows beyond the cap are summarised in a
 * footnote.
 */

export interface LookaheadEntry {
  name: string;
  plannedStart: string | null; // ISO date
  plannedEnd: string | null; // ISO date
  /** Null for milestone rows — a moment, not a measured activity. */
  progressPct: number | null;
  kind: "start" | "continue" | "complete" | "milestone";
  /** The date driving this row has already passed at the data date. */
  late: boolean;
}

export function LookaheadPage({
  meta,
  entries,
  totalCount,
  windowStart,
  windowEnd,
  startPage,
  programmeElapsed = false,
  programmeLastDate = null,
}: {
  meta: ReportMeta;
  entries: LookaheadEntry[];
  /** Total qualifying activities; entries may be capped to fit the page. */
  totalCount: number;
  windowStart: string;
  windowEnd: string;
  startPage: number;
  /** Every programmed date predates the reporting period. */
  programmeElapsed?: boolean;
  programmeLastDate?: string | null;
}) {
  const overflow = totalCount - entries.length;

  return (
    <div className="page">
      <h2>Lookahead — Next Period</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Programme activities falling due between {formatDate(windowStart)} and{" "}
        {formatDate(windowEnd)}.
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
          before this reporting period. Nothing is programmed within the
          lookahead window, so the items below are carried over from the
          previous revision. A re-baselined programme is required for a
          meaningful forecast.
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Activity</th>
            <th style={{ textAlign: "right" }}>Start</th>
            <th style={{ textAlign: "right" }}>Finish</th>
            <th style={{ textAlign: "right" }}>Progress</th>
            <th style={{ textAlign: "right" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <LookaheadRow key={i} entry={e} />
          ))}
        </tbody>
      </table>

      {overflow > 0 && (
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          {overflow} further activit{overflow === 1 ? "y" : "ies"} also fall
          {overflow === 1 ? "s" : ""} within this window — the{" "}
          {entries.length} earliest-due are listed above.
        </div>
      )}

      <div className="text-xs text-muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
        Derived from the current programme: activities due to start, continue
        or complete within the window, and milestones falling due. Items
        marked late start or overdue were programmed for the current period
        and are expected to carry into the next; dates reflect the programme
        as imported, not a revised forecast.
      </div>

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}

function LookaheadRow({ entry }: { entry: LookaheadEntry }) {
  const badge = entry.late
    ? { cls: "badge-red", label: entry.kind === "start" ? "Late start" : "Overdue" }
    : entry.kind === "start"
      ? { cls: "badge-green", label: "Due to start" }
      : entry.kind === "continue"
        ? { cls: "badge-gray", label: "Continuing" }
        : entry.kind === "complete"
          ? { cls: "badge-amber", label: "Due to complete" }
          : { cls: "badge-blue", label: "Milestone due" };

  return (
    <tr>
      <td>{entry.name}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {entry.plannedStart ? formatDate(entry.plannedStart) : "—"}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {entry.plannedEnd ? formatDate(entry.plannedEnd) : "—"}
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {entry.progressPct == null ? "—" : `${entry.progressPct}%`}
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
