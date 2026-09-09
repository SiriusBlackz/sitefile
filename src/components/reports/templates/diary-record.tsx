import type { ReportMeta } from "./report-shell";

export interface DiaryRecordPhoto { id: string; url: string | null; capturedAt: string | null; uploadedAt: string | null; hasGps: boolean; uploader: string | null; note: string | null }
export interface DiaryRecordHoldup { cause: string; hours: number; note: string | null; threadStatus: string; task: string | null; loggedAt: string; reporter: string | null }
export interface DiaryRecordEntry {
  id: string; author: string; status: string; late: boolean;
  enteredAt: string | null; receivedAt: string | null; lockedAt: string | null; amendedAt: string | null;
  weather: string | null;
  workLines: { task: string | null; body: string; source: string; provenance: string; confirmed: boolean; photos: DiaryRecordPhoto[]; morePhotos: number }[];
  resources: { kind: string; label: string; qty: number; note: string | null; provenance: string }[];
  holdups: DiaryRecordHoldup[];
  visitors: number; inspections: number; toolboxTalk: boolean; toolboxTopic: string | null; incidents: number;
  safetyNote: string | null; workNote: string | null;
  amendments: { field: string; previous: string | null; next: string | null; note: string | null; at: string; by: string | null }[];
}
export interface DiaryRecordDay { date: string; workingDay: boolean; entries: DiaryRecordEntry[]; orphanHoldups: DiaryRecordHoldup[]; photos: DiaryRecordPhoto[]; morePhotos: number }
export interface DiaryRecordData {
  meta: ReportMeta; from: string; to: string; preparedBy: string; scope: "all" | "own";
  days: DiaryRecordDay[];
  totals: { days: number; workingDays: number; daysWithRecord: number; entries: number; locked: number; late: number; amended: number; hoursLost: number; incidents: number; photos: number };
}

const fmtDate = (iso: string) => new Date(iso.includes("T") ? iso : iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const PROV: Record<string, string> = { auto: "AUTO", carried: "CARRIED", edited: "EDITED", you: "ENTERED" };

function Footer({ data, page }: { data: DiaryRecordData; page: number }) {
  return (
    <div className="page-footer">
      <span>{data.meta.organisationName ? `${data.meta.organisationName} — ` : ""}{data.meta.projectName}{data.meta.projectReference ? ` (${data.meta.projectReference})` : ""} · Site Diary Record</span>
      <span>Internal record · Page {page}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#475569", borderBottom: "1px solid #e2e8f0", paddingBottom: 3, marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

/**
 * Cover + one page per day per author (a day without a record prints a
 * one-line declaration, never disappears). Shape follows a contractor's
 * end-of-shift report: crew & kit, works done, hold-ups, people & safety,
 * notes, photos, amendments, stamps and a wet-ink signature line.
 */
export function DiaryRecordPages({ data }: { data: DiaryRecordData }) {
  let page = 1;
  const pages: React.ReactNode[] = [];
  const t = data.totals;
  pages.push(
    <div className="page" key="cover" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {(data.meta.logoUrl || data.meta.organisationName) && (
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          {data.meta.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML
            <img src={data.meta.logoUrl} alt="" style={{ maxHeight: 70, maxWidth: 260, objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: 24, fontWeight: 700, paddingBottom: 8, borderBottom: "3px solid #0f172a", display: "inline-block" }}>{data.meta.organisationName}</div>
          )}
        </div>
      )}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Site Diary Record</div>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>{data.meta.projectName}</h1>
        {data.meta.projectReference && <div style={{ fontSize: 15, color: "#64748b" }}>Ref: {data.meta.projectReference}</div>}
        <div style={{ fontSize: 13, marginTop: 8 }}>{fmtDate(data.from)}{data.from !== data.to ? ` — ${fmtDate(data.to)}` : ""}</div>
      </div>
      <div style={{ maxWidth: 440, margin: "0 auto", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ fontSize: 11.5 }}><tbody>
          {[["Days in range", `${t.days} (${t.workingDays} working days)`], ["Days with a record", `${t.daysWithRecord} of ${t.workingDays} working days`], ["Diary entries", `${t.entries} (${t.locked} locked, ${t.late} entered late, ${t.amended} amended after lock)`], ["Hours lost to hold-ups", `${t.hoursLost}`], ["Incidents recorded", `${t.incidents}`], ["Photographs captured", `${t.photos}`], ["Scope", data.scope === "own" ? "Own entries only" : "All authors"], ["Prepared by", data.preparedBy], ["Generated", fmtTime(data.meta.generatedAt)]].map(([k, v]) => (
            <tr key={k}><td style={{ fontWeight: 600, color: "#475569", width: "44%", padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{k}</td><td style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0" }}>{v}</td></tr>
          ))}
        </tbody></table>
      </div>
      <div style={{ maxWidth: 560, margin: "24px auto 0", padding: "10px 14px", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, fontSize: 9.5, color: "#475569", lineHeight: 1.6, textAlign: "center" }}>
        Internal record. Every entry prints as it was locked, with who entered it and when it was entered, received and locked. Amendments after lock are listed with the original wording. Photographs, times and positions are recorded as supplied by the device.
      </div>
      <Footer data={data} page={page++} />
    </div>
  );

  for (const d of data.days) {
    if (d.entries.length === 0) {
      pages.push(
        <div className="page" key={d.date}>
          <h2>{fmtDate(d.date)}{d.workingDay ? "" : " · non-working day"}</h2>
          <p style={{ fontSize: 11, marginBottom: 12 }}>{d.workingDay ? "No diary record was made for this working day." : "Non-working day. No diary record."}</p>
          {d.orphanHoldups.length > 0 && <Section title="Hold-ups logged"><HoldupTable rows={d.orphanHoldups} /></Section>}
          {d.photos.length > 0 && <Section title={`Photographs captured (${d.photos.length + d.morePhotos})`}><PhotoGrid photos={d.photos} more={d.morePhotos} /></Section>}
          <Footer data={data} page={page++} />
        </div>
      );
      continue;
    }
    d.entries.forEach((e, idx) => {
      const labour = e.resources.filter((r) => r.kind === "labour");
      const plant = e.resources.filter((r) => r.kind === "plant");
      const materials = e.resources.filter((r) => r.kind === "materials");
      pages.push(
        <div className="page" key={`${d.date}-${e.id}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--brand)", paddingBottom: 6, marginBottom: 10 }}>
            <h2 style={{ border: "none", margin: 0, padding: 0 }}>{fmtDate(d.date)}{d.workingDay ? "" : " · non-working day"}</h2>
            <span className={`badge ${e.status === "locked" ? "badge-green" : e.status === "draft" ? "badge-amber" : "badge-gray"}`}>{e.status}{e.late ? " · late" : ""}{e.amendments.length ? " · amended" : ""}</span>
          </div>
          <table style={{ marginBottom: 10, fontSize: 10 }}><tbody>
            <tr><td style={{ width: "18%", fontWeight: 600 }}>Recorded by</td><td style={{ width: "32%" }}>{e.author}{d.entries.length > 1 ? ` (entry ${idx + 1} of ${d.entries.length})` : ""}</td><td style={{ width: "18%", fontWeight: 600 }}>Weather</td><td>{e.weather ?? "not recorded"}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Entered</td><td>{fmtTime(e.enteredAt)}</td><td style={{ fontWeight: 600 }}>Received</td><td>{fmtTime(e.receivedAt)}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Locked</td><td>{fmtTime(e.lockedAt)}</td><td style={{ fontWeight: 600 }}>Amended</td><td>{e.amendedAt ? fmtTime(e.amendedAt) : "no"}</td></tr>
          </tbody></table>

          <Section title="Crew and kit on site">
            {labour.length + plant.length + materials.length === 0 ? <p style={{ fontSize: 10 }}>Not recorded.</p> : (
              <table style={{ fontSize: 10 }}>
                <thead><tr><th>Kind</th><th>Description</th><th style={{ width: "10%" }}>Qty</th><th>Note</th><th style={{ width: "12%" }}>Provenance</th></tr></thead>
                <tbody>
                  {[...labour, ...plant, ...materials].map((r, i) => (
                    <tr key={i}><td>{r.kind}</td><td>{r.label || (r.kind === "labour" ? "Operatives" : r.kind === "plant" ? "Plant" : "Materials")}</td><td>{r.qty || ""}</td><td>{r.note ?? ""}</td><td className="text-xs">{PROV[r.provenance] ?? r.provenance}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Works done, by activity">
            {e.workLines.length === 0 ? <p style={{ fontSize: 10 }}>No work lines recorded.</p> : e.workLines.map((w, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10.5 }}><b>{w.task ?? "General"}.</b> {w.body} <span className="text-xs text-muted">[{PROV[w.provenance] ?? w.provenance}{w.confirmed ? " · confirmed" : ""}{w.source === "photo_link" ? " · from photos" : ""}]</span></div>
                {w.photos.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 4 }}>{w.photos.map((p) => <Photo key={p.id} p={p} size={92} />)}{w.morePhotos > 0 && <span className="text-xs text-muted">+{w.morePhotos} more</span>}</div>}
              </div>
            ))}
          </Section>

          <Section title="Hold-ups and disruption">
            {e.holdups.length === 0 ? <p style={{ fontSize: 10 }}>None logged.</p> : <HoldupTable rows={e.holdups} />}
          </Section>

          <Section title="People and safety">
            <p style={{ fontSize: 10.5 }}>{e.visitors} visitor{e.visitors === 1 ? "" : "s"} · {e.inspections} inspection{e.inspections === 1 ? "" : "s"} · toolbox talk {e.toolboxTalk ? `yes${e.toolboxTopic ? ` (${e.toolboxTopic})` : ""}` : "no"} · {e.incidents} incident{e.incidents === 1 ? "" : "s"}</p>
            {e.safetyNote && <p style={{ fontSize: 10.5, marginTop: 3 }}><b>Safety note.</b> {e.safetyNote}</p>}
          </Section>

          {e.workNote && <Section title="Notes"><p style={{ fontSize: 10.5, whiteSpace: "pre-wrap" }}>{e.workNote}</p></Section>}

          {idx === 0 && d.photos.length > 0 && (
            <Section title={`Photographs captured on the day (${d.photos.length + d.morePhotos})`}><PhotoGrid photos={d.photos} more={d.morePhotos} /></Section>
          )}

          {e.amendments.length > 0 && (
            <Section title="Amendments after lock">
              <table style={{ fontSize: 9.5 }}>
                <thead><tr><th>When</th><th>By</th><th>Field</th><th>Was</th><th>Now</th><th>Reason</th></tr></thead>
                <tbody>{e.amendments.map((a, i) => <tr key={i}><td>{fmtTime(a.at)}</td><td>{a.by ?? "—"}</td><td>{a.field}</td><td>{a.previous ?? "—"}</td><td>{a.next ?? "—"}</td><td>{a.note ?? "—"}</td></tr>)}</tbody>
              </table>
            </Section>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 24, fontSize: 9, color: "#64748b" }}>
            <div style={{ flex: 2 }}><div>Recorded by (name)</div><div style={{ borderBottom: "1px solid #94a3b8", minHeight: 18, fontSize: 11, color: "#0f172a" }}>{e.author}</div></div>
            <div style={{ flex: 2 }}><div>Signature (if countersigned on paper)</div><div style={{ borderBottom: "1px solid #94a3b8", minHeight: 18 }} /></div>
            <div style={{ flex: 1 }}><div>Date</div><div style={{ borderBottom: "1px solid #94a3b8", minHeight: 18 }} /></div>
          </div>
          <Footer data={data} page={page++} />
        </div>
      );
    });
  }
  return <>{pages}</>;
}

function HoldupTable({ rows }: { rows: DiaryRecordHoldup[] }) {
  return (
    <table style={{ fontSize: 10 }}>
      <thead><tr><th>Cause</th><th style={{ width: "10%" }}>Hours</th><th>Activity</th><th>Note</th><th style={{ width: "16%" }}>Logged</th><th style={{ width: "10%" }}>Thread</th></tr></thead>
      <tbody>{rows.map((h, i) => <tr key={i}><td>{h.cause}</td><td>{h.hours}</td><td>{h.task ?? "—"}</td><td>{h.note ?? "—"}</td><td className="text-xs">{fmtTime(h.loggedAt)}{h.reporter ? ` · ${h.reporter}` : ""}</td><td>{h.threadStatus}</td></tr>)}</tbody>
    </table>
  );
}

function Photo({ p, size }: { p: DiaryRecordPhoto; size: number }) {
  return (
    <figure style={{ width: size }}>
      {p.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Puppeteer static HTML
        <img src={p.url} alt="" data-evidence style={{ width: size, height: size, objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0" }} />
      ) : <div style={{ width: size, height: size, background: "#f1f5f9", borderRadius: 4 }} />}
      <figcaption className="text-xs text-muted" style={{ lineHeight: 1.3, marginTop: 2 }}>{p.capturedAt ? fmtTime(p.capturedAt) : "time not recorded"}{p.hasGps ? " · GPS" : ""}{p.uploader ? ` · ${p.uploader}` : ""}</figcaption>
    </figure>
  );
}

function PhotoGrid({ photos, more }: { photos: DiaryRecordPhoto[]; more: number }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {photos.map((p) => <Photo key={p.id} p={p} size={104} />)}
      {more > 0 && <span className="text-xs text-muted" style={{ alignSelf: "center" }}>and {more} more on file</span>}
    </div>
  );
}
