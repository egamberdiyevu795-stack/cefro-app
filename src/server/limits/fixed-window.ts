import "server-only";

/**
 * Tiny in-memory fixed-window counter for cheap endpoints (session creation, analytics ingest).
 * It is per server process, which matches the current single-host deployment; it is NOT a
 * distributed limiter (see docs/ARCHITECTURE_DECISIONS.md). Cost-bearing limits (attempts,
 * processing runs) use the database instead, so they survive restarts and are exact.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; hits: number }>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  /** Records one hit (or `weight` hits). Returns whether it is allowed and, if not, when to retry. */
  hit(key: string, weight = 1, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    if (this.windows.size > 10_000) this.prune(now);
    const current = this.windows.get(key);
    const window = current && now - current.start < this.windowMs ? current : { start: now, hits: 0 };
    if (window.hits + weight > this.maxHits) {
      this.windows.set(key, window);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000)) };
    }
    window.hits += weight;
    this.windows.set(key, window);
    return { allowed: true };
  }

  /** Whether `key` is already at its limit, WITHOUT counting a hit (used to count only failures). */
  isBlocked(key: string, now = Date.now()): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs || current.hits < this.maxHits) return { blocked: false };
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((current.start + this.windowMs - now) / 1000)) };
  }

  /** Forgets every counter whose key matches (e.g. an account's wrong-password counts after its password was reset). */
  forget(matches: (key: string) => boolean) {
    for (const key of this.windows.keys()) if (matches(key)) this.windows.delete(key);
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
