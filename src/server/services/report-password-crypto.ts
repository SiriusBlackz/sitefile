/**
 * Wraps report passwords so the plaintext can cross from the generate
 * mutation to the Inngest worker via the database instead of the Inngest
 * event payload (which transits third-party infrastructure).
 *
 * The ciphertext lives in reports.password_ciphertext only while a report
 * is generating and is cleared on completion or failure. Residual risks,
 * accepted: a key rotation mid-generation fails that report cleanly (the
 * user regenerates), and an attacker holding both a DB read and the server
 * env key could recover in-flight plaintexts — the same trust boundary as
 * the app server itself, for a window of minutes.
 */
import crypto from "crypto";

function getKey(): Buffer {
  const raw = process.env.REPORT_PASSWORD_KEY;
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error(
        "REPORT_PASSWORD_KEY must decode to 32 bytes (64 hex chars or base64)"
      );
    }
    return buf;
  }
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    throw new Error(
      "Cannot wrap report passwords: neither REPORT_PASSWORD_KEY nor CLERK_SECRET_KEY is set"
    );
  }
  return Buffer.from(
    crypto.hkdfSync("sha256", clerkSecret, "", "sitefile:report-password:v1", 32)
  );
}

const VERSION = "v1";
const IV_BYTES = 12;

export function encryptReportPassword(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ct.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptReportPassword(blob: string): string {
  const [version, ivB64, ctB64, tagB64] = blob.split(".");
  if (version !== VERSION || !ivB64 || !ctB64 || !tagB64) {
    throw new Error("Unrecognised report password ciphertext format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
