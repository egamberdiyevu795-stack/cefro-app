import "server-only";
import { getEnv } from "@/server/config/env";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";

/**
 * Abuse limits for the sign-in and sign-up endpoints. In-memory and per process (like the other cheap limiters),
 * which matches the single-host deployment; they reset on restart and are NOT shared between instances.
 *
 *  - Wrong passwords (sign-in, Change password, Delete my account) count FAILURES only, so a user who types the right
 *    password is never blocked by their own earlier successes. One shared counter per account for all three
 *    (`passwordFailureBlocked` / `countPasswordFailure`), in two parts:
 *      - per account AND client IP: 5 per 15 minutes. Guessing from one place stops quickly, and a classmate who
 *        fails on purpose from their own phone or home locks the account only for that address: the owner still signs
 *        in from anywhere else. (On the same school Wi-Fi they share an address, so it is locked there for the window.)
 *      - per account in total, from any IP: 20 per 15 minutes, so spreading guesses over many addresses stays slow.
 *  - Sign-in also counts failures per client IP (100 per 15 minutes): it only stops one address trying many accounts,
 *    and is high because a classroom shares one address, so one student's typos never lock out the class.
 *  - Sign-up counts every attempt per IP (30 per hour, so a class of 30 can sign up together) and in total (300).
 * The client IP comes only from a header a trusted proxy sets (`clientIp`: Vercel's `x-real-ip`); a visitor's own
 * `X-Forwarded-For` is ignored outside test runs. The per-email limit and the global registration ceiling do not rely
 * on the IP at all.
 */
const FIFTEEN_MIN = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface Limiters {
  /** Wrong passwords per account and client IP. */
  loginByEmailAndIp: FixedWindowLimiter;
  /** Wrong passwords per account, from any IP. */
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
      loginByEmailAndIp: new FixedWindowLimiter(env.LIMIT_LOGIN_FAILURES_PER_EMAIL_IP_15MIN, FIFTEEN_MIN),
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

/**
 * Is this account blocked for wrong passwords from this address (its account + IP part, or its total)? Checked before
 * the password is, by sign-in, Change password and Delete my account. `email` is the account's email (or the one
 * typed at sign-in).
 */
export function passwordFailureBlocked(email: string, ip: string): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
  const limits = authLimiters();
  const key = accountKey(email);
  for (const state of [limits.loginByEmailAndIp.isBlocked(`${key}|ip:${ip}`), limits.loginByEmail.isBlocked(key)]) {
    if (state.blocked) return state;
  }
  return { blocked: false };
}

/** Count one wrong password for this account from this address (both parts of the shared counter). */
export function countPasswordFailure(email: string, ip: string): void {
  const limits = authLimiters();
  const key = accountKey(email);
  limits.loginByEmailAndIp.hit(`${key}|ip:${ip}`);
  limits.loginByEmail.hit(key);
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
