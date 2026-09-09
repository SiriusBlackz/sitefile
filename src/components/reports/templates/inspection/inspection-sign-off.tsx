import { PageFooter } from "../report-shell";
import type { InspectionMeta } from "./inspection-meta";
import type { SignatureData } from "../sign-off";
import { INSPECTION_FIXED_TEXT } from "@/lib/inspection-report-sections";

export function InspectionSignOffPage({ meta, signatures = [], startPage }: { meta: InspectionMeta; signatures?: SignatureData[]; startPage: number }) {
  const byRole = new Map(signatures.map((s) => [s.role, s]));
  return (
    <div className="page">
      <h2>Sign-Off</h2>
      <div className="text-sm text-muted" style={{ marginBottom: 20 }}>
        Prepared by {meta.organisationName ?? "the contractor"} from records captured on the visit stated. Each block records a decision for the listed items and this revision only.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Block role="Inspector / contractor submission" description="I confirm this report records the items observed at the visit stated, and I submit the identified corrective work and evidence, if any, for review." sig={byRole.get("contractor")} />
        <Block role="Verifier" description="I verified the items marked Verified closed using the recorded methods and evidence. Satisfactory correction applies only to those items and within my authority." sig={byRole.get("project_manager")} />
        <Block role="Client / asset representative" description="Decision (tick one): ☐ Acknowledge receipt only  ☐ Agree the stated item outcomes within my authority  ☐ Further information or work required. Reservations, if any, to be written below." sig={undefined} />
      </div>
      <div style={{ marginTop: 28, padding: 14, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>Basis of this record</h3>
        <div style={{ fontSize: 8, color: "#64748b", lineHeight: 1.7 }}>
          <p style={{ marginBottom: 6 }}>{INSPECTION_FIXED_TEXT.signatures}</p>
          <p style={{ marginBottom: 6 }}>
            Photographs, GPS positions and timestamps are recorded as supplied by the capturing device and preserved unchanged; they have not been independently verified unless stated. Original files are retained.
          </p>
          <p>
            Issued {new Date(meta.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}. Prepared with Sitefile.
          </p>
        </div>
      </div>
      <PageFooter meta={meta} pageNum={startPage} />
    </div>
  );
}

function Block({ role, description, sig }: { role: string; description: string; sig?: SignatureData }) {
  const signed = !!sig?.imageDataUrl;
  return (
    <div style={{ border: `1px solid ${signed ? "#86efac" : "#e2e8f0"}`, borderRadius: 8, padding: "14px 18px", background: signed ? "#f0fdf4" : "transparent" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{role}</div>
        {signed && <span className="badge badge-green" style={{ fontSize: 8 }}>Electronically Approved</span>}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 14 }}>{description}</div>
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>Name, role and organisation</div>
          <div style={{ borderBottom: "1px solid #94a3b8", minHeight: 22, fontSize: 11 }}>{sig ? `${sig.name}${sig.title ? `, ${sig.title}` : ""}` : ""}</div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>Signature</div>
          <div style={{ borderBottom: "1px solid #94a3b8", minHeight: 22 }}>
            {signed ? (
              // eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML
              <img src={sig!.imageDataUrl} alt="Signature" style={{ height: 34 }} />
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>Date</div>
          <div style={{ borderBottom: "1px solid #94a3b8", minHeight: 22, fontSize: 11 }}>{sig?.date ?? ""}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: "#94a3b8" }}>Items / scope covered: ______________________  Reservations: ______________________</div>
    </div>
  );
}
