import "server-only";
import { getEnv } from "@/server/config/env";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";

/**
 * Abuse limits for the sign-in and sign-up endpoints. In-memory and per process (like the other cheap limiters),
 * which matches the single-host deployment; they reset on restart and are NOT shared between instances.
 *
 *  - Sign-in counts FAILURES, per email and per client IP, so a user who types the right password is never
 *    blocked by their own earlier successes. (An attacker can still lock out a victim's email for the window by
 *    failing on purpose; the window is short for that reason.)
 *  - Sign-up counts every attempt per IP and in total.
 * The client IP comes from `X-Forwarded-For`, which a client can forge unless a trusted proxy overwrites it; that is
 * why the per-email limit and the global registration ceiling exist and do not rely on it.
 */
const FIFTEEN_MIN = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface Limiters {
  loginByEmail: FixedWindowLimiter;
  loginByIp: FixedWindowLimiter;
  registerByIp: FixedWindowLimiter;
  registerGlobal: FixedWindowLimiter;
}
let limiters: Limiters | undefined;

export function authLimiters(): Limiters {
  if (!limiters) {
    const env = getEnv();
    limiters = {
      loginByEmail: new FixedWindowLimiter(env.LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN, FIFTEEN_MIN),
      loginByIp: new FixedWindowLimiter(env.LIMIT_LOGIN_FAILURES_PER_IP_15MIN, FIFTEEN_MIN),
      registerByIp: new FixedWindowLimiter(env.LIMIT_REGISTRATIONS_PER_IP_HOUR, HOUR),
      registerGlobal: new FixedWindowLimiter(env.LIMIT_REGISTRATIONS_GLOBAL_HOUR, HOUR),
    };
  }
  return limiters;
}

/** Test seam: forget all counters. */
export function resetAuthLimitersForTesting() {
  limiters = undefined;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length <= 64 ? forwarded : "unknown";
}
