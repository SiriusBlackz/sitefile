import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Sitefile",
  description: "How Sitefile collects, stores and protects your data.",
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

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <Section title="Who we are">
        <p>
          Sitefile (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a progress
          evidence and reporting service for construction contractors at
          www.sitefile.app. We are the data controller for account information,
          and we process the project data our customers upload on their behalf.
          Contact for anything in this policy:{" "}
          <a href="mailto:support@sitefile.app" className="text-primary hover:underline">
            support@sitefile.app
          </a>
          .
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong>Account data:</strong> your name, email address and
          authentication details (managed by our sign-in provider, Clerk).
        </p>
        <p>
          <strong>Project data you upload:</strong> project details, programme
          tasks, annotations, and site photos or videos. Photos include the
          metadata your device records — capture time, camera details and GPS
          position — because preserving that metadata is the point of the
          service: it is what makes your evidence verifiable.
        </p>
        <p>
          <strong>Daily site diary records:</strong>{" "}
          where your team keeps the
          site diary, we store the entries it contains — crew and plant counts,
          hold-up notes, safety figures and free-text notes — together with who
          entered them and when, because the diary&apos;s value depends on that
          record being kept intact.
        </p>
        <p>
          <strong>Activity records:</strong> an audit trail of actions taken in
          your projects (who did what, when), which appears in your reports and
          protects the integrity of your evidence.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Solely to provide the service: storing your evidence, linking it to
          your programme, generating your reports, and keeping your account
          secure. We do not sell your data, share it with advertisers, or use
          your project data to train AI models.
        </p>
        <p>
          If you import a programme as a PDF, that document is processed by an
          AI service (Anthropic) to extract the task list; it is not used for
          training and is not retained by us beyond the import.
        </p>
      </Section>

      <Section title="Where it lives">
        <p>
          Project data is stored in the European Union (Frankfurt, Germany) with
          our database provider, Supabase. Photos, videos and generated reports
          are stored in Cloudflare&apos;s secure object storage. The application
          is hosted on Vercel. Authentication is provided by Clerk and, when
          billing is active, payments are handled by Stripe — we never see or
          store your card details. Some providers may process data outside the
          UK/EU under appropriate safeguards (standard contractual clauses).
        </p>
      </Section>

      <Section title="Who can see your data">
        <p>
          Only members of your organisation can access your projects — data is
          isolated per company at the database level. Reports leave the system
          only when you send them, as password-protected PDFs if you choose.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          For as long as your account is active. If you close your account, we
          delete your data within 30 days, except where a legal obligation
          requires longer retention. You can request deletion at any time.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use essential cookies only — the ones required to keep you signed
          in. No advertising or cross-site tracking cookies, which is why you
          don&apos;t see a cookie banner.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under UK GDPR you can request access to, correction of, export of, or
          deletion of your personal data — email{" "}
          <a href="mailto:support@sitefile.app" className="text-primary hover:underline">
            support@sitefile.app
          </a>{" "}
          and we&apos;ll act on it. You also have the right to complain to the
          Information Commissioner&apos;s Office (ico.org.uk).
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes materially, we&apos;ll notify account holders
          by email and update the date at the top of this page.
        </p>
      </Section>
    </main>
  );
}
