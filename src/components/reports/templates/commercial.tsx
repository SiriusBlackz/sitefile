import { PageFooter, type ReportMeta } from "./report-shell";
import { fmtGbp, type CeSummary, type EwSummary } from "@/server/services/commercial-import";

/**
 * Commercial — Early Warnings & Compensation Events (package 4). Built
 * from the project's imported CEMAR registers, never from free text:
 * counts at the issue date, this period's movements, reply timeliness,
 * and the open lists. Descriptions are not printed (CEMAR exports redact
 * them); each row is ref · title · dates · status.
 */
export interface CommercialRowOut {
  ref: string;
  title: string;
  notifiedOn: string | null;
  status: string | null;
  fromParty: string | null;
  // EW
  replyDue: string | null;
  replyDate: string | null;
  timeliness: "on time" | "late" | "awaiting" | "overdue" | "n/a";
  // CE
  price: string | null;
  days: number | null;
  implementedOn: string | null;
  quotationDue: string | null;
}

export interface CommercialData {
  periodStart: string;
  periodEnd: string;
  asOf: string;
  lastImport: { ew: string | null; ce: string | null };
  ew: EwSummary;
  ce: CeSummary;
  ewThisPeriod: CommercialRowOut[];
  ewOpen: CommercialRowOut[];
  ceThisPeriod: CommercialRowOut[];
  ceOutstanding: CommercialRowOut[];
}

const ROWS_FIRST_PAGE = 14;
const ROWS_PER_PAGE = 26;

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

type Block = { title: string; kind: "ew" | "ce"; rows: CommercialRowOut[]; empty: string };

function blocks(data: CommercialData): Block[] {
  return [
    { title: "Early warnings raised this period", kind: "ew", rows: data.ewThisPeriod, empty: "No early warnings were raised in the period." },
    { title: "Early warnings open at the issue date", kind: "ew", rows: data.ewOpen, empty: "No early warnings are open." },
    { title: "Compensation events notified or implemented this period", kind: "ce", rows: data.ceThisPeriod, empty: "No compensation event movement in the period." },
    { title: "Compensation events outstanding at the issue date", kind: "ce", rows: data.ceOutstanding, empty: "No compensation events are outstanding." },
  ];
}

/** Rows paginate across pages; the summary strip occupies the first page. */
export function commercialPageCount(data: CommercialData): number {
  const total = blocks(data).reduce((s, b) => s + Math.max(b.rows.length, 1) + 1, 0);
  if (total <= ROWS_FIRST_PAGE) return 1;
  return 1 + Math.ceil((total - ROWS_FIRST_PAGE) / ROWS_PER_PAGE);
}

function paginate(data: CommercialData): { block: Block; rows: (CommercialRowOut | null)[]; continued: boolean }[][] {
  // Flatten into (block, row) lines with a header line per block, then cut.
  const lines: { block: Block; row: CommercialRowOut | null; header: boolean }[] = [];
  for (const b of blocks(data)) {
    lines.push({ block: b, row: null, header: true });
    if (b.rows.length === 0) lines.push({ block: b, row: null, header: false });
    for (const r of b.rows) lines.push({ block: b, row: r, header: false });
  }
  const pages: (typeof lines)[] = [];
  let cap = ROWS_FIRST_PAGE;
  let cur: typeof lines = [];
  for (const l of lines) {
    if (cur.length >= cap) { pages.push(cur); cur = []; cap = ROWS_PER_PAGE; }
    cur.push(l);
  }
  if (cur.length) pages.push(cur);
  return pages.map((pg) => {
    const out: { block: Block; rows: (CommercialRowOut | null)[]; continued: boolean }[] = [];
    for (const l of pg) {
      const last = out[out.length - 1];
      if (l.header || !last || last.block !== l.block) out.push({ block: l.block, rows: [], continued: !l.header });
      if (!l.header) out[out.length - 1].rows.push(l.row);
    }
    return out;
  });
}

function Table({ kind, rows, empty }: { kind: "ew" | "ce"; rows: (CommercialRowOut | null)[]; empty: string }) {
  if (rows.length === 1 && rows[0] === null) return <p style={{ fontSize: 10, color: "#64748b", margin: "2px 0 8px" }}>{empty}</p>;
  return (
    <table style={{ fontSize: 9.5, marginBottom: 8 }}>
      <thead>
        {kind === "ew" ? (
          <tr><th style={{ width: "9%" }}>Ref</th><th>Title</th><th style={{ width: "11%" }}>Raised</th><th style={{ width: "11%" }}>Reply due</th><th style={{ width: "11%" }}>Replied</th><th style={{ width: "10%" }}>Reply</th><th style={{ width: "13%" }}>Status</th></tr>
        ) : (
          <tr><th style={{ width: "9%" }}>Ref</th><th>Title</th><th style={{ width: "11%" }}>Notified</th><th style={{ width: "12%", textAlign: "right" }}>Value</th><th style={{ width: "7%", textAlign: "right" }}>Days</th><th style={{ width: "12%" }}>Implemented</th><th style={{ width: "13%" }}>Status</th></tr>
        )}
      </thead>
      <tbody>
        {rows.filter((r): r is CommercialRowOut => r != null).map((r) => (
          <tr key={`${kind}-${r.ref}`}>
            <td style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{r.ref}</td>
            <td>{r.title}</td>
            <td>{fmt(r.notifiedOn)}</td>
            {kind === "ew" ? (
              <>
                <td>{fmt(r.replyDue)}</td>
                <td>{fmt(r.replyDate)}</td>
                <td style={{ color: r.timeliness === "late" || r.timeliness === "overdue" ? "#b91c1c" : r.timeliness === "on time" ? "#15803d" : "#64748b" }}>{r.timeliness}</td>
              </>
            ) : (
              <>
                <td style={{ textAlign: "right" }}>{fmtGbp(r.price)}</td>
                <td style={{ textAlign: "right" }}>{r.days ?? "—"}</td>
                <td>{fmt(r.implementedOn)}</td>
              </>
            )}
            <td style={{ textTransform: "capitalize" }}>{(r.status ?? "").toLowerCase().replace(/_/g, " ") || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

export function CommercialPages({ meta, data, startPage }: { meta: ReportMeta; data: CommercialData; startPage: number }) {
  const pages = paginate(data);
  const { ew, ce } = data;
  return (
    <>
      {pages.map((pg, pi) => (
        <div className="page" key={pi}>
          <h2>Commercial — Early Warnings &amp; Compensation Events{pi > 0 ? " (continued)" : ""}</h2>
          {pi === 0 && (
            <>
              <div className="text-sm text-muted" style={{ marginBottom: 10 }}>
                From the contract registers as exported from CEMAR{data.lastImport.ew || data.lastImport.ce ? ` (EW register ${data.lastImport.ew ? `imported ${fmt(data.lastImport.ew)}` : "not imported"}; CE register ${data.lastImport.ce ? `imported ${fmt(data.lastImport.ce)}` : "not imported"})` : ""}. Counts are at the issue date; period movements are {fmt(data.periodStart)} to {fmt(data.periodEnd)}. Values are as notified or implemented in the register and are not a valuation.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
                <Stat label="Early warnings" value={ew.total} sub={`${ew.open} open · ${ew.avoided} avoided / passed`} />
                <Stat label="EW raised this period" value={ew.raisedThisPeriod} sub={`${ew.closedThisPeriod} closed this period`} />
                <Stat label="EW replies" value={`${ew.repliedOnTime} on time · ${ew.repliedLate} late`} sub={`${ew.awaitingReply} awaiting · ${ew.replyOverdue} overdue${ew.avgReplyDays != null ? ` · avg ${ew.avgReplyDays} days` : ""}`} />
                <Stat label="Compensation events" value={ce.total} sub={`${ce.implemented} implemented · ${ce.outstanding} outstanding · ${ce.draft} draft`} />
                <Stat label="CE implemented value" value={fmtGbp(ce.implementedValue)} sub={`${ce.implementedDays} days · ${ce.implementedThisPeriod} this period (${fmtGbp(ce.implementedValueThisPeriod)})`} />
                <Stat label="CE outstanding value" value={fmtGbp(ce.outstandingValue)} sub={`${ce.quotationOverdue} quotation${ce.quotationOverdue === 1 ? "" : "s"} overdue`} />
                <Stat label="CE notified this period" value={ce.raisedThisPeriod} />
                <Stat label="Issue date" value={fmt(data.asOf)} />
              </div>
            </>
          )}
          {pg.map((sec, si) => (
            <div key={si}>
              <h3 style={{ fontSize: 11, margin: "8px 0 4px" }}>{sec.block.title}{sec.continued ? " (continued)" : ""}</h3>
              <Table kind={sec.block.kind} rows={sec.rows} empty={sec.block.empty} />
            </div>
          ))}
          <PageFooter meta={meta} pageNum={startPage + pi} />
        </div>
      ))}
    </>
  );
}
