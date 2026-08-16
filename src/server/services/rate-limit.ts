/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance deployments (Vercel serverless = per-isolate).
 * Upgrade to Upstash/Redis for multi-instance production.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000).unref();

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  max: 60,
  windowMs: 60_000, // 60 requests per minute
};

// Per-photo upload mutations (getUploadUrl/confirm/link) — a photo costs
// 2-3 of these, so the 30/min budget capped real batches at ~4 photos.
// 240/min ≈ 80 photos/min: generous for humans, still a ceiling for abuse.
export const UPLOAD_MUTATION_CONFIG: RateLimitConfig = {
  max: 240,
  windowMs: 60_000,
};

const MUTATION_CONFIG: RateLimitConfig = {
  max: 30,
  windowMs: 60_000, // 30 mutations per minute
};

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowMs };
  }

  entry.count++;
  const allowed = entry.count <= config.max;
  return {
    allowed,
    remaining: Math.max(0, config.max - entry.count),
    resetAt: entry.resetAt,
  };
}

export { DEFAULT_CONFIG, MUTATION_CONFIG };
