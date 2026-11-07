import "server-only";
import { getEnv } from "@/server/config/env";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";

/**
 * Abuse limits for the sign-in and sign-up endpoints. In-memory and per process (like the other cheap limiters),
 * which matches the single-host deployment; they reset on restart and are NOT shared between instances.
 *
 *  - Sign-in counts FAILURES, per account (email) and per client IP, so a user who types the right password is never
 *    blocked by their own earlier successes. The per-account limit (5 per 15 minutes) is what keeps guessing one
 *    person's password slow, from any number of addresses; wrong passwords on Change password and Delete my account
 *    count against the same account (`accountKey`). The per-IP limit (100 per 15 minutes) only stops one address
 *    trying many accounts, and is high because a classroom shares one address (school Wi-Fi, a mobile network): one
 *    student's typos never lock out the class. (An attacker can still lock out a victim's email for the window by
 *    failing on purpose; the window is short for that reason.)
 *  - Sign-up counts every attempt per IP (30 per hour, so a class of 30 can sign up together) and in total (300).
 * The client IP comes only from a header a trusted proxy sets (`clientIp`: Vercel's `x-real-ip`); a visitor's own
 * `X-Forwarded-For` is ignored outside test runs. The per-email limit and the global registration ceiling do not rely
 * on the IP at all.
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

/** The per-account key of the failed-password limit: the same for sign-in, Change password and Delete my account. */
export function accountKey(email: string): string {
  return `email:${email.trim().toLowerCase().slice(0, 254)}`;
}

/** Test seam: forget all counters. */
export function resetAuthLimitersForTesting() {
  limiters = undefined;
}

type IpEnv = { NODE_ENV?: string; VERCEL?: string; CEFRO_TEST_CLIENT_IP?: string };

/**
 * The client address the per-IP limits count, from a header only a trusted proxy sets, never one a visitor controls:
 *
 *  - **On Vercel** (`VERCEL=1`, production and Previews): `x-real-ip`, which Vercel's edge sets from the connection
 *    itself (any value the visitor sends is replaced). `x-forwarded-for` is ignored there.
 *  - **Test runs only:** the first `x-forwarded-for` value, so tests can play several clients. A test run is vitest
 *    (`NODE_ENV=test`) or the browser tests' dev server (`CEFRO_TEST_CLIENT_IP=1`, set only in playwright.config.ts),
 *    and never a production build or anything on Vercel, whatever the variables say.
 *  - **Anywhere else** (a self-hosted server, `next dev`): no trusted header is known, so every caller counts as one
 *    client ("unknown"). Stricter, never bypassable: the per-email and global limits still apply on top.
 */
export function clientIp(request: Request, env: IpEnv = process.env): string {
  if (env.VERCEL === "1") return usable(request.headers.get("x-real-ip"));
  if (isTestRun(env)) return usable(request.headers.get("x-forwarded-for")?.split(",")[0]);
  return "unknown";
}

/** May tests choose the client address? Only in a test run, never in production or on Vercel. */
export function isTestRun(env: IpEnv): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL) return false;
  return env.NODE_ENV === "test" || env.CEFRO_TEST_CLIENT_IP === "1";
}

function usable(value: string | null | undefined): string {
  const ip = value?.trim();
  return ip && ip.length <= 64 ? ip : "unknown";
}
