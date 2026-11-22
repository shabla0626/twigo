// Fixed-window in-memory rate limiter.
// LIMITATION: state is per server instance. For multi-instance deployments,
// replace the store with Redis/Upstash or the platform's rate limiting.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  bucket.count++;
  return { ok: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
