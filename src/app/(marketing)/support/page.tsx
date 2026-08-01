import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support & FAQs — Sitefile",
  description:
    "Help, frequently asked questions and support contact for Sitefile.",
};

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do photos get from site into a report?",
    a: "Your team takes photos in Sitefile on their phones. Each photo records GPS position and capture time automatically. In the office you (or Sitefile's suggestions) link photos to programme tasks, and the report gathers everything for the period into a branded PDF — narrative, programme chart, photo records, verification and sign-off.",
  },
  {
    q: "Do my site team need to install anything?",
    a: "No. Sitefile runs in the phone's browser at www.sitefile.app. To make it feel like an app, add it to the home screen: on iPhone open it in Safari → Share → Add to Home Screen; on Android Chrome tap Install when prompted.",
  },
  {
    q: "What formats can I import my programme from?",
    a: "MS Project XML, Primavera P6 XML, Excel (.xlsx) with a column-mapping step, or a PDF of the programme (read automatically, with an editable preview before anything is imported). Tasks, dates, hierarchy and percent-complete come across.",
  },
  {
    q: "Where is my data stored, and who can see it?",
    a: (
      <>
        Project data is stored in the EU (Frankfurt); photos and reports in
        secure cloud object storage. Your company&apos;s data is isolated —
        only members of your organisation can access your projects. Reports
        are shared by you, as password-protected PDFs. Full details are in the{" "}
        <Link href="/privacy" className="text-primary hover:underline">
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    q: "What happens to photo GPS and timestamps?",
    a: "They're recorded by the device at the moment of capture and preserved unchanged. Photos taken inside your drawn site zones are automatically verified against them, and every report includes a verification section showing GPS and metadata rates.",
  },
  {
    q: "Does it work with poor signal on site?",
    a: "Yes — photos taken with no signal queue on the device and upload automatically when a connection returns.",
  },
  {
    q: "Can my client receive the report without a Sitefile account?",
    a: "Yes. The report is a normal PDF — you send it exactly as you send reports today (email, WhatsApp, upload to their system). If you set a password, they'll need it to open the file.",
  },
  {
    q: "How much does it cost?",
    a: "£99 per project, per month — one flat fee per live project, covering photos, programme, reports and your whole team. No per-user charges.",
  },
  {
    q: "Can I get my data out?",
    a: "Your reports are yours as PDFs at any time, and you can request a full export of your project data — see the privacy policy for your data rights.",
  },
  {
    q: "Something's broken or confusing — what do I do?",
    a: (
      <>
        Email{" "}
        <a href="mailto:support@sitefile.app" className="text-primary hover:underline">
          support@sitefile.app
        </a>{" "}
        with a screenshot if you can. Pilot customers: message your onboarding
        contact directly — same-evening replies.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Support &amp; FAQs</h1>
      <p className="mt-3 text-muted-foreground">
        Answers to the questions we hear most. Can&apos;t find yours? Email{" "}
        <a href="mailto:support@sitefile.app" className="text-primary hover:underline">
          support@sitefile.app
        </a>
        .
      </p>

      <div className="mt-10 space-y-6">
        {FAQS.map((f) => (
          <div key={f.q} className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">{f.q}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-semibold">Contact</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Support:{" "}
          <a href="mailto:support@sitefile.app" className="text-primary hover:underline">
            support@sitefile.app
          </a>
          <br />
          We aim to respond the same working day.
        </p>
      </div>
    </main>
  );
}
