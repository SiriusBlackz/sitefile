import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60;

interface TokenPayload {
  rid: string; // reportId
  uid: string; // userId who validated access
  exp: number; // unix seconds
}

function getSecret(): Buffer {
  const s = process.env.REPORT_TOKEN_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!s) {
    throw new Error(
      "Cannot sign report download tokens: neither REPORT_TOKEN_SECRET nor CLERK_SECRET_KEY is set"
    );
  }
  return Buffer.from(s);
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signReportToken(
  reportId: string,
  userId: string,
  ttlSeconds = TOKEN_TTL_SECONDS
): string {
  const payload: TokenPayload = {
    rid: reportId,
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export interface VerifiedReportToken {
  reportId: string;
  userId: string;
}

export function verifyReportToken(token: string): VerifiedReportToken | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payloadB64 || !sigB64) return null;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString()
    ) as TokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  if (typeof payload.rid !== "string" || typeof payload.uid !== "string") {
    return null;
  }
  return { reportId: payload.rid, userId: payload.uid };
}
