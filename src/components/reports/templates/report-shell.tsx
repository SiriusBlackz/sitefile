import type { ReactNode } from "react";

/**
 * Shell wrapper for all report pages. Provides consistent A4 sizing,
 * typography, and page-break control for Puppeteer PDF rendering.
 *
 * Uses inline styles — Tailwind is not available in the Puppeteer context.
 */

export interface ReportMeta {
  /** Null when the org still carries its sign-up placeholder name. */
  organisationName: string | null;
  logoUrl: string | null;
  clientLogoUrl?: string | null;
  brandColor?: string | null;
  companyDetails?: string | null;
  projectName: string;
  projectReference: string | null;
  clientName?: string | null;
  contractType: string | null;
  reportNumber: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** Presigned URL of the PM-chosen site photo for the cover hero band. */
  coverPhotoUrl?: string | null;
}

const DEFAULT_BRAND = "#3b82f6";

const baseStyles = (brand: string) => `
  :root { --brand: ${brand}; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #1a1a1a;
    background: #fff;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 20mm 18mm 24mm;
    page-break-after: always;
    position: relative;
  }

  .page:last-child {
    page-break-after: auto;
  }

  h1 { font-size: 28px; font-weight: 700; line-height: 1.2; color: #0f172a; }
  h2 {
    font-size: 20px; font-weight: 600; line-height: 1.3; color: #0f172a;
    margin-bottom: 12px; padding-bottom: 6px;
    border-bottom: 2px solid var(--brand);
  }
  h3 { font-size: 14px; font-weight: 600; line-height: 1.4; color: #334155; margin-bottom: 8px; }

  .text-muted { color: #64748b; }
  .text-sm { font-size: 10px; }
  .text-xs { font-size: 9px; }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #f1f5f9; color: #475569; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }

  th {
    text-align: left;
    padding: 8px 10px;
    background: #f8fafc;
    border-bottom: 2px solid #e2e8f0;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
  }

  td {
    padding: 7px 10px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }

  tr:nth-child(even) td { background: #fafbfc; }

  .divider {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 16px 0;
  }

  .evidence-card {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .ba-pair {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  img[data-evidence] {
    background: #f1f5f9;
  }

  .page-footer {
    position: absolute;
    bottom: 12mm;
    left: 18mm;
    right: 18mm;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #94a3b8;
    border-top: 1px solid #f1f5f9;
    padding-top: 6px;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { page-break-after: always; }
  }
`;

export function ReportShell({
  meta,
  children,
}: {
  meta: ReportMeta;
  children: ReactNode;
}) {
  const brand =
    meta.brandColor && /^#[0-9a-fA-F]{6}$/.test(meta.brandColor)
      ? meta.brandColor
      : DEFAULT_BRAND;
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-head-element -- Puppeteer static HTML, not a Next.js page */}
      <head>
        <meta charSet="utf-8" />
        <style dangerouslySetInnerHTML={{ __html: baseStyles(brand) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

export function PageFooter({ meta, pageNum }: { meta: ReportMeta; pageNum: number }) {
  return (
    <div className="page-footer">
      <span>
        {meta.organisationName ? `${meta.organisationName} — ` : ""}
        {meta.projectName}
        {meta.projectReference ? ` (${meta.projectReference})` : ""}
      </span>
      <span>
        Report #{meta.reportNumber} | Page {pageNum}
      </span>
    </div>
  );
}
