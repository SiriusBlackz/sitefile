import { PageFooter, type ReportMeta } from "./report-shell";

export function CoverPage({ meta }: { meta: ReportMeta }) {
  const periodFormatted = `${formatDate(meta.periodStart)} — ${formatDate(meta.periodEnd)}`;

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {/* Logo area. An unnamed org (sign-up placeholder) gets neither
          masthead nor faux name — the project title carries the cover. */}
      {(meta.logoUrl || meta.organisationName) && (
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          {meta.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML
            <img
              src={meta.logoUrl}
              alt={meta.organisationName ?? "Contractor logo"}
              style={{ maxHeight: 80, maxWidth: 280, objectFit: "contain" }}
            />
          ) : (
            // No logo uploaded: a clean typographic masthead reads better on a
            // client document than a faux-logo pill.
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#0f172a",
                letterSpacing: 0.5,
                paddingBottom: 10,
                borderBottom: "3px solid #0f172a",
                display: "inline-block",
              }}
            >
              {meta.organisationName}
            </div>
          )}
        </div>
      )}

      {/* Title block */}
      <div style={{ textAlign: "center", marginBottom: meta.coverPhotoUrl ? 28 : 48 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--brand)",
            textTransform: "uppercase",
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          Progress Report
        </div>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>{meta.projectName}</h1>
        {meta.projectReference && (
          <div style={{ fontSize: 16, color: "#64748b", marginBottom: 4 }}>
            Ref: {meta.projectReference}
          </div>
        )}
      </div>

      {/* Hero band: the PM-chosen site photo — framed rather than
          full-bleed so any photo quality still reads clean and the
          branded layout keeps its contrast. */}
      {meta.coverPhotoUrl && (
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto 32px",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
            borderBottom: "4px solid var(--brand)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
          <img
            src={meta.coverPhotoUrl}
            alt="Site photo"
            style={{
              display: "block",
              width: "100%",
              height: 250,
              objectFit: "cover",
            }}
          />
        </div>
      )}

      {/* Details table */}
      <div
        style={{
          maxWidth: 400,
          margin: "0 auto",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ fontSize: 12 }}>
          <tbody>
            {meta.organisationName && (
              <DetailRow label="Contractor" value={meta.organisationName} />
            )}
            {meta.clientName && (
              <DetailRow label="Client" value={meta.clientName} />
            )}
            {meta.contractType && (
              <DetailRow label="Contract Type" value={formatContractType(meta.contractType)} />
            )}
            <DetailRow label="Report Number" value={`#${meta.reportNumber}`} />
            <DetailRow label="Reporting Period" value={periodFormatted} />
            <DetailRow label="Report Date" value={formatDate(meta.generatedAt)} />
          </tbody>
        </table>
      </div>

      {/* Prepared-for client mark */}
      {meta.clientLogoUrl && (
        <div style={{ textAlign: "center", marginTop: 36 }}>
          <div
            style={{
              fontSize: 9,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Prepared for
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
          <img
            src={meta.clientLogoUrl}
            alt={meta.clientName ?? "Client"}
            style={{ maxHeight: 48, maxWidth: 200, objectFit: "contain" }}
          />
        </div>
      )}

      {/* Confidentiality notice + company details */}
      <div
        style={{
          textAlign: "center",
          marginTop: meta.clientLogoUrl ? 28 : 48,
          fontSize: 9,
          color: "#94a3b8",
          lineHeight: 1.6,
        }}
      >
        {meta.companyDetails && (
          <div style={{ marginBottom: 8, color: "#64748b", whiteSpace: "pre-line" }}>
            {meta.companyDetails}
          </div>
        )}
        This document is confidential and intended solely for the named recipient(s).
      </div>

      <PageFooter meta={meta} pageNum={1} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td
        style={{
          fontWeight: 600,
          color: "#475569",
          width: "40%",
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {value}
      </td>
    </tr>
  );
}

function formatDate(iso: string): string {
  // Accepts date-only strings (periods) and full ISO timestamps (generatedAt).
  const date = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatContractType(type: string): string {
  const map: Record<string, string> = {
    design_build: "Design & Build",
    traditional: "Traditional",
    management: "Management Contract",
    jct: "JCT",
    nec: "NEC",
    other: "Other",
  };
  return map[type] ?? type;
}
