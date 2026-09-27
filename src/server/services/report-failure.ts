/**
 * Turn the last error from a failed report generation into one line a
 * project manager can act on. The raw message is kept (truncated) so
 * support can still see what broke, but the common failure classes get
 * a plain-English lead so the row doesn't just say "Failed".
 */
export function describeFailure(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "Unknown error";
  const msg = raw.replace(/\s+/g, " ").trim();
  const lower = msg.toLowerCase();

  let lead: string;
  if (/chrom|puppeteer|browser|page\.pdf|target closed|navigation/.test(lower)) {
    lead = "The PDF renderer failed";
  } else if (/storage|r2|s3|bucket|upload|nosuchbucket|accessdenied/.test(lower)) {
    lead = "The PDF could not be saved to storage";
  } else if (/encrypt|qpdf|password/.test(lower)) {
    lead = "The PDF could not be password-protected";
  } else if (/timeout|timed out|deadline/.test(lower)) {
    lead = "Generation timed out";
  } else if (/database|postgres|connect|econnrefused|pool/.test(lower)) {
    lead = "The database could not be reached";
  } else if (/evidence|photo|image|sharp|heic/.test(lower)) {
    lead = "A photo could not be processed";
  } else {
    lead = "Generation failed";
  }
  const detail = msg.length > 240 ? `${msg.slice(0, 239)}…` : msg;
  return `${lead} — ${detail}. Try again; if it repeats, contact support.`;
}
