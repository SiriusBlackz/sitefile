import { PageFooter, type ReportMeta } from "./report-shell";

export interface TocEntry {
  title: string;
  page: number;
  indent?: boolean;
}

export interface OmittedSection {
  title: string;
  reason: string;
}

export function TableOfContents({
  meta,
  entries,
  omitted = [],
}: {
  meta: ReportMeta;
  entries: TocEntry[];
  /** Recipe sections dropped for lack of data — declared, not vanished. */
  omitted?: OmittedSection[];
}) {
  return (
    <div className="page">
      <h2 style={{ marginBottom: 24 }}>Contents</h2>

      <div style={{ maxWidth: 500 }}>
        {entries.map((entry, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "baseline",
              padding: "8px 0",
              borderBottom: "1px solid #f1f5f9",
              paddingLeft: entry.indent ? 16 : 0,
            }}
          >
            <span
              style={{
                fontSize: entry.indent ? 10 : 12,
                fontWeight: entry.indent ? 400 : 600,
                color: entry.indent ? "#475569" : "#0f172a",
              }}
            >
              {entry.title}
            </span>
            <span
              style={{
                flex: 1,
                borderBottom: "1px dotted #cbd5e1",
                margin: "0 8px",
                minWidth: 40,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#475569",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entry.page}
            </span>
          </div>
        ))}
      </div>

      {omitted.length > 0 && (
        <div
          style={{
            maxWidth: 500,
            marginTop: 28,
            padding: "12px 16px",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#f8fafc",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Not included this period
          </div>
          {omitted.map((o, i) => (
            <div
              key={i}
              style={{ fontSize: 10, color: "#64748b", lineHeight: 1.7 }}
            >
              <span style={{ fontWeight: 600, color: "#475569" }}>{o.title}</span>
              {" — "}
              {o.reason}
            </div>
          ))}
        </div>
      )}

      <PageFooter meta={meta} pageNum={2} />
    </div>
  );
}
