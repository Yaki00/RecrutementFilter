const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function createRateLimiter({
  windowMs,
  maxRequests,
  name = "limit",
  cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS
}) {
  const buckets = new Map();
  let cleanupTimer = null;

  function prune(now) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function ensureCleanup() {
    if (cleanupTimer || cleanupIntervalMs <= 0) return;
    cleanupTimer = setInterval(() => prune(Date.now()), cleanupIntervalMs);
    if (typeof cleanupTimer.unref === "function") {
      cleanupTimer.unref();
    }
  }

  function consume(key, now = Date.now()) {
    ensureCleanup();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt,
        retryAfterSec: 0
      };
    }

    if (bucket.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: maxRequests - bucket.count,
      resetAt: bucket.resetAt,
      retryAfterSec: 0
    };
  }

  function middleware(getKey) {
    return (req, res, next) => {
      const key = `${name}:${getKey(req)}`;
      const result = consume(key);

      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSec));
        return res.status(429).json({
          ok: false,
          error: "Trop de requêtes. Réessayez plus tard.",
          retryAfterSec: result.retryAfterSec
        });
      }

      next();
    };
  }

  function reset() {
    buckets.clear();
  }

  function destroy() {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    buckets.clear();
  }

  return { middleware, consume, reset, destroy };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  createRateLimiter,
  sleep
};
