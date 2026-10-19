// Failed-login limiter: after `max` failures inside `windowMs` a key is blocked until the window ends.
export function createRateLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map(); // key -> { count, first }
  const live = (key, now) => {
    const h = hits.get(key);
    if (h && now - h.first >= windowMs) { hits.delete(key); return undefined; }
    return h;
  };
  return {
    isBlocked(key, now = Date.now()) { return (live(key, now)?.count ?? 0) >= max; },
    fail(key, now = Date.now()) {
      const h = live(key, now);
      if (h) h.count++; else hits.set(key, { count: 1, first: now });
    },
    reset(key) { hits.delete(key); },
  };
}
