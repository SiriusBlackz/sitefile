"use client";

import { useState } from "react";
import Link from "next/link";

export type FaqItem = { q: string; a: string };

/**
 * Plus-button accordion: the whole row is a button, the + rotates to ×
 * when open, and the panel animates height via the 0fr→1fr grid trick
 * (no measuring). Each answer links through to /support for the longer
 * version.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="mt-9 border-t border-[var(--mk-rule-strong)]">
      {items.map((item, i) => {
        const open = openIdx === i;
        const panelId = `faq-panel-${i}`;
        const btnId = `faq-button-${i}`;
        return (
          <div key={item.q} className="border-b border-[var(--mk-rule-strong)]">
            <h3 className="m-0">
              <button
                type="button"
                id={btnId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIdx(open ? null : i)}
                className="mk-disp flex w-full items-center justify-between gap-5 bg-transparent py-5 text-left text-[1.05rem] font-bold tracking-[-0.01em] text-[var(--mk-ink)]"
              >
                {item.q}
                <span
                  aria-hidden="true"
                  data-open={open}
                  className="mk-acc-icon relative block h-[22px] w-[22px] flex-none"
                >
                  <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[var(--mk-amber-ink)]" />
                  <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-[var(--mk-amber-ink)]" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              data-open={open}
              className="mk-acc-panel"
            >
              <div>
                <p className="max-w-[72ch] pb-2 text-[0.95rem] text-[var(--mk-ink-soft)]">
                  {item.a}
                </p>
                <p className="mk-mono pb-5 text-xs">
                  <Link
                    href="/support"
                    className="text-[var(--mk-amber-ink)] underline underline-offset-[3px]"
                    tabIndex={open ? 0 : -1}
                  >
                    More on this at Support
                  </Link>
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
