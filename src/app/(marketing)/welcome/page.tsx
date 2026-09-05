import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Stamp, Plate, mkBtnAmber, mkBtnInk } from "../marketing-ui";
import { FaqAccordion, type FaqItem } from "./faq-accordion";

export const metadata: Metadata = {
  title: "Sitefile — Site diary & client progress reports for contractors",
  description:
    "A daily site diary your foreman locks in about ninety seconds on a routine day, and a client report engine that turns site photos and your programme into a branded, evidence-backed PDF. £99 per project per month, unlimited users.",
};

/* ---------- content ---------- */

const REPORT_SECTIONS = [
  "Cover",
  "Contents",
  "Executive Summary",
  "Key Issues & Early Warnings",
  "Key Dates & Milestones",
  "Programme Timeline",
  "Lookahead",
  "Photo Location Map",
  "Site Diary Summary",
  "Progress Records",
  "Before / After",
  "Verification & Metadata",
  "Sign-Off",
];

const MECHS = [
  {
    k: "LOCKED DAYS",
    body: (
      <>
        Each diary locks as a <b>dated record</b>{" "}
        with the author&rsquo;s name
        and time. Locking is deliberate — one button, eyes open.
      </>
    ),
  },
  {
    k: "AMENDMENTS, NOT EDITS",
    body: (
      <>
        Corrections after lock are <b>flagged amendments</b>. The original entry
        is preserved and stays visible. Nothing is silently rewritten.
      </>
    ),
  },
  {
    k: "DUAL TIMESTAMPS",
    body: (
      <>
        Offline entries carry both stamps: <b>entered on site, received by the
        server</b>. The gap is shown, not smoothed over.
      </>
    ),
  },
  {
    k: "FINGERPRINTED PDFS",
    body: (
      <>
        Issued reports are <b>AES-256 encrypted</b> when password-protected, and
        carry a <b>SHA-256 fingerprint</b> so any copy can be checked against
        the original.
      </>
    ),
  },
  {
    k: "DELIVERY RECEIPTS",
    body: (
      <>
        Reports go from your own email with a live receipt of{" "}
        <b>link access and PDF-download activity</b>{" "}
        — you see when the report was opened and when the PDF came down.
      </>
    ),
  },
  {
    k: "AUDIT TRAIL",
    body: (
      <>
        Uploads, links, approvals, sends — <b>logged as they happen</b>, and
        summarised on the report&rsquo;s verification page.
      </>
    ),
  },
];

const REPLACES = [
  {
    t: "The night-before assembly job",
    body: "Hunting photos across WhatsApp and camera rolls, pasting them into a document, writing the month from memory.",
  },
  {
    t: "The diary that never got kept",
    body: "The A4 book that stops in week three — and the delay claim that has nothing contemporaneous behind it.",
  },
  {
    t: "The “did they even read it?” silence",
    body: "Reports issued into the void. The receipt tells you when it was opened and when the PDF came down.",
  },
];

const FAQS: FaqItem[] = [
  {
    q: "Do we have to run the diary to get the reports?",
    a: "No. Photos plus your programme produce the complete report on their own. The diary adds the Site Diary Summary page and the delay ledger when — and only when — you choose to run it.",
  },
  {
    q: "My foremen won’t type.",
    a: "They mostly don’t have to. The diary is ticks on pre-filled answers — work done drafts from the day’s photos, crew and plant carry over from yesterday, and a hold-up is a cause button and an hours count. If a day still slips, the PM can complete it from the desk, and the record shows exactly who entered what, and when.",
  },
  {
    q: "There’s no signal on half our sites.",
    a: "Capture and the diary work fully offline and sync when the phone finds coverage. Both timestamps are kept and printed — entered and received — so nobody can accuse the record of being written after the fact.",
  },
  {
    q: "Is the photo metadata independently verified?",
    a: "No, and we won’t claim it is. Camera metadata and GPS are recorded as supplied by the device and preserved unchanged, and the report discloses exactly that. What Sitefile adds is the discipline around it: locked days, flagged amendments, capture-to-upload timing, and a traceable activity history of key report and evidence actions.",
  },
  {
    q: "Can a locked day be changed afterwards?",
    a: "Not silently. Corrections are added as flagged amendments with a name and a time, and the original entry always remains visible underneath.",
  },
  {
    q: "Whose report is it — yours or ours?",
    a: "Yours. Your logo on the cover, your details throughout, issued from your own email address — password-protected if you choose, with the report’s SHA-256 fingerprint printed on it.",
  },
];

/* ---------- local pieces ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mk-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mk-amber-ink)]">
      {children}
    </span>
  );
}

function Lead({
  children,
  dark = false,
  className = "",
}: {
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`mk-rv max-w-[34rem] text-lg leading-[1.65] ${
        dark ? "text-[var(--mk-d-muted)]" : "text-[var(--mk-ink-soft)]"
      } ${className}`}
    >
      {children}
    </p>
  );
}

function H2({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`mk-rv mb-4 max-w-[24ch] text-[clamp(1.9rem,3.4vw,2.7rem)] ${className}`}
    >
      {children}
    </h2>
  );
}

function Feat({
  k,
  first = false,
  children,
}: {
  k: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mk-rv border-t border-[var(--mk-rule)] pb-1 pt-5 ${
        first ? "mt-[30px]" : "mt-5"
      }`}
    >
      <span className="mk-mono mb-2 block text-xs font-semibold tracking-[0.12em] text-[var(--mk-amber-ink)]">
        {k}
      </span>
      <p className="max-w-[56ch] text-[0.97rem] text-[var(--mk-ink-soft)] [&_b]:text-[var(--mk-ink)]">
        {children}
      </p>
    </div>
  );
}

const wrap = "mx-auto max-w-[1120px] px-6";

/* ---------- page ---------- */

export default function WelcomePage() {
  return (
    <main>
      {/* ============ HERO ============ */}
      <div className="mk-hero relative overflow-hidden border-b border-[var(--mk-rule)]">
        <div
          className={`${wrap} relative grid items-center gap-12 py-14 min-[961px]:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] min-[961px]:pb-[84px] min-[961px]:pt-[72px]`}
        >
          <div>
            <Eyebrow>Contractor progress evidence · kept properly</Eyebrow>
            <h1 className="mb-[22px] mt-[18px] text-[clamp(2.5rem,5.4vw,4.15rem)]">
              The day goes{" "}
              <span className="bg-[linear-gradient(transparent_68%,var(--mk-amber)_68%,var(--mk-amber)_92%,transparent_92%)]">
                on the record
              </span>
              . The report writes itself.
            </h1>
            <p className="max-w-[34rem] text-lg leading-[1.65] text-[var(--mk-ink-soft)] [&_b]:text-[var(--mk-ink)]">
              Sitefile is two tools on one spine: a <b>daily site diary</b> your
              foreman locks in about ninety seconds on a routine day, and a{" "}
              <b>client report engine</b>{" "}
              that turns site photos and your
              programme into a branded, evidence&#8209;backed PDF. Use either on
              its own. Run both, and the report draws straight from the record.
            </p>
            <div className="mb-[26px] mt-[30px] flex flex-wrap items-center gap-[18px]">
              <Link href="/sign-up" className={mkBtnAmber}>
                Start free pilot
              </Link>
              <a
                href="/marketing/sitefile-sample-report.pdf"
                target="_blank"
                className={mkBtnInk}
              >
                View a sample report
              </a>
              <span className="mk-mono text-xs text-[var(--mk-muted)]">
                or email{" "}
                <a
                  href="mailto:support@sitefile.app"
                  className="text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
                >
                  support@sitefile.app
                </a>
              </span>
            </div>
            <div className="mk-mono inline-flex flex-wrap gap-x-3.5 border border-[var(--mk-rule-strong)] border-l-[3px] border-l-[var(--mk-amber)] bg-[var(--mk-paper)] px-4 py-2.5 text-xs text-[var(--mk-ink-soft)]">
              <b className="font-semibold text-[var(--mk-ink)]">£99</b> per
              project / month
              <span className="text-[var(--mk-rule-strong)]">·</span>
              unlimited users
              <span className="text-[var(--mk-rule-strong)]">·</span>
              free pilot
              <span className="text-[var(--mk-rule-strong)]">·</span>
              cancel monthly
            </div>
          </div>
          <div className="mk-rv min-[961px]:justify-self-center">
            <Plate cap="PHONE HOME" capDim="DEMO PROJECT" className="mx-auto max-w-[290px]">
              <Image
                src="/marketing/diary-home.png"
                width={416}
                height={900}
                alt="Sitefile phone home screen: Capture button, today's diary card, hold-up logger and the report gap list"
                priority
              />
            </Plate>
          </div>
        </div>
      </div>

      {/* ============ TWO PILLARS ============ */}
      <section className="border-b border-[var(--mk-rule)] py-16 min-[761px]:py-[84px]">
        <div className={wrap}>
          <Stamp refText="SITEFILE" label="Two tools · one spine" />
          <H2>Two things, properly. Not ten things, nearly.</H2>
          <Lead>
            Each pillar earns its keep on its own. Nothing here obliges you to
            use the other half.
          </Lead>
          <div className="mt-[38px] grid gap-[22px] min-[761px]:grid-cols-2">
            {[
              {
                pref: "PILLAR 1",
                title: "The Daily Site Diary",
                body: "The day, locked while it’s still today. Work done pre-drafted from the day’s photos, crew and plant carried from yesterday, hold-ups logged the moment they happen — ticks, not typing.",
                alone: "STANDS ALONE — RUN THE DIARY WITHOUT THE REPORTS",
              },
              {
                pref: "PILLAR 2",
                title: "The Client Report Engine",
                body: "Photos plus programme in; a branded, password-protected progress report out. AI-drafted narrative your PM approves, milestone variance, photo map, verification pages, sign-off.",
                alone: "STANDS ALONE — NO DIARY REQUIRED FOR THE FULL REPORT",
              },
            ].map((p) => (
              <article
                key={p.pref}
                className="mk-rv flex flex-col gap-3.5 rounded-[2px] border border-[var(--mk-rule-strong)] bg-[var(--mk-paper)] px-[30px] pb-[26px] pt-[30px]"
              >
                <span className="mk-mono text-xs font-semibold tracking-[0.12em] text-[var(--mk-amber-ink)]">
                  {p.pref}
                </span>
                <h3 className="text-[1.45rem]">{p.title}</h3>
                <p className="text-[0.98rem] text-[var(--mk-ink-soft)]">
                  {p.body}
                </p>
                <span className="mk-mono mt-auto border-t border-dashed border-[var(--mk-rule-strong)] pt-4 text-xs text-[var(--mk-muted)]">
                  <b className="font-semibold text-[var(--mk-ok)]">✓</b>&nbsp;{" "}
                  {p.alone}
                </span>
              </article>
            ))}
          </div>
          <div className="mk-rv mt-[22px] flex flex-col gap-2 rounded-[2px] border border-[var(--mk-amber-deep)] bg-[var(--mk-amber-tint)] px-7 py-[22px] min-[761px]:flex-row min-[761px]:items-baseline min-[761px]:gap-5">
            <span className="mk-mono whitespace-nowrap text-xs font-semibold tracking-[0.12em] text-[var(--mk-amber-ink)]">
              COMBINED — STRONGER
            </span>
            <p className="max-w-[62ch] text-[0.98rem] text-[var(--mk-ink-soft)]">
              Run both and the day&rsquo;s record flows into the report on its
              own: a Site Diary Summary page, hold&#8209;ups feeding a delay
              ledger by cause, the day&rsquo;s work lines pre&#8209;drafting the
              narrative. The monthly report stops being an act of memory.
            </p>
          </div>
        </div>
      </section>

      {/* ============ REC 01 — DIARY ============ */}
      <section id="diary" className="scroll-mt-16 py-16 min-[761px]:py-[84px]">
        <div className={wrap}>
          <Stamp refText="REC 01" label="The daily site diary" />
          <div className="grid items-start gap-10 min-[961px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-[961px]:gap-14">
            <div>
              <H2>Ninety seconds at the gate, and the day is on the record.</H2>
              <Lead>
                Diaries fail because they ask a foreman to write an essay at
                17:00. Sitefile asks for ticks. Most of the page is already
                filled in — designed to take around ninety seconds on a
                routine day.
              </Lead>
              <Feat k="THE 90-SECOND LOCK" first>
                <b>Work done</b>{" "}
                is pre&#8209;drafted from the day&rsquo;s
                photos. <b>Crew and plant counts</b> carry over from yesterday —
                change them only if they changed. Visitors, inspections, toolbox
                talks and incidents are a tap each. <b>Weather records itself.</b>{" "}
                Then one button: lock today&rsquo;s diary, with your name and
                time on it.
              </Feat>
              <Feat k="THE 10-SECOND HOLD-UP">
                Waiting on information, no access, materials late, plant down —
                logged the moment it happens,{" "}
                <b>timestamped, with hours lost against a cause</b>. Every entry
                accrues into a delay ledger by cause. And even{" "}
                <b>&ldquo;no hold&#8209;ups today&rdquo; goes on the record</b> —
                when a delay claim lands months later, the quiet days count as
                much as the loud ones.
              </Feat>
              <Feat k="OFFLINE, HONESTLY">
                No signal in the basement? Everything still works, and the entry
                carries <b>both timestamps when it syncs</b> —{" "}
                <span className="mk-mono text-[0.85em]">
                  entered 16:52 · received 19:40
                </span>
                . Days lock as dated records; corrections afterwards are flagged
                amendments, with the original always preserved.
              </Feat>
            </div>
            <div className="mk-rv min-[961px]:justify-self-center">
              <Plate
                cap="LOG A HOLD-UP"
                capDim="~10 SECONDS"
                className="mx-auto max-w-[290px]"
              >
                <Image
                  src="/marketing/diary-holdup-sheet.png"
                  width={416}
                  height={900}
                  alt="Sitefile hold-up logger: cause buttons for weather, awaiting information, no access, materials late and plant down, with hours lost, task and photo attach"
                />
              </Plate>
            </div>
          </div>
          <figure className="mk-rv mt-14">
            <Plate
              cap="THE PM DESK"
              capDim="COVERAGE · WEEK STRIP · DELAY LEDGER BY CAUSE"
            >
              <Image
                src="/marketing/diary-desk.png"
                width={900}
                height={707}
                alt="Sitefile PM desk Site Diary view: weekly coverage strip, labour and hours-lost figures, and the delay ledger grouped by cause"
                className="w-full"
              />
            </Plate>
          </figure>
        </div>
      </section>

      {/* ============ REC 02 — REPORT ============ */}
      <section
        id="report"
        className="scroll-mt-16 border-y border-[var(--mk-rule)] bg-[var(--mk-paper)] py-16 min-[761px]:py-[84px]"
      >
        <div className={wrap}>
          <Stamp refText="REC 02" label="The client report engine" />
          <div className="grid items-start gap-10 min-[961px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[961px]:gap-14">
            <div className="mk-rv order-2 min-[961px]:order-1">
              <div className="grid items-start gap-[26px] min-[500px]:grid-cols-[1fr_1.35fr]">
                <Plate cap="COVER" capDim="YOUR BRAND">
                  <Image
                    src="/marketing/report-cover.png"
                    width={636}
                    height={900}
                    alt="Sitefile progress report cover page with contractor branding, client logo, project reference and reporting period"
                  />
                </Plate>
                <Plate cap="PHOTO LOCATION MAP" capDim="GPS WHERE AVAILABLE">
                  <Image
                    src="/marketing/report-photo-map.png"
                    width={637}
                    height={900}
                    alt="Sitefile report Photo Location Map page: numbered photo pins plotted on satellite imagery with site zones outlined"
                  />
                </Plate>
              </div>
            </div>
            <div className="order-1 min-[961px]:order-2">
              <H2>Report day, without the late night.</H2>
              <Lead>
                Import the programme — MS Project, P6, Excel, even a PDF.
                Capture GPS&#8209;tagged photos on phones, offline&#8209;capable,
                with zone&#8209;suggested task linking. Then generate a report
                you&rsquo;d put your name to.
              </Lead>
              <Feat k="DRAFTED, THEN APPROVED" first>
                An AI&#8209;drafted narrative{" "}
                <b>the PM reads, edits and approves</b> — nothing leaves the
                building unread. Milestone variance against the accepted
                programme, weather for the period, progress records grouped by
                task.
              </Feat>
              <Feat k="TIERED APPROVAL, OPTIONAL">
                Site manager prepares → PM reviews → construction manager signs
                off. <b>The report is held from the client until it&rsquo;s
                approved.</b> Or switch it off and send directly — your call,
                per project.
              </Feat>
              <Feat k="SENT LIKE YOU SENT IT">
                Issued from <b>your own email address</b>, password&#8209;protected
                (AES&#8209;256) if you choose, with a live delivery receipt —
                you&rsquo;ll see opened and downloaded. No diary required:{" "}
                <b>photos + programme alone build the full report.</b>
              </Feat>
            </div>
          </div>
          <div className="mk-rv mt-10">
            <span className="mk-mono mb-3 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mk-muted)]">
              Every section of the issued report
            </span>
            <div className="flex flex-wrap gap-2" aria-label="Report contents">
              {REPORT_SECTIONS.map((s) => (
                <span
                  key={s}
                  className="mk-mono border border-[var(--mk-rule-strong)] bg-[var(--mk-dust)] px-[11px] py-1.5 text-xs font-medium text-[var(--mk-ink-soft)]"
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="mk-mono mt-4 text-xs">
              <a
                href="/marketing/sitefile-sample-report.pdf"
                target="_blank"
                className="text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
              >
                View a full sample report (PDF, demonstration project)
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ============ REC 03 — COMBINED ============ */}
      <section id="combined" className="scroll-mt-16 py-16 min-[761px]:py-[84px]">
        <div className={wrap}>
          <Stamp refText="REC 03" label="Combined — the diary walks into the report" />
          <div className="grid items-start gap-10 min-[961px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] min-[961px]:gap-14">
            <div>
              <H2>Every working day, accounted for. In writing.</H2>
              <Lead>
                With both pillars running, the report gains a Site Diary
                Summary: labour, plant, weather, hold&#8209;ups and record
                status for every working day of the period.
              </Lead>
              <Feat k="HONEST GAPS" first>
                Days without a record say <b>&ldquo;no record made&rdquo;</b> —
                in red, on the page. That candour is the point: a diary that
                admits its gaps is believed on the days it speaks.
              </Feat>
              <Feat k="THE LEDGER, IN CONTEXT">
                Hold&#8209;ups appear against the day they were logged,
                hours&#8209;lost totalled by cause — the raw material of an
                extension&#8209;of&#8209;time conversation, gathered while it
                happened rather than reconstructed after.
              </Feat>
            </div>
            <figure className="mk-rv min-[961px]:justify-self-center">
              <Plate
                cap="SITE DIARY SUMMARY"
                capDim="FROM THE ISSUED REPORT"
                className="mx-auto max-w-[420px]"
              >
                <Image
                  src="/marketing/report-diary-summary.png"
                  width={636}
                  height={900}
                  alt="Sitefile report Site Diary Summary page: a day-by-day table of labour, plant, weather, hold-ups, and record status including honest 'no record made' rows"
                />
              </Plate>
            </figure>
          </div>
        </div>
      </section>

      {/* ============ REC 04 — EVIDENCE (DARK) ============ */}
      <section
        id="evidence"
        className="mk-hazard-top relative scroll-mt-16 bg-[var(--mk-ink)] py-20 text-[var(--mk-dust)] min-[761px]:py-24"
      >
        <div className={wrap}>
          <Stamp refText="REC 04" label="Why it holds up" dark />
          <H2 className="text-[var(--mk-dust)]">
            Evidence is a discipline, not a feature.
          </H2>
          <Lead dark>
            Everything in Sitefile is built so that what you show a client — or,
            one day, an adjudicator — is exactly what happened, in the order it
            happened.
          </Lead>
          <div className="mt-11 grid grid-cols-1 gap-px border border-[var(--mk-d-rule)] bg-[var(--mk-d-rule)] min-[500px]:grid-cols-2 min-[961px]:grid-cols-3">
            {MECHS.map((m) => (
              <div key={m.k} className="mk-rv bg-[var(--mk-ink)] px-6 py-[26px]">
                <span className="mk-mono mb-2.5 block text-xs font-semibold tracking-[0.12em] text-[var(--mk-amber)]">
                  {m.k}
                </span>
                <p className="text-[0.92rem] leading-relaxed text-[var(--mk-d-muted)] [&_b]:font-semibold [&_b]:text-[var(--mk-dust)]">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid items-start gap-8 min-[961px]:grid-cols-[minmax(0,1fr)_300px]">
            <div className="mk-rv border border-[var(--mk-amber)] px-7 py-[26px]">
              <span className="mk-mono block text-xs font-semibold tracking-[0.14em] text-[var(--mk-amber)]">
                WHAT WE WON&rsquo;T SAY
              </span>
              <p className="mt-2.5 max-w-[70ch] text-[0.95rem] text-[var(--mk-d-muted)] [&_b]:font-semibold [&_b]:text-[var(--mk-dust)]">
                Photo metadata is{" "}
                <b>recorded as supplied and preserved unchanged</b>{" "}
                — we
                don&rsquo;t call it &ldquo;verified&rdquo;. There&rsquo;s{" "}
                <b>GPS captured where available</b>, plotted against your site
                zones — and where a photo has no location, the report says so
                plainly. The report&rsquo;s
                own verification page uses the same careful wording, so the
                record stays credible when it matters.
              </p>
            </div>
            <figure className="mk-rv min-[961px]:justify-self-end">
              <Plate
                cap="VERIFICATION & METADATA"
                capDim="AS ISSUED"
                className="mx-auto max-w-[300px]"
              >
                <Image
                  src="/marketing/report-verification.png"
                  width={636}
                  height={900}
                  alt="Sitefile report Verification & Metadata page: camera metadata presence, site-zone checks, capture-to-upload timing analysis and the audit trail summary"
                />
              </Plate>
            </figure>
          </div>
        </div>
      </section>

      {/* ============ REC 05 — HOW IT RUNS ============ */}
      <section id="how" className="scroll-mt-16 py-16 min-[761px]:py-[84px]">
        <div className={wrap}>
          <Stamp refText="REC 05" label="How it runs" />
          <H2>Set up once. Then the site does the work.</H2>
          <div className="mt-11 grid gap-[22px] min-[761px]:grid-cols-3">
            {[
              {
                n: "01 · ONCE",
                title: "Load the project",
                body: "Import the programme (MS Project, P6, Excel, PDF), draw your site zones on the map, add the whole team — users are unlimited.",
                t: "~ AN AFTERNOON",
              },
              {
                n: "02 · DAILY",
                title: "Capture and lock",
                body: "Photos from phones, GPS captured where available. Hold-ups in ten seconds as they bite. The diary locked in about ninety, at the gate.",
                t: "~ 2 MINUTES A DAY, ALL IN",
              },
              {
                n: "03 · REPORT DAY",
                title: "Approve and send",
                body: "The draft assembles itself from the period’s record. PM approves the narrative, sign-off runs if you use it, and it goes out with a receipt.",
                t: "~ MINUTES, NOT AN EVENING",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="mk-rv rounded-[2px] border border-[var(--mk-rule-strong)] bg-[var(--mk-paper)] px-[26px] pb-6 pt-[26px]"
              >
                <span className="mk-mono mb-4 inline-block bg-[var(--mk-ink)] px-[9px] py-1 text-xs font-semibold text-[var(--mk-dust)]">
                  {s.n}
                </span>
                <h3 className="mb-2.5 text-[1.15rem]">{s.title}</h3>
                <p className="text-[0.93rem] text-[var(--mk-ink-soft)]">
                  {s.body}
                </p>
                <span className="mk-mono mt-3.5 block text-xs tracking-[0.08em] text-[var(--mk-amber-ink)]">
                  {s.t}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ REC 06 — PRICING ============ */}
      <section
        id="pricing"
        className="scroll-mt-16 border-t border-[var(--mk-rule)] py-16 min-[761px]:py-[84px]"
      >
        <div className={wrap}>
          <Stamp refText="REC 06" label="Pricing" />
          <div className="grid items-start gap-10 min-[961px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] min-[961px]:gap-14">
            <div>
              <H2>One number. Per project.</H2>
              <Lead>
                Priced per project, not per seat, so the whole site team is on
                it — foremen, engineers, PM, CM — without anyone counting
                licences. Start with a free pilot on a real project and judge it
                on a real reporting cycle.
              </Lead>
              <div className="mk-rv mt-8 rounded-[2px] border border-[var(--mk-rule-strong)] bg-[var(--mk-paper)] px-7 py-6">
                <h3 className="text-[1.05rem]">What the £99 replaces</h3>
                <div className="mt-4 grid gap-4">
                  {REPLACES.map((r) => (
                    <div key={r.t}>
                      <b className="text-[0.95rem] text-[var(--mk-ink)]">
                        {r.t}
                      </b>
                      <p className="mt-0.5 text-[0.92rem] text-[var(--mk-ink-soft)]">
                        {r.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mk-rv rounded-[2px] border border-[var(--mk-rule-strong)] border-t-4 border-t-[var(--mk-amber)] bg-[var(--mk-paper)] px-7 pb-[34px] pt-10 min-[500px]:px-10">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-[clamp(3.4rem,6vw,4.6rem)] font-black leading-none tracking-[-0.03em]">
                  £99
                </span>
                <span className="mk-mono text-xs leading-normal text-[var(--mk-muted)]">
                  PER PROJECT / MONTH
                  <br />
                  UNLIMITED USERS
                </span>
              </div>
              <ul className="mt-[26px] grid list-none gap-3 p-0">
                {[
                  ["Free pilot", " — the full product on a live project first"],
                  ["Unlimited users", " on the project, no per-seat maths"],
                  [
                    "Everything included",
                    " — diary, reports, approvals, receipts",
                  ],
                  ["Cancel monthly", " — no annual lock-in"],
                ].map(([b, rest]) => (
                  <li
                    key={b}
                    className="flex items-baseline gap-3 text-[0.97rem] text-[var(--mk-ink-soft)]"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 flex-none translate-y-px bg-[var(--mk-amber)]"
                    />
                    <span>
                      <b className="text-[var(--mk-ink)]">{b}</b>
                      {rest}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 border border-dashed border-[var(--mk-rule-strong)] bg-[var(--mk-dust)] px-5 py-4">
                <span className="mk-mono block text-xs font-semibold tracking-[0.14em] text-[var(--mk-ink)]">
                  PILOT TERMS, PLAINLY
                </span>
                <ul className="mt-2.5 grid list-none gap-1.5 p-0 text-[0.9rem] text-[var(--mk-ink-soft)]">
                  <li>
                    The pilot runs your first full reporting cycle on one live
                    project — typically a month.
                  </li>
                  <li>No card to start. Nothing is charged during the pilot.</li>
                  <li>
                    Billing begins only if you choose to carry on — agreed with
                    you first, never automatic.
                  </li>
                  <li>
                    After that it&rsquo;s £99 per project / month, cancel
                    monthly, and your data exports any time.
                  </li>
                </ul>
              </div>
              <div className="mt-[26px] flex flex-wrap items-center gap-5">
                <Link href="/sign-up" className={mkBtnInk}>
                  Start free pilot
                </Link>
                <a
                  href="/marketing/sitefile-sample-report.pdf"
                  target="_blank"
                  className="mk-mono text-xs text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
                >
                  View a sample report
                </a>
              </div>
              <p className="mk-mono mt-4 text-xs text-[var(--mk-muted)]">
                Running several projects? Email{" "}
                <a
                  href="mailto:support@sitefile.app"
                  className="text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
                >
                  support@sitefile.app
                </a>{" "}
                for a portfolio arrangement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ REC 07 — FOUNDER ============ */}
      <section className="border-y border-[var(--mk-rule)] bg-[var(--mk-paper)] py-16 min-[761px]:py-[84px]">
        <div className={`${wrap} max-w-[810px]`}>
          <Stamp refText="REC 07" label="A straight word" />
          <H2>Founder-led, by someone who&rsquo;s stood where you stand.</H2>
          <p className="mk-rv mt-[18px] text-[1.05rem] leading-[1.75] text-[var(--mk-ink-soft)]">
            Sitefile is built and run by its founder — a construction
            professional, not a software company&rsquo;s idea of one. It exists
            because chasing photos off five phones the night before a client
            report is a miserable way to spend a Thursday, and because the
            diary that would have settled the argument is always the one nobody
            kept.
          </p>
          <p className="mk-rv mt-[18px] text-[1.05rem] leading-[1.75] text-[var(--mk-ink-soft)] [&_b]:text-[var(--mk-ink)]">
            What that means for you:{" "}
            <b>
              demos, setup and support come directly from the person who wrote
              the code
            </b>{" "}
            — usually the same day. What it doesn&rsquo;t mean: shortcuts on
            the record. Everything on this page is in the product today, your
            data exports whenever you ask, and backups run daily.
          </p>
          {/* TODO: founder name pending decision */}
          <p className="mk-rv mk-mono mt-6 text-xs text-[var(--mk-muted)]">
            — the founder of Sitefile ·{" "}
            <a
              href="mailto:support@sitefile.app"
              className="text-[var(--mk-amber-ink)]"
            >
              support@sitefile.app
            </a>
          </p>
        </div>
      </section>

      {/* ============ REC 08 — FAQ ============ */}
      <section id="faq" className="scroll-mt-16 py-16 min-[761px]:py-[84px]">
        <div className={wrap}>
          <Stamp refText="REC 08" label="Fair questions" />
          <H2>The questions worth asking first.</H2>
          <FaqAccordion items={FAQS} />
          <p className="mk-rv mk-mono mt-[26px] text-xs">
            More questions answered at{" "}
            <Link
              href="/support"
              className="text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
            >
              sitefile.app/support
            </Link>
          </p>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="border-t border-[var(--mk-amber-deep)] bg-[var(--mk-amber)] py-20 text-[var(--mk-ink)] min-[761px]:py-[88px]">
        <div className={wrap}>
          <h2 className="mk-rv max-w-[20ch] text-[clamp(2.1rem,4.4vw,3.3rem)]">
            Put the next report on the record.
          </h2>
          <p className="mk-rv mk-mono mt-3.5 text-xs text-[var(--mk-ink)]">
            FREE PILOT ON A REAL PROJECT · £99 PER PROJECT / MONTH AFTER ·
            CANCEL MONTHLY
          </p>
          <div className="mk-rv mt-[34px] flex flex-wrap items-center gap-[22px]">
            <Link href="/sign-up" className={mkBtnInk}>
              Start free pilot
            </Link>
            <span className="mk-mono text-xs text-[var(--mk-ink)]">
              or email{" "}
              <a
                href="mailto:support@sitefile.app"
                className="text-[var(--mk-ink)] underline underline-offset-[3px]"
              >
                support@sitefile.app
              </a>{" "}
              — you&rsquo;ll get the person who builds it
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
