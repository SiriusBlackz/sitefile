import { PageFooter } from "../report-shell";
import { type InspectionMeta, fmtDate } from "./inspection-meta";
import { INSPECTION_FIXED_TEXT } from "@/lib/inspection-report-sections";

export function InspectionCoverPage({ meta }: { meta: InspectionMeta }) {
  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {(meta.logoUrl || meta.organisationName) && (
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {meta.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML
            <img src={meta.logoUrl} alt={meta.organisationName ?? "Contractor logo"} style={{ maxHeight: 80, maxWidth: 280, objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", letterSpacing: 0.5, paddingBottom: 10, borderBottom: "3px solid #0f172a", display: "inline-block" }}>
              {meta.organisationName}
            </div>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: meta.coverPhotoUrl ? 24 : 40 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
          {meta.reportTitle}
        </div>
        <h1 style={{ fontSize: 34, marginBottom: 8 }}>{meta.projectName}</h1>
        {meta.projectReference && (
          <div style={{ fontSize: 16, color: "#64748b", marginBottom: 4 }}>Ref: {meta.projectReference}</div>
        )}
        <div style={{ fontSize: 13, color: "#334155", marginTop: 8 }}>
          {meta.stageLabel} · {meta.kindLabel}
        </div>
      </div>

      {meta.coverPhotoUrl && (
        <div style={{ maxWidth: 560, margin: "0 auto 28px", borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", borderBottom: "4px solid var(--brand)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
          <img src={meta.coverPhotoUrl} alt="Site photo" style={{ display: "block", width: "100%", height: 230, objectFit: "cover" }} />
        </div>
      )}

      <div style={{ maxWidth: 420, margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ fontSize: 12 }}>
          <tbody>
            {meta.organisationName && <Row label="Contractor" value={meta.organisationName} />}
            {meta.clientName && <Row label="Client" value={meta.clientName} />}
            {meta.contractFormLabel && <Row label="Contract form" value={meta.contractFormLabel} />}
            <Row label="Report number" value={`#${meta.reportNumber} · revision ${meta.revision}`} />
            <Row label="Visit date" value={fmtDate(meta.visitDate)} />
            <Row label="Issue date" value={fmtDate(meta.generatedAt)} />
          </tbody>
        </table>
      </div>

      <div style={{ maxWidth: 560, margin: "28px auto 0", padding: "10px 14px", border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8, fontSize: 9.5, color: "#78350f", lineHeight: 1.6, textAlign: "center" }}>
        {INSPECTION_FIXED_TEXT.coverBanner}
      </div>

      {meta.clientLogoUrl && (
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Prepared for</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML */}
          <img src={meta.clientLogoUrl} alt={meta.clientName ?? "Client"} style={{ maxHeight: 48, maxWidth: 200, objectFit: "contain" }} />
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: meta.clientLogoUrl ? 24 : 40, fontSize: 9, color: "#94a3b8", lineHeight: 1.6 }}>
        {meta.companyDetails && (
          <div style={{ marginBottom: 8, color: "#64748b", whiteSpace: "pre-line" }}>{meta.companyDetails}</div>
        )}
        This document is confidential and intended solely for the named recipient(s).
      </div>
      <PageFooter meta={meta} pageNum={1} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ fontWeight: 600, color: "#475569", width: "40%", padding: "9px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{label}</td>
      <td style={{ padding: "9px 14px", borderBottom: "1px solid #e2e8f0" }}>{value}</td>
    </tr>
  );
}
