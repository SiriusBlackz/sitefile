import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Sitefile",
  description: "The terms that govern use of Sitefile.",
};

const UPDATED = "1 August 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <Section title="The service">
        <p>
          Sitefile is a progress evidence and reporting service for
          construction contractors: capture site photos, link them to your
          programme, and generate progress reports. These terms apply to all
          use of www.sitefile.app.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You&apos;re responsible for your account credentials and for the
          people you add to your organisation. Keep your sign-in details
          private and tell us promptly at support@sitefile.app if you believe
          your account is compromised.
        </p>
      </Section>

      <Section title="Your data stays yours">
        <p>
          Everything you upload — photos, programmes, project information — and
          every report you generate belongs to you. We claim no rights over it
          beyond what&apos;s needed to run the service (storing it, processing
          it, rendering your reports). See the privacy policy for how it&apos;s
          handled and how to get it out.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Use Sitefile only for lawful purposes and only with content you have
          the right to upload. Don&apos;t attempt to access other
          organisations&apos; data, disrupt the service, or use it to store
          material unrelated to construction project records.
        </p>
      </Section>

      <Section title="Fees">
        <p>
          Sitefile is charged at £99 per project, per month, unless otherwise
          agreed in writing (for example, a free pilot arrangement). Fees may
          change with at least 30 days&apos; notice.
        </p>
      </Section>

      <Section title="Evidence and reports">
        <p>
          Sitefile preserves the metadata your devices record and maintains an
          audit trail, but the accuracy of uploaded content, annotations and
          progress figures remains your responsibility. Reports are records of
          the data in your account and are not professional, legal or
          contractual advice.
        </p>
      </Section>

      <Section title="Availability and liability">
        <p>
          We work to keep Sitefile available and your data safe, but the
          service is provided &ldquo;as is&rdquo; and we can&apos;t guarantee
          uninterrupted availability. To the extent permitted by law, our
          total liability in any 12-month period is limited to the fees you
          paid for the service in that period. Nothing in these terms limits
          liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="Ending things">
        <p>
          You can stop using Sitefile and close your account at any time; data
          deletion follows the privacy policy. We may suspend accounts that
          breach these terms, with notice where practicable.
        </p>
      </Section>

      <Section title="Changes and law">
        <p>
          If these terms change materially, we&apos;ll notify account holders
          by email. These terms are governed by the laws of England and Wales.
        </p>
      </Section>
    </main>
  );
}
