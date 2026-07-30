import { PageFooter, type ReportMeta } from "./report-shell";

export interface BeforeAfterPair {
  taskId: string;
  taskName: string;
  zoneName: string | null;
  before: {
    publicUrl: string;
    capturedAt: string;
    filename: string | null;
  };
  after: {
    publicUrl: string;
    capturedAt: string;
    filename: string | null;
  };
}

export function BeforeAfterPage({
  meta,
  pairs,
  startPage,
}: {
  meta: ReportMeta;
  pairs: BeforeAfterPair[];
  startPage: number;
}) {
  // 2 pairs per page
  const pairsPerPage = 2;
  const pages: { items: BeforeAfterPair[]; pageNum: number }[] = [];
  for (let i = 0; i < pairs.length; i += pairsPerPage) {
    pages.push({
      items: pairs.slice(i, i + pairsPerPage),
      pageNum: startPage + Math.floor(i / pairsPerPage),
    });
  }

  if (pages.length === 0) {
    return null;
  }

  return (
    <>
      {pages.map((page, pi) => (
        <div className="page" key={pi}>
          {pi === 0 && <h2>Before & After Comparison</h2>}
          {pi === 0 && (
            <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Earliest and latest evidence per task within the same GPS zone
            </div>
          )}
          {pi === 0 && pairs.length <= 2 && (
            <div
              style={{
                fontSize: 10,
                color: "#64748b",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "10px 14px",
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              Pairs are generated automatically once a task has two or more
              photos captured in the same site zone. Additional comparisons
              will appear in future reports as evidence accumulates.
            </div>
          )}

          {page.items.map((pair, idx) => (
            <div
              key={`${pair.taskId}-${idx}`}
              className="ba-pair"
              style={{
                marginBottom: 28,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "10px 14px",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: 12, color: "#0f172a" }}>
                    {pair.taskName}
                  </span>
                  {pair.zoneName && (
                    <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                      Zone: {pair.zoneName}
                    </span>
                  )}
                </div>
              </div>

              {/* Side-by-side images */}
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, borderRight: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "6px 0",
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#475569",
                      background: "#fef3c7",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Before — {formatDate(pair.before.capturedAt)}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
                  <img
                    src={pair.before.publicUrl}
                    alt={pair.before.filename ?? "Before"}
                    data-evidence="true"
                    style={{
                      width: "100%",
                      height: 200,
                      objectFit: "cover",
                      display: "block",
                      background: "#f1f5f9",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "6px 0",
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#475569",
                      background: "#dcfce7",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    After — {formatDate(pair.after.capturedAt)}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
                  <img
                    src={pair.after.publicUrl}
                    alt={pair.after.filename ?? "After"}
                    data-evidence="true"
                    style={{
                      width: "100%",
                      height: 200,
                      objectFit: "cover",
                      display: "block",
                      background: "#f1f5f9",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}

          <PageFooter meta={meta} pageNum={page.pageNum} />
        </div>
      ))}
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
