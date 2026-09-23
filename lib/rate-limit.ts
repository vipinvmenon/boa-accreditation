/**
 * Per-IP request throttle. Ported from boa-stok-form's lib/rate-limit.ts.
 *
 * This is an in-memory Map on a single serverless instance — not a distributed
 * rate limiter. Under load, Vercel may run many instances and each keeps its
 * own Map. That is fine here too: it is a first line of defence against a
 * single client hammering one warm instance, never the control. The control
 * is the database (e.g. the per-token hourly throttle that lived in
 * `boa_acc_submit_throttle` for the now-retired `/api/s/[token]`, ADR-019).
 * This file cannot be the reason the 23rd or 61st request is refused — it
 * only reduces noise before a request reaches the database at all.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Cap Map growth on a long-lived instance. */
const MAX_KEYS = 5_000;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/**
 * @param key       usually the client IP
 * @param limit     max requests allowed in the window
 * @param windowMs  sliding window length
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    // Evict expired entries when the Map gets large.
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
      // Still over? Drop the oldest insert.
      if (buckets.size >= MAX_KEYS) {
        const first = buckets.keys().next().value;
        if (first !== undefined) buckets.delete(first);
      }
    }
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

/** Best-effort client IP from Vercel / proxy headers. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}
