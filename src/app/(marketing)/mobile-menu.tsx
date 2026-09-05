"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Hamburger navigation for narrow viewports (the section links hide
 * below 760px). Renders inside the sticky header so the open panel
 * stays attached to it.
 */
export function MobileMenu({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-[761px]:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mk-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="mk-mono flex h-9 w-14 items-center justify-center border border-[var(--mk-rule-strong)] bg-transparent px-0 text-xs font-semibold tracking-[0.12em] text-[var(--mk-ink)]"
      >
        {open ? "CLOSE" : "MENU"}
      </button>
      {open ? (
        <nav
          id="mk-mobile-menu"
          aria-label="Site menu"
          className="absolute inset-x-0 top-16 border-b border-[var(--mk-rule)] bg-[var(--mk-dust)] shadow-[0_18px_30px_-18px_rgba(25,28,32,0.4)]"
        >
          <div className="mx-auto flex max-w-[1120px] flex-col px-6 py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="mk-disp border-b border-[var(--mk-rule)] py-3.5 text-base font-semibold text-[var(--mk-ink)] no-underline"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="mk-disp py-3.5 text-base font-semibold text-[var(--mk-ink-soft)] no-underline"
            >
              Sign in
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
