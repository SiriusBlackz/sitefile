/**
 * The Sitefile mark — "S-Strata" refined (design-competition verdict):
 * three offset bars reading as an abstract S, Gantt bars, and stacked
 * slabs. Squared bar ends, tarmac-ink tile, and the live middle bar in
 * beacon amber — work done above, work planned below, today's evidence
 * layer between them. Two variants:
 *  - "badge": ink rounded tile with dust/amber bars (app chrome, icons)
 *  - "bare":  bars only — top/bottom inherit currentColor so the mark
 *             works on any ground; the spine stays amber.
 * Server-safe (no hooks) so it renders in the app and static contexts alike.
 */
export function SitefileMark({
  size = 32,
  variant = "badge",
  className,
}: {
  size?: number;
  variant?: "badge" | "bare";
  className?: string;
}) {
  if (variant === "bare") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className={className}
        aria-hidden="true"
      >
        <rect x="22" y="14" width="28" height="9" rx="2.5" fill="currentColor" />
        <rect x="14" y="27.5" width="36" height="9" rx="2.5" fill="#E8940A" />
        <rect x="14" y="41" width="28" height="9" rx="2.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#191C20" />
      <rect x="22" y="14" width="28" height="9" rx="2.5" fill="#EDECE7" />
      <rect x="14" y="27.5" width="36" height="9" rx="2.5" fill="#E8940A" />
      <rect x="14" y="41" width="28" height="9" rx="2.5" fill="#EDECE7" />
    </svg>
  );
}
