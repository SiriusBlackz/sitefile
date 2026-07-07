import { PageFooter, type ReportMeta } from "./report-shell";

export interface GalleryTask {
  id: string;
  name: string;
  evidence: GalleryEvidence[];
}

export interface GalleryEvidence {
  id: string;
  publicUrl: string;
  originalFilename: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  uploaderName: string | null;
  uploaderRole: string | null;
  note: string | null;
}

/** A slice of one task's photos that fits on a single gallery page. */
export interface GalleryChunk {
  taskId: string;
  taskName: string;
  totalItems: number;
  continued: boolean;
  evidence: GalleryEvidence[];
}

/** Photos per A4 page: 2 columns × 3 rows of card+metadata. */
const PHOTOS_PER_PAGE = 6;

/**
 * Pure pagination shared by this component and renderReportHTML's TOC
 * math — the TOC's page numbers are only correct if both sides agree on
 * the packing. Oversized tasks split across pages with a "(continued)"
 * header instead of overflowing a fixed A4 box.
 */
export function paginateGallery(tasks: GalleryTask[]): GalleryChunk[][] {
  const pages: GalleryChunk[][] = [];
  let current: GalleryChunk[] = [];
  let used = 0;

  for (const task of tasks) {
    let offset = 0;
    while (offset < task.evidence.length) {
      if (used >= PHOTOS_PER_PAGE) {
        pages.push(current);
        current = [];
        used = 0;
      }
      const take = Math.min(PHOTOS_PER_PAGE - used, task.evidence.length - offset);
      current.push({
        taskId: task.id,
        taskName: task.name,
        totalItems: task.evidence.length,
        continued: offset > 0,
        evidence: task.evidence.slice(offset, offset + take),
      });
      used += take;
      offset += take;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

export function EvidenceGalleryPage({
  meta,
  tasks,
  startPage,
}: {
  meta: ReportMeta;
  tasks: GalleryTask[];
  startPage: number;
}) {
  const pages = paginateGallery(tasks);

  if (pages.length === 0) {
    return null;
  }

  return (
    <>
      {pages.map((chunks, pi) => (
        <div className="page" key={pi}>
          {pi === 0 && <h2>Evidence Gallery</h2>}
          {pi === 0 && (
            <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Photos grouped by linked task, with capture metadata
            </div>
          )}

          {chunks.map((task, ci) => (
            <div key={`${task.taskId}-${ci}`} style={{ marginBottom: 20 }}>
              <h3 style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 4 }}>
                {task.taskName}
                {task.continued && (
                  <span className="text-xs text-muted" style={{ marginLeft: 6, fontWeight: 400 }}>
                    (continued)
                  </span>
                )}
                <span className="text-xs text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                  ({task.totalItems} item{task.totalItems !== 1 ? "s" : ""})
                </span>
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                  marginTop: 10,
                }}
              >
                {task.evidence.map((ev) => (
                  <div
                    key={ev.id}
                    className="evidence-card"
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
                    <img
                      src={ev.publicUrl}
                      alt={ev.originalFilename ?? "Evidence"}
                      data-evidence="true"
                      style={{
                        width: "100%",
                        height: 160,
                        objectFit: "cover",
                        display: "block",
                        background: "#f1f5f9",
                      }}
                    />
                    <div style={{ padding: "8px 10px", fontSize: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: "#334155" }}>
                          {ev.originalFilename ?? "Photo"}
                        </span>
                        {ev.capturedAt && (
                          <span className="text-muted">
                            {formatDateTime(ev.capturedAt)}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#64748b", lineHeight: 1.6 }}>
                        {ev.latitude != null && ev.longitude != null && (
                          <div>
                            GPS: {ev.latitude.toFixed(6)}, {ev.longitude.toFixed(6)}
                          </div>
                        )}
                        {ev.uploaderName && (
                          <div>
                            Uploaded by: {ev.uploaderName}
                            {ev.uploaderRole ? ` (${ev.uploaderRole})` : ""}
                          </div>
                        )}
                        {ev.note && (
                          <div style={{ fontStyle: "italic", marginTop: 2, wordBreak: "break-word", maxHeight: 36, overflow: "hidden" }}>
                            &ldquo;{ev.note.length > 200 ? ev.note.slice(0, 200) + "..." : ev.note}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <PageFooter meta={meta} pageNum={startPage + pi} />
        </div>
      ))}
    </>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
