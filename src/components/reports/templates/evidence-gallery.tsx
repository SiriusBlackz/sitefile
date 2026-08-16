import { PageFooter, type ReportMeta } from "./report-shell";

export interface GalleryTask {
  id: string;
  name: string;
  status: string | null;
  progressPct: number | null;
  evidence: GalleryEvidence[];
}

export interface GalleryEvidence {
  id: string;
  publicUrl: string;
  originalFilename: string | null;
  capturedAt: string | null;
  uploadedAt?: string | null;
  latitude: number | null;
  longitude: number | null;
  uploaderName: string | null;
  uploaderRole: string | null;
  note: string | null;
  /** Set when this photo already appears under an earlier task group. */
  alsoShownUnder?: string | null;
}

/** A slice of one task's photos that fits on a single gallery page. */
export interface GalleryChunk {
  taskId: string;
  taskName: string;
  taskStatus: string | null;
  taskProgress: number | null;
  totalItems: number;
  continued: boolean;
  evidence: GalleryEvidence[];
}

/**
 * Height-budget packing. Cards have two layouts with very different
 * heights (full-width single rows vs 2-col grid rows), so counting
 * photos alone overflows the fixed A4 box — pack by estimated pixels.
 */
const PAGE_BUDGET = 880; // usable px inside the A4 .page below the title
const HEADER_H = 46; // group heading + margins
const SINGLE_ROW_H = 186; // full-width single-photo card + gap
const GRID_ROW_H = 252; // one 2-col row of image+meta cards + gap

function chunkHeight(count: number, isSingleLayout: boolean): number {
  if (isSingleLayout) return HEADER_H + SINGLE_ROW_H;
  return HEADER_H + Math.ceil(count / 2) * GRID_ROW_H;
}

/**
 * Pure pagination shared by this component and renderReportHTML's TOC
 * math — the TOC's page numbers are only correct if both sides agree on
 * the packing. Oversized tasks split across pages with a "(continued)"
 * header instead of overflowing a fixed A4 box.
 */
export function paginateGallery(tasks: GalleryTask[]): GalleryChunk[][] {
  const pages: GalleryChunk[][] = [];
  let current: GalleryChunk[] = [];
  let usedPx = 0;

  function flush() {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      usedPx = 0;
    }
  }

  for (const task of tasks) {
    let offset = 0;
    while (offset < task.evidence.length) {
      const remaining = task.evidence.length - offset;
      const remainingBudget = PAGE_BUDGET - usedPx;
      // Rows of the 2-col grid that still fit on this page (single-photo
      // chunks use the wide layout and always occupy one short row).
      const isSingle = remaining === 1 && offset === 0 && task.evidence.length === 1;
      const fitRows = Math.floor((remainingBudget - HEADER_H) / GRID_ROW_H);
      const fitCount = isSingle
        ? remainingBudget >= chunkHeight(1, true)
          ? 1
          : 0
        : Math.min(remaining, Math.max(fitRows, 0) * 2);

      if (fitCount === 0) {
        // Nothing fits here — start a fresh page (guaranteed progress:
        // a full page always fits at least one row).
        flush();
        continue;
      }

      const slice = task.evidence.slice(offset, offset + fitCount);
      current.push({
        taskId: task.id,
        taskName: task.name,
        taskStatus: task.status,
        taskProgress: task.progressPct,
        totalItems: task.evidence.length,
        continued: offset > 0,
        evidence: slice,
      });
      usedPx += chunkHeight(slice.length, isSingle);
      offset += fitCount;
    }
  }
  flush();
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
          {pi === 0 && <h2>Progress Records</h2>}
          {pi === 0 && (
            <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Photos grouped by linked task, with capture metadata
            </div>
          )}

          {chunks.map((task, ci) => (
            <div key={`${task.taskId}-${ci}`} style={{ marginBottom: 20 }}>
              <h3
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: 4,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span>{task.taskName}</span>
                {task.continued && (
                  <span className="text-xs text-muted" style={{ fontWeight: 400 }}>
                    (continued)
                  </span>
                )}
                <span className="text-xs text-muted" style={{ fontWeight: 400, marginLeft: "auto" }}>
                  {statusLabel(task.taskStatus, task.taskProgress)}
                  {" · "}
                  {task.totalItems} photo{task.totalItems !== 1 ? "s" : ""}
                </span>
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    task.evidence.length === 1 ? "1fr" : "repeat(2, 1fr)",
                  gap: 12,
                  marginTop: 10,
                }}
              >
                {task.evidence.map((ev) =>
                  task.evidence.length === 1 ? (
                    // Single photo: image beside metadata so the row uses the
                    // full page width instead of leaving half of it empty.
                    <div
                      key={ev.id}
                      className="evidence-card"
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        overflow: "hidden",
                        display: "flex",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
                      <img
                        src={ev.publicUrl}
                        alt={ev.note ?? "Site photo"}
                        data-evidence="true"
                        style={{
                          width: "55%",
                          height: 170,
                          objectFit: "cover",
                          display: "block",
                          background: "#f1f5f9",
                        }}
                      />
                      <div style={{ padding: "10px 12px", fontSize: 9, flex: 1 }}>
                        <CardMeta ev={ev} />
                      </div>
                    </div>
                  ) : (
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
                        alt={ev.note ?? "Site photo"}
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
                        <CardMeta ev={ev} />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}

          <PageFooter meta={meta} pageNum={startPage + pi} />
        </div>
      ))}
    </>
  );
}

/** The site annotation is the headline; filenames never appear. */
function CardMeta({ ev }: { ev: GalleryEvidence }) {
  return (
    <>
      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 10, marginBottom: 3, lineHeight: 1.4 }}>
        {ev.note
          ? ev.note.length > 140
            ? ev.note.slice(0, 140) + "…"
            : ev.note
          : ev.capturedAt
            ? `Progress photo — ${new Date(ev.capturedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
            : "Progress photo"}
      </div>
      <div style={{ color: "#64748b", lineHeight: 1.7 }}>
        {ev.capturedAt ? (
          <div>Captured {formatDateTime(ev.capturedAt)}</div>
        ) : ev.uploadedAt ? (
          <div>Uploaded {formatDateTime(ev.uploadedAt)} · no embedded capture time</div>
        ) : null}
        {ev.latitude != null && ev.longitude != null ? (
          <div>
            GPS: {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}
          </div>
        ) : (
          <div>GPS: not recorded</div>
        )}
        {ev.alsoShownUnder && (
          <div style={{ fontStyle: "italic" }}>
            Also shown under “{ev.alsoShownUnder}”
          </div>
        )}
        {/* Uploader attribution intentionally omitted from gallery cards
            (pilot feedback) — the Verification section covers provenance. */}
      </div>
    </>
  );
}

function statusLabel(status: string | null, progress: number | null): string {
  const labels: Record<string, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    completed: "Completed",
    delayed: "Delayed",
  };
  const base = status ? labels[status] ?? status : "";
  if (!base) return "";
  if (status === "in_progress" && progress != null) return `${base} — ${progress}%`;
  return base;
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
