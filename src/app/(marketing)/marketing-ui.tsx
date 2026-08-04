import Link from "next/link";
import { SitefileMark } from "@/components/layout/sitefile-mark";

const btn =
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const btnPrimary = `${btn} bg-primary text-primary-foreground shadow hover:bg-primary/90`;
export const btnOutline = `${btn} border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`;
export const btnGhost = `${btn} hover:bg-accent hover:text-accent-foreground`;

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/welcome" className="flex items-center gap-2">
          <SitefileMark size={28} />
          <span className="text-lg font-semibold">Sitefile</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* Wrapper (not per-link `hidden`) because btnGhost's base
              inline-flex is emitted after .hidden in the compiled CSS and
              wins the display cascade — per-link hiding never applied. */}
          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
            <Link href="/welcome#how" className={`${btnGhost} h-9 px-3`}>
              How it works
            </Link>
            <Link href="/welcome#pricing" className={`${btnGhost} h-9 px-3`}>
              Pricing
            </Link>
            <Link href="/support" className={`${btnGhost} h-9 px-3`}>
              Support
            </Link>
          </div>
          <Link href="/sign-in" className={`${btnGhost} h-9 px-3`}>
            Sign in
          </Link>
          <Link href="/sign-up" className={`${btnPrimary} h-9 px-4`}>
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <SitefileMark size={24} />
            <span className="font-semibold">Sitefile</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Site photos in. Client-ready progress reports out.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Project data hosted in the EU. Built for UK contractors.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold">Product</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/welcome#how" className="hover:text-foreground">How it works</Link></li>
            <li><Link href="/welcome#tour" className="hover:text-foreground">Product tour</Link></li>
            <li><Link href="/welcome#pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><Link href="/sign-up" className="hover:text-foreground">Get started</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold">Support</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/support" className="hover:text-foreground">Help &amp; FAQs</Link></li>
            <li>
              <a href="mailto:support@sitefile.app" className="hover:text-foreground">
                support@sitefile.app
              </a>
            </li>
            <li><Link href="/sign-in" className="hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold">Legal</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/privacy" className="hover:text-foreground">Privacy policy</Link></li>
            <li><Link href="/terms" className="hover:text-foreground">Terms of service</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Sitefile — Contractor Progress Evidence Tracker</span>
          <span>www.sitefile.app</span>
        </div>
      </div>
    </footer>
  );
}
