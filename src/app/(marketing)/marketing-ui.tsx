import Link from "next/link";
import { SitefileMark } from "@/components/layout/sitefile-mark";
import { MobileMenu } from "./mobile-menu";

/* ---------- shared button styles (The Graft) ---------- */

const mkBtnBase =
  "mk-disp inline-block rounded-[2px] border border-transparent px-[26px] py-[13px] text-[0.95rem] leading-tight font-bold no-underline transition duration-150";

export const mkBtnAmber = `${mkBtnBase} bg-[var(--mk-amber)] text-[var(--mk-ink)] shadow-[0_1px_0_var(--mk-amber-deep)] hover:-translate-y-px hover:bg-[#F09E14] hover:shadow-[0_3px_10px_rgba(200,127,6,0.35)]`;

export const mkBtnInk = `${mkBtnBase} bg-[var(--mk-ink)] text-[var(--mk-dust)] hover:-translate-y-px hover:shadow-[0_3px_10px_rgba(25,28,32,0.3)]`;

/* ---------- record stamp ---------- */

export function Stamp({
  refText,
  label,
  dark = false,
}: {
  refText: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <div className="mk-rv mb-[26px] flex items-center gap-3.5">
      <span
        className={`mk-mono whitespace-nowrap px-[9px] py-1 text-xs font-semibold tracking-[0.12em] ${
          dark
            ? "bg-[var(--mk-amber)] text-[var(--mk-ink)]"
            : "bg-[var(--mk-ink)] text-[var(--mk-dust)]"
        }`}
      >
        {refText}
      </span>
      <span
        className={`h-px min-w-6 flex-1 ${
          dark ? "bg-[var(--mk-d-rule)]" : "bg-[var(--mk-rule-strong)]"
        }`}
      />
      <span
        className={`mk-mono text-right text-xs font-semibold uppercase tracking-[0.14em] min-[500px]:whitespace-nowrap ${
          dark ? "text-[var(--mk-d-muted)]" : "text-[var(--mk-muted)]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ---------- framed screenshot plate ---------- */

export function Plate({
  cap,
  capDim,
  className = "",
  children,
}: {
  cap: string;
  capDim?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border border-[var(--mk-rule-strong)] bg-[var(--mk-paper)] shadow-[0_14px_34px_-18px_rgba(25,28,32,0.35)] ${className}`}
    >
      {children}
      <div className="mk-mono flex justify-between gap-3 bg-[var(--mk-ink)] px-3 py-2 text-xs font-medium tracking-[0.1em] text-[var(--mk-dust)]">
        <span>{cap}</span>
        {capDim ? <span className="text-[var(--mk-d-muted)]">{capDim}</span> : null}
      </div>
    </div>
  );
}

/* ---------- nav ---------- */

const NAV_LINKS = [
  { href: "/welcome#diary", label: "The Diary" },
  { href: "/welcome#report", label: "The Report" },
  { href: "/welcome#evidence", label: "Evidence" },
  { href: "/welcome#pricing", label: "Pricing" },
  { href: "/welcome#faq", label: "FAQ" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--mk-rule)] bg-[rgba(242,241,237,0.92)] backdrop-blur-[8px]">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-7 px-6">
        <Link
          href="/welcome"
          className="mk-disp flex items-center gap-2.5 text-xl font-extrabold tracking-[-0.02em] no-underline"
        >
          <SitefileMark size={26} />
          Sitefile
        </Link>
        <nav
          aria-label="Sections"
          className="hidden gap-[22px] min-[761px]:flex"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="mk-disp text-[0.88rem] font-semibold text-[var(--mk-ink-soft)] no-underline hover:text-[var(--mk-amber-ink)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-[18px]">
          <Link
            href="/sign-in"
            className="mk-disp hidden text-[0.88rem] font-semibold text-[var(--mk-ink-soft)] no-underline hover:text-[var(--mk-amber-ink)] min-[420px]:block"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={`${mkBtnAmber} whitespace-nowrap px-3 py-[9px] text-[0.88rem] min-[420px]:px-[18px]`}
          >
            Start free pilot
          </Link>
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}

/* ---------- footer ---------- */

export function MarketingFooter() {
  return (
    <footer className="bg-[var(--mk-ink)] py-[34px] text-[var(--mk-d-muted)]">
      <div className="mk-mono mx-auto flex max-w-[1120px] flex-wrap items-center gap-[26px] px-6 text-xs">
        <SitefileMark size={20} variant="bare" className="text-[var(--mk-d-muted)]" />
        <Link href="/privacy" className="no-underline hover:text-[var(--mk-dust)]">
          Privacy
        </Link>
        <Link href="/terms" className="no-underline hover:text-[var(--mk-dust)]">
          Terms
        </Link>
        <Link href="/support" className="no-underline hover:text-[var(--mk-dust)]">
          Support
        </Link>
        <a
          href="mailto:support@sitefile.app"
          className="no-underline hover:text-[var(--mk-dust)]"
        >
          support@sitefile.app
        </a>
        <span className="ml-auto">© {new Date().getFullYear()} Sitefile</span>
      </div>
    </footer>
  );
}
