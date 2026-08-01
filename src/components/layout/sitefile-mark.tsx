/**
 * The Sitefile mark — "S-Strata": three offset bars reading as an abstract S,
 * Gantt bars, and stacked slabs. Two variants:
 *  - "badge": blue rounded tile with white/tint bars (app chrome, dark headers)
 *  - "bare":  blue-toned bars with no tile (inline beside dark text)
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
        <rect x="22" y="14" width="28" height="9" rx="4.5" fill="#2563eb" />
        <rect x="14" y="27.5" width="36" height="9" rx="4.5" fill="#3b82f6" />
        <rect x="14" y="41" width="28" height="9" rx="4.5" fill="#93c5fd" />
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
      <rect width="64" height="64" rx="14" fill="#2563eb" />
      <rect x="22" y="14" width="28" height="9" rx="4.5" fill="#fff" />
      <rect x="14" y="27.5" width="36" height="9" rx="4.5" fill="#bfdbfe" />
      <rect x="14" y="41" width="28" height="9" rx="4.5" fill="#fff" />
    </svg>
  );
}
