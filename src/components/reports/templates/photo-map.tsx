import { PageFooter, type ReportMeta } from "./report-shell";

/**
 * Photo Location Map — satellite imagery of the site with the drawn GPS
 * zones outlined and numbered pins where the period's photos were taken.
 * Everything on this page falls out of data the phone already captured;
 * it is the visual proof behind the Verification section's numbers.
 */

export interface PhotoMapData {
  /** Mapbox Static Images URL (zones + pins overlaid, auto-fitted). */
  mapUrl: string;
  legend: { n: number; label: string }[];
  /** Photos with GPS beyond the pin cap (0 when all shown). */
  overflow: number;
  photosWithGps: number;
  totalPhotos: number;
  verifiedInZones: number;
  zonesConfigured: number;
}

export function PhotoMapPage({
  meta,
  data,
  startPage,
}: {
  meta: ReportMeta;
  data: PhotoMapData;
  startPage: number;
}) {
  return (
    <div className="page">
      <h2>Photo Location Map</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 14 }}>
        Capture locations of this period&apos;s site photos, plotted from
        each photo&apos;s GPS position
        {data.zonesConfigured > 0 ? " with the project's site zones outlined" : ""}.
      </div>

      <div
        style={{
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #e2e8f0",
          marginBottom: 14,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
        <img
          src={data.mapUrl}
          alt="Map of photo capture locations"
          style={{ display: "block", width: "100%" }}
        />
      </div>

      <div
        style={{
          fontSize: 10.5,
          color: "#334155",
          marginBottom: 12,
        }}
      >
        <strong>{data.photosWithGps}</strong> of {data.totalPhotos} photo
        {data.totalPhotos === 1 ? "" : "s"} captured this period carr
        {data.photosWithGps === 1 ? "ies" : "y"} GPS positions
        {data.zonesConfigured > 0 && (
          <>
            ; <strong>{data.verifiedInZones}</strong>{" "}
            {data.verifiedInZones === 1 ? "falls" : "fall"} within the
            project&apos;s configured site zones
          </>
        )}
        .{data.overflow > 0 && ` ${data.overflow} further location${data.overflow === 1 ? "" : "s"} not pinned for legibility.`}
      </div>

      {data.legend.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "4px 24px",
            fontSize: 9.5,
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          {data.legend.map((entry) => (
            <div key={entry.n}>
              <span
                style={{
                  display: "inline-block",
                  minWidth: 16,
                  fontWeight: 700,
                  color: "#be123c",
                }}
              >
                {entry.n}.
              </span>{" "}
              {entry.label.length > 70
                ? entry.label.slice(0, 70) + "…"
                : entry.label}
            </div>
          ))}
        </div>
      )}

      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}
