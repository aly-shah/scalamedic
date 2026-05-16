/**
 * Per-user rate limiting (in-memory, per-pm2-instance).
 *
 * Used by expensive endpoints (AI transcribe, ambient scribe,
 * continuity briefing) so a compromised session can't rack up
 * unbounded OpenAI bills.
 *
 * Implementation: token-bucket per (key, route) tuple, kept in a
 * Map. Single-pm2 deployments use this directly; the platform is
 * single-instance today. When pm2 cluster mode lands, swap the
 * Map for Redis with the same interface.
 *
 * Limits are deliberately generous for clinical workflows. A doctor
 * dictating heavily might transcribe 30 notes in an afternoon — the
 * limit needs to be higher than typical use but still catch bot-
 * style abuse (one request per second sustained).
 */

interface Bucket {
  /** Tokens remaining in this window. */
  count: number;
  /** Wall time when the bucket resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Max requests per window per (userId, key) tuple. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Identifier for the bucket. Two routes that share a budget
   *  (e.g. all AI calls) pass the same key. */
  key: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  /** Seconds until the window resets — useful for `Retry-After`. */
  retryAfter: number;
}

/**
 * Consume one token from the bucket. Returns ok=false when the
 * bucket is empty. Counts include this attempt.
 */
export function checkRateLimit(userId: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const id = `${config.key}:${userId}`;
  const existing = buckets.get(id);

  if (!existing || existing.resetAt <= now) {
    // Fresh window. Consume one token immediately.
    const next: Bucket = { count: 1, resetAt: now + config.windowMs };
    buckets.set(id, next);
    return {
      ok: true,
      remaining: config.max - 1,
      resetAt: next.resetAt,
      retryAfter: 0,
    };
  }

  if (existing.count >= config.max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count++;
  return {
    ok: true,
    remaining: Math.max(0, config.max - existing.count),
    resetAt: existing.resetAt,
    retryAfter: 0,
  };
}

/**
 * Pre-baked configs the AI routes import directly. Tweaking limits
 * is a one-line change in this file (no route edits required).
 */
export const RATE_LIMITS = {
  // AI transcribe + ambient scribe share one budget. A heavy day
  // is ~50 dictations; 100/hour is plenty of headroom and still
  // catches a runaway script.
  AI_INFERENCE: { key: "ai-inference", max: 100, windowMs: 60 * 60 * 1000 },
  // Continuity briefing fires every time a doctor opens a patient.
  // 200/hour = a doctor opening ~3 patients per minute sustained.
  AI_BRIEFING:  { key: "ai-briefing",  max: 200, windowMs: 60 * 60 * 1000 },
  // Public tenant onboarding — anonymous endpoint, so the bucket
  // key is the client IP (not a userId). 5 successful provisions
  // per hour per IP is plenty for legitimate "set up my dev /
  // staging clinics", aggressive enough to deter scripted abuse
  // (TENANT_ONBOARD_TOKEN env adds a hard gate on top for closed
  // deployments).
  TENANT_ONBOARD: { key: "tenant-onboard", max: 5, windowMs: 60 * 60 * 1000 },
  // Public booking endpoints. Per-IP buckets (no session). Listing
  // doctors and looking up availability are read-only and idempotent,
  // so generous (200/hour = a patient browsing 3-4 doctors and 4-5
  // dates before picking). Booking create is the one we actually
  // care about: a real patient books once, not every minute — 10/hour
  // per IP catches scripted abuse while leaving honest users alone.
  PUBLIC_BOOKING_READ:   { key: "public-booking-read",   max: 200, windowMs: 60 * 60 * 1000 },
  PUBLIC_BOOKING_CREATE: { key: "public-booking-create", max: 10,  windowMs: 60 * 60 * 1000 },
} as const;
