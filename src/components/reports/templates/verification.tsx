import { PageFooter, type ReportMeta } from "./report-shell";

export interface VerificationStats {
  totalEvidence: number;
  withExifData: number;
  withGpsCoords: number;
  gpsVerifiedByZone: number;
  /** Number of GPS zones configured on the project — 0 hides the zone tile. */
  zonesConfigured: number;
  averageUploadDelay: string; // human-readable, e.g. "2h 15m"
  maxUploadDelay: string;
  evidenceByType: { type: string; count: number }[];
  auditTrailSummary: AuditEntry[];
}

export interface AuditEntry {
  date: string;
  user: string;
  action: string;
  entity: string;
}

/** Audit rows that fit under the stats sections on the first page. */
const AUDIT_ON_STATS_PAGE = 8;
/** Audit rows per dedicated continuation page. */
const AUDIT_ROWS_PER_PAGE = 22;

/**
 * Pure pagination shared with renderReportHTML's TOC math. A short audit
 * trail sits under the stats; a longer one moves to its own page(s)
 * instead of overflowing the fixed A4 box.
 */
export function paginateVerification(stats: VerificationStats): {
  inlineAudit: AuditEntry[] | null;
  extraAuditPages: AuditEntry[][];
} {
  const audit = stats.auditTrailSummary;
  if (audit.length <= AUDIT_ON_STATS_PAGE) {
    return { inlineAudit: audit.length > 0 ? audit : null, extraAuditPages: [] };
  }
  const extraAuditPages: AuditEntry[][] = [];
  for (let i = 0; i < audit.length; i += AUDIT_ROWS_PER_PAGE) {
    extraAuditPages.push(audit.slice(i, i + AUDIT_ROWS_PER_PAGE));
  }
  return { inlineAudit: null, extraAuditPages };
}

export function verificationPageCount(stats: VerificationStats): number {
  return 1 + paginateVerification(stats).extraAuditPages.length;
}

export function VerificationPage({
  meta,
  stats,
  startPage,
}: {
  meta: ReportMeta;
  stats: VerificationStats;
  startPage: number;
}) {
  const exifRate =
    stats.totalEvidence > 0
      ? Math.round((stats.withExifData / stats.totalEvidence) * 100)
      : 0;
  const gpsRate =
    stats.totalEvidence > 0
      ? Math.round((stats.withGpsCoords / stats.totalEvidence) * 100)
      : 0;
  const zoneRate =
    stats.withGpsCoords > 0
      ? Math.round((stats.gpsVerifiedByZone / stats.withGpsCoords) * 100)
      : 0;

  const { inlineAudit, extraAuditPages } = paginateVerification(stats);

  return (
    <>
      <div className="page">
        <h2>Verification & Metadata</h2>
        <div className="text-sm text-muted" style={{ marginBottom: 20 }}>
          Data integrity analysis for evidence submitted during the reporting period
        </div>

        {/* Integrity metrics */}
        <h3>Data Integrity</h3>
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <IntegrityCard
            label="EXIF Preserved"
            value={`${exifRate}%`}
            detail={`${stats.withExifData} of ${stats.totalEvidence} items`}
            color={rateColor(exifRate)}
          />
          <IntegrityCard
            label="GPS Coordinates"
            value={`${gpsRate}%`}
            detail={`${stats.withGpsCoords} of ${stats.totalEvidence} items`}
            color={rateColor(gpsRate)}
          />
          {stats.zonesConfigured > 0 && (
            <IntegrityCard
              label="Zone Verified"
              value={stats.withGpsCoords > 0 ? `${zoneRate}%` : "—"}
              detail={
                stats.withGpsCoords > 0
                  ? `${stats.gpsVerifiedByZone} of ${stats.withGpsCoords} GPS items`
                  : "No GPS-tagged items"
              }
              color={stats.withGpsCoords > 0 ? rateColor(zoneRate) : "#64748b"}
            />
          )}
        </div>
        <div className="text-xs text-muted" style={{ marginBottom: 24, lineHeight: 1.6 }}>
          These rates describe the metadata embedded by the capturing devices
          (camera model, timestamps, location). Lower rates typically reflect
          device settings or photos imported from other sources, not an issue
          with the evidence itself.
        </div>

        {/* Upload timing analysis */}
        <h3>Upload vs Capture Timing</h3>
        <table style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Average delay (capture → upload)</td>
              <td>{stats.averageUploadDelay}</td>
            </tr>
            <tr>
              <td>Maximum delay</td>
              <td>{stats.maxUploadDelay}</td>
            </tr>
          </tbody>
        </table>

        {/* Evidence by type */}
        <h3>Evidence Breakdown</h3>
        <table style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Count</th>
              <th style={{ textAlign: "right" }}>Percentage</th>
            </tr>
          </thead>
          <tbody>
            {stats.evidenceByType.map((item) => (
              <tr key={item.type}>
                <td style={{ textTransform: "capitalize" }}>{item.type}</td>
                <td style={{ textAlign: "right" }}>{item.count}</td>
                <td style={{ textAlign: "right" }}>
                  {stats.totalEvidence > 0
                    ? Math.round((item.count / stats.totalEvidence) * 100)
                    : 0}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Short audit trail fits under the stats */}
        {inlineAudit && <AuditTable entries={inlineAudit} continued={false} />}

        <PageFooter meta={meta} pageNum={startPage} />
      </div>

      {/* Longer audit trails get their own page(s) */}
      {extraAuditPages.map((entries, pi) => (
        <div className="page" key={pi}>
          <AuditTable entries={entries} continued={pi > 0} heading />
          <PageFooter meta={meta} pageNum={startPage + 1 + pi} />
        </div>
      ))}
    </>
  );
}

function AuditTable({
  entries,
  continued,
  heading = false,
}: {
  entries: AuditEntry[];
  continued: boolean;
  heading?: boolean;
}) {
  return (
    <>
      {heading ? (
        <h2>
          Audit Trail Summary
          {continued && (
            <span className="text-xs text-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
              (continued)
            </span>
          )}
        </h2>
      ) : (
        <h3>Audit Trail Summary</h3>
      )}
      {!continued && (
        <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
          Recent activity during reporting period (most recent first)
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>User</th>
            <th>Action</th>
            <th>Entity</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i}>
              <td className="text-muted">{formatDateTime(entry.date)}</td>
              <td>{entry.user}</td>
              <td>
                <span className={`badge ${actionBadge(entry.action)}`}>
                  {entry.action}
                </span>
              </td>
              <td>{entry.entity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Informational colour scale — high rates read as positive, low rates as
 * neutral. Never alarm-red: these are device-metadata rates on a document
 * handed to the client, not error states.
 */
function rateColor(rate: number): string {
  if (rate >= 80) return "#10b981";
  if (rate >= 50) return "#f59e0b";
  return "#64748b";
}

function IntegrityCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "14px 16px",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8" }}>{detail}</div>
    </div>
  );
}

function actionBadge(action: string): string {
  switch (action) {
    case "create":
      return "badge-green";
    case "update":
      return "badge-blue";
    case "delete":
      return "badge-red";
    default:
      return "badge-gray";
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
