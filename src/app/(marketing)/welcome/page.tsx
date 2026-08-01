/* eslint-disable @next/next/no-img-element -- static marketing screenshots */
import Link from "next/link";
import type { Metadata } from "next";
import {
  Camera,
  Link2,
  FileText,
  MapPin,
  ShieldCheck,
  Lock,
  History,
} from "lucide-react";
import { btnPrimary, btnOutline } from "../marketing-ui";

export const metadata: Metadata = {
  title: "Sitefile — Site photos to client-ready progress reports",
  description:
    "Capture photos on site, link them to your programme, and send branded, password-protected PDF progress reports your client can trust. £99 per project, per month.",
};

const STEPS = [
  {
    icon: Camera,
    title: "Capture on site",
    body: "Your team takes photos on their phones — same as today. GPS position, time and camera data are recorded automatically with every shot. Nothing to install.",
  },
  {
    icon: Link2,
    title: "Link to your programme",
    body: "Import your programme from MS Project, Excel or PDF. Sitefile suggests the right task for each photo using location and timing — you confirm in a click.",
  },
  {
    icon: FileText,
    title: "Report in one click",
    body: "A full progress report — written narrative, programme chart, photo records, verification and sign-off — generated as a branded, password-protected PDF.",
  },
];

const TOUR = [
  {
    id: "tour",
    kicker: "Programme",
    title: "Your programme, with the evidence pinned to it",
    body: "Import the programme you already run the job with. Track planned against actual, see progress per activity, and watch photo evidence appear on the timeline the day it was captured.",
    img: "/marketing/app-gantt.png",
    alt: "Sitefile programme Gantt view with evidence markers",
  },
  {
    kicker: "Evidence",
    title: "Every photo accounted for",
    body: "Photos land in one gallery — GPS-tagged, timestamped, linked to the right task. Filter by activity or phase, annotate from site, and nothing lives on someone's phone anymore.",
    img: "/marketing/app-evidence.png",
    alt: "Sitefile evidence gallery",
    flip: true,
  },
  {
    kicker: "Site zones",
    title: "Draw your site once — photos verify themselves",
    body: "Outline your site areas on the map. Every photo taken inside a zone is automatically verified against it, and the right task is suggested before anyone has to think about it.",
    img: "/marketing/app-zones.png",
    alt: "Sitefile GPS zones map editor",
  },
];

const FAQ_PREVIEW = [
  {
    q: "Do my site team need to install anything?",
    a: "No. Sitefile runs in the phone's browser and can be added to the home screen like an app — thirty seconds, no app store.",
  },
  {
    q: "What can I import my programme from?",
    a: "MS Project XML, Primavera P6 XML, Excel, or a PDF of the programme — tasks, dates, hierarchy and progress come across.",
  },
  {
    q: "Where does my project data live?",
    a: "Project data is stored in the EU (Frankfurt), photos in secure cloud storage, and every report is a password-protected PDF you control.",
  },
  {
    q: "How much does it cost?",
    a: "£99 per project, per month — flat. Photos, programme, reports and your whole site team included.",
  },
];

export default function WelcomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 text-center md:pt-20">
        <p className="mb-4 text-sm font-medium uppercase tracking-wide text-primary">
          For construction contractors
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Site photos in. Client-ready progress reports out.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Sitefile turns the photos your team already takes into verifiable
          progress evidence — linked to your programme and delivered as a
          branded PDF report your client can trust.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/sign-up" className={`${btnPrimary} h-11 px-8`}>
            Start your first project
          </Link>
          <Link href="/welcome#tour" className={`${btnOutline} h-11 px-8`}>
            See the product
          </Link>
        </div>
      </section>

      {/* Hero visual — the actual output */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <img
          src="/marketing/report-fan.png"
          alt="A generated Sitefile progress report — branded cover, executive summary with written narrative, and photo records"
          className="mx-auto w-full max-w-4xl"
        />
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Actual generated output — your logo, your colours, your client&apos;s
          logo. Produced in one click.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="border-t bg-muted/30 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Three steps — two of them are what your team already does.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product tour */}
      {TOUR.map((t) => (
        <section
          key={t.title}
          id={t.id}
          className="mx-auto max-w-6xl scroll-mt-16 px-6 py-16"
        >
          <div
            className={`flex flex-col items-center gap-10 lg:gap-16 ${
              t.flip ? "lg:flex-row-reverse" : "lg:flex-row"
            }`}
          >
            <div className="lg:w-2/5">
              <p className="mb-3 text-sm font-medium uppercase tracking-wide text-primary">
                {t.kicker}
              </p>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                {t.title}
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {t.body}
              </p>
            </div>
            <div className="lg:w-3/5">
              <img
                src={t.img}
                alt={t.alt}
                className="w-full rounded-xl border shadow-lg"
              />
            </div>
          </div>
        </section>
      ))}

      {/* Trust */}
      <section className="bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Evidence your client doesn&apos;t have to take on trust
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl gap-x-10 gap-y-8 sm:grid-cols-2">
            {[
              {
                icon: MapPin,
                title: "GPS-verified",
                body: "Every photo records where it was taken and is checked against your site zones automatically.",
              },
              {
                icon: History,
                title: "Tamper-evident",
                body: "Capture timestamps and camera metadata are preserved unchanged; every action is audit-logged.",
              },
              {
                icon: Lock,
                title: "Controlled sharing",
                body: "Reports are password-protected PDFs. Your client sees exactly what you send — nothing else.",
              },
              {
                icon: ShieldCheck,
                title: "Your data, protected",
                body: "Project data hosted in the EU, isolated per company, handled under UK GDPR.",
              },
            ].map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-slate-400">
            Full details in our{" "}
            <Link href="/privacy" className="text-blue-400 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Why Sitefile exists</h2>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          The monthly progress report shouldn&apos;t take a day: chasing photos
          off phones, matching them to the programme from memory, formatting the
          same document again at 9pm. The photos already exist — the evidence of
          when work was actually done already exists. Sitefile was built on live
          programmes to make that evidence organise itself, so the report is a
          click, not an evening — and so when a dispute lands months later, the
          proof is already filed.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t bg-muted/30 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Simple pricing</h2>
          <div className="mx-auto mt-10 max-w-sm rounded-xl border bg-card p-8 shadow-sm">
            <div className="text-5xl font-bold">
              £99
              <span className="text-lg font-normal text-muted-foreground">
                {" "}
                / project / month
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              One flat fee per live project. Photos, programme, reports and your
              whole site team included. No per-user charges.
            </p>
            <Link href="/sign-up" className={`${btnPrimary} mt-6 h-11 w-full px-8`}>
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ preview */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Common questions
        </h2>
        <div className="mt-10 space-y-6">
          {FAQ_PREVIEW.map((f) => (
            <div key={f.q} className="rounded-lg border bg-card p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          More questions answered on the{" "}
          <Link href="/support" className="text-primary hover:underline">
            support page
          </Link>
          .
        </p>
      </section>

      {/* CTA band */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Your next progress report could take one click.
          </h2>
          <Link
            href="/sign-up"
            className="inline-flex h-11 items-center justify-center rounded-md bg-white px-8 text-sm font-medium text-slate-900 shadow hover:bg-slate-100"
          >
            Start your first project
          </Link>
        </div>
      </section>
    </main>
  );
}
