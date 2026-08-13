import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

/**
 * Returns a configured Anthropic client. Throws a clear, user-facing
 * error if the API key is missing or still set to the placeholder
 * value from `.env.example`.
 */
export function getAnthropicClient(): Anthropic {
  if (cached) return cached;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-PLACEHOLDER" || key.length < 20) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. PDF programme import requires a real Anthropic API key."
    );
  }

  cached = new Anthropic({ apiKey: key });
  return cached;
}

// Latest Sonnet (per CLAUDE.md model guidance — supports PDF input natively).
export const CLAUDE_MODEL_PDF = "claude-sonnet-4-6";

// Narrative drafting uses the same Sonnet tier — prose quality at report
// scale doesn't need Opus, and cost stays negligible per report.
export const CLAUDE_MODEL_NARRATIVE = "claude-sonnet-4-6";
