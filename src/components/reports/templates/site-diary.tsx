import { PageFooter, type ReportMeta } from "./report-shell";

/**
 * Site Diary Summary — one row per working day, PRE-AGGREGATED across
 * authors at the data layer. The client PDF never carries author names
 * or per-person gaps: coverage is one aggregate line (the disclosure
 * rule). Weather comes from each entry's own AUTO snapshot.
 */
export interface SiteDiaryDay {
  date: string; // YYYY-MM-DD (site-local working day)
  /** Sum of labour counts across locked entries that day. */
  labour: number | null;
  plant: number | null;
  /** From the day's entries' frozen AUTO weather snapshot. */
  weather: { precipMm: number; minC: number; maxC: number } | null;
  hoursLost: number;
  causes: string[]; // human labels, deduped
  /** "record" = >=1 locked entry; "late" = all records entered late;
   * "none" = no record made (declared, never hidden). */
  status: "record" | "late" | "none";
  amended: boolean;
}

export interface SiteDiaryData {
  days: SiteDiaryDay[];
  workingDayCount: number;
  daysWithRecord: number;
  hoursLostTotal: number;
  labourAvg: number | null;
  labourPeak: number | null;
  incidents: number;
  toolboxTalks: number;
  inspections: number;
  amendedCount: number;
  lateCount: number;
}

const ROWS_FIRST_PAGE = 20;
const ROWS_PER_PAGE = 26;

/** Shared with renderReportHTML so TOC page numbers match the packing. */
export function siteDiaryPageCount(data: SiteDiaryData | null): number {
  if (!data || data.days.length === 0) return 1; // empty state page
  const rows = data.days.length;
  if (rows <= ROWS_FIRST_PAGE) return 1;
  return 1 + Math.ceil((rows - ROWS_FIRST_PAGE) / ROWS_PER_PAGE);
}

function fmtDay(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SiteDiaryPages({
  meta,
  data,
  startPage,
}: {
  meta: ReportMeta;
  data: SiteDiaryData | null;
  startPage: number;
}) {
  if (!data || data.days.length === 0) {
    return (
      <div className="page">
        <h2>Site Diary Summary</h2>
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            fontSize: 10,
            color: "#64748b",
            lineHeight: 1.7,
          }}
        >
          No daily site diary records were kept during this reporting
          period. Once the site team locks daily diaries in Sitefile, this
          page carries a day-by-day record of labour, weather and
          disruption — contemporaneous evidence for the period.
        </div>
        <PageFooter meta={meta} pageNum={startPage} />
      </div>
    );
  }

  // Paginate rows.
  const pages: SiteDiaryDay[][] = [];
  let rest = [...data.days];
  pages.push(rest.slice(0, ROWS_FIRST_PAGE));
  rest = rest.slice(ROWS_FIRST_PAGE);
  while (rest.length > 0) {
    pages.push(rest.slice(0, ROWS_PER_PAGE));
    rest = rest.slice(ROWS_PER_PAGE);
  }

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "5px 8px",
    fontSize: 8,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#64748b",
    borderBottom: "2px solid #191C20",
  };
  const td: React.CSSProperties = {
    padding: "5px 8px",
    fontSize: 9.5,
    borderBottom: "1px solid #e2e8f0",
    color: "#1e293b",
  };

  return (
    <>
      {pages.map((rows, pageIdx) => (
        <div className="page" key={pageIdx}>
          <h2>
            Site Diary Summary
            {pageIdx > 0 ? " (continued)" : ""}
          </h2>
          {pageIdx === 0 && (
            <>
              <p style={{ fontSize: 10.5, color: "#475569", margin: "6px 0 4px" }}>
                Daily site records kept by the site team during the period —
                locked on the day and preserved unedited (later corrections
                appear as flagged amendments ◆).
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 18,
                  margin: "10px 0 14px",
                  padding: "10px 14px",
                  background: "#F2F1ED",
                  borderRadius: 8,
                  fontSize: 10,
                }}
              >
                <span>
                  <strong>
                    {data.daysWithRecord} of {data.workingDayCount}
                  </strong>{" "}
                  working days on record
                  {data.daysWithRecord < data.workingDayCount
                    ? " — remaining days declared as no record made"
                    : ""}
                </span>
                {data.labourAvg != null && (
                  <span>
                    Labour avg <strong>{data.labourAvg}</strong>
                    {data.labourPeak != null ? ` · peak ${data.labourPeak}` : ""}
                  </span>
                )}
                <span>
                  Disruption <strong>{data.hoursLostTotal}h</strong>
                </span>
                <span>
                  Incidents <strong>{data.incidents}</strong> · Toolbox talks{" "}
                  <strong>{data.toolboxTalks}</strong>
                </span>
              </div>
            </>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Day</th>
                <th style={{ ...th, textAlign: "right" }}>Labour</th>
                <th style={{ ...th, textAlign: "right" }}>Plant</th>
                <th style={th}>Weather</th>
                <th style={th}>Hold-ups</th>
                <th style={th}>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date}>
                  <td style={td}>{fmtDay(d.date)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {d.labour ?? "—"}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {d.plant ?? "—"}
                  </td>
                  <td style={td}>
                    {d.weather
                      ? `${d.weather.precipMm}mm · ${d.weather.minC}–${d.weather.maxC}°C`
                      : "—"}
                  </td>
                  <td style={{ ...td, color: d.hoursLost > 0 ? "#b91c1c" : "#1e293b" }}>
                    {d.hoursLost > 0
                      ? `${d.hoursLost}h — ${d.causes.join(", ")}`
                      : "None recorded"}
                  </td>
                  <td style={td}>
                    {d.status === "none" ? (
                      <span style={{ color: "#b91c1c" }}>No record made</span>
                    ) : (
                      <span style={{ color: "#15803d" }}>
                        On record
                        {d.status === "late" ? " †" : ""}
                        {d.amended ? " ◆" : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageIdx === pages.length - 1 && (
            <p style={{ fontSize: 8.5, color: "#94a3b8", marginTop: 10 }}>
              Weather figures are recorded automatically from Open-Meteo for
              the site location at the time each diary locks. † entered
              after the day · ◆ amended after locking (original preserved).
              {data.lateCount > 0
                ? ` ${data.lateCount} record${data.lateCount === 1 ? "" : "s"} entered late.`
                : ""}
            </p>
          )}
          <PageFooter meta={meta} pageNum={startPage + pageIdx} />
        </div>
      ))}
    </>
  );
}
