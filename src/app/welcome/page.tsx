import Link from "next/link";
import type { Metadata } from "next";
import {
  Camera,
  Link2,
  FileText,
  MapPin,
  ShieldCheck,
  GanttChartSquare,
  Images,
  Lock,
  Smartphone,
} from "lucide-react";
import { SitefileMark } from "@/components/layout/sitefile-mark";
const btn =
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const btnPrimary = `${btn} bg-primary text-primary-foreground shadow hover:bg-primary/90`;
const btnOutline = `${btn} border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`;
const btnGhost = `${btn} hover:bg-accent hover:text-accent-foreground`;

export const metadata: Metadata = {
  title: "Sitefile — Site photos to client-ready progress reports",
  description:
    "Capture photos on site, link them to your programme, and send branded, password-protected PDF progress reports your client can trust. £99 per project, per month.",
};

const STEPS = [
  {
    icon: Camera,
    title: "Capture on site",
    body: "Take photos from your phone as work happens. GPS position, time and camera data are captured and preserved automatically.",
  },
  {
    icon: Link2,
    title: "Link to your programme",
    body: "Import your programme from MS Project, Primavera P6 or Excel. Sitefile suggests the right task for each photo using location and timing.",
  },
  {
    icon: FileText,
    title: "Report in one click",
    body: "Generate a branded, password-protected PDF progress report — programme status, evidence gallery, before/after and sign-off, ready to send.",
  },
];

const FEATURES = [
  {
    icon: MapPin,
    title: "GPS-verified evidence",
    body: "Every photo records where and when it was taken, matched against your site zones.",
  },
  {
    icon: ShieldCheck,
    title: "Tamper-evident trail",
    body: "Original camera data is preserved and every action is logged in an audit trail.",
  },
  {
    icon: GanttChartSquare,
    title: "Programme at a glance",
    body: "A Gantt view of your programme with evidence pinned to the dates it was captured.",
  },
  {
    icon: Images,
    title: "Before and after",
    body: "Earliest and latest photos are paired per task, showing progress without a word.",
  },
  {
    icon: Lock,
    title: "Controlled sharing",
    body: "Reports are password-protected PDFs — your client sees exactly what you send.",
  },
  {
    icon: Smartphone,
    title: "Built for site",
    body: "Works on your phone in the yard and on your laptop in the office. No app store needed.",
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <SitefileMark size={26} />
          <span className="text-lg font-semibold">Sitefile</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className={`${btnGhost} h-9 px-4`}
          >
            Sign in
          </Link>
          <Link href="/sign-up" className={`${btnPrimary} h-9 px-4`}>
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center md:pt-24">
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
          <Link
            href="/sign-up"
            className={`${btnPrimary} h-11 px-8`}
          >
            Start your first project
          </Link>
          <Link
            href="/sign-in"
            className={`${btnOutline} h-11 px-8`}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border bg-card p-6 shadow-sm"
              >
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

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Evidence your client doesn&apos;t have to take on trust
        </h2>
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Simple pricing
          </h2>
          <div className="mx-auto mt-10 max-w-sm rounded-xl border bg-card p-8 shadow-sm">
            <div className="text-5xl font-bold">
              £99
              <span className="text-lg font-normal text-muted-foreground">
                {" "}
                / project / month
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              One flat fee per live project. Photos, programme, reports and
              your whole site team included.
            </p>
            <Link
              href="/sign-up"
              className={`${btnPrimary} mt-6 h-11 w-full px-8`}
            >
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <SitefileMark size={16} />
            <span>Sitefile</span>
          </div>
          <span>© {new Date().getFullYear()} Sitefile</span>
        </div>
      </footer>
    </div>
  );
}
