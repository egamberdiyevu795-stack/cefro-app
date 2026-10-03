import { beforeEach, describe, expect, it, vi } from "vitest";

// Small limits so the tests stay readable; defaults are documented in env.ts.
vi.hoisted(() => {
  process.env.LIMIT_ATTEMPTS_PER_USER_HOUR = "4";
  process.env.LIMIT_ATTEMPTS_PER_USER_DAY = "6";
  process.env.LIMIT_CONCURRENT_PROCESSING_PER_USER = "2";
  process.env.LIMIT_ATTEMPTS_GLOBAL_HOUR = "10";
  process.env.LIMIT_PROCESSING_RUNS_PER_ATTEMPT = "3";
});

import { eq } from "drizzle-orm";
import { claimAttempt } from "@/server/attempts/attempt-processing";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { speakingAttempts } from "@/server/db/schema";
import { seedAttempt, seedUsers } from "../../../test/db-helpers";
import { assertCanRestart, assertCanSubmitAttempt } from "./usage-limits";
import { FixedWindowLimiter } from "./fixed-window";

let db: Db;
const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const V = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  db = openDatabase(":memory:");
  setDbForTesting(db);
  seedUsers(db, U, V);
});

let n = 100;
const done = (userId: string, ageMs: number) => seedAttempt(db, { userId, attemptNumber: n++, createdAt: ago(ageMs), status: "completed" });

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return { code: (e as { code?: string }).code, status: (e as { status?: number }).status, retryAfter: (e as { retryAfterSeconds?: number }).retryAfterSeconds };
  }
  return null;
};

describe("submission limits", () => {
  it("allows normal practice", () => {
    done(U, 5 * MIN);
    done(U, 30 * MIN);
    expect(code(() => assertCanSubmitAttempt(U, NOW))).toBeNull();
  });

  it("limits submissions per hour, with a stable code and a retry hint", () => {
    for (let i = 0; i < 4; i++) done(U, (i + 1) * 10 * MIN);
    expect(code(() => assertCanSubmitAttempt(U, NOW))).toMatchObject({ code: "hourly_limit_reached", status: 429 });
    expect(code(() => assertCanSubmitAttempt(U, NOW))?.retryAfter).toBeGreaterThan(0);
    // Another user is unaffected.
    expect(code(() => assertCanSubmitAttempt(V, NOW))).toBeNull();
  });

  it("limits submissions per day once the hourly window has moved on", () => {
    for (let i = 0; i < 6; i++) done(U, 2 * HOUR + i * HOUR); // 6 attempts spread over the last 8 hours, none in the last hour
    expect(code(() => assertCanSubmitAttempt(U, NOW))).toMatchObject({ code: "daily_limit_reached", status: 429 });
  });

  it("stops counting attempts after the window passes", () => {
    for (let i = 0; i < 4; i++) done(U, HOUR + (i + 1) * MIN);
    expect(code(() => assertCanSubmitAttempt(U, NOW))).toBeNull();
  });

  it("limits answers being processed at the same time, but not stalled ones", () => {
    seedAttempt(db, { userId: U, attemptNumber: n++, status: "evaluating", processingStartedAt: ago(20_000), createdAt: ago(60_000) });
    seedAttempt(db, { userId: U, attemptNumber: n++, status: "transcribing", processingStartedAt: ago(10_000), createdAt: ago(60_000) });
    expect(code(() => assertCanSubmitAttempt(U, NOW))).toMatchObject({ code: "too_many_in_progress", status: 429 });
    expect(code(() => assertCanSubmitAttempt(V, NOW))).toBeNull();

    // The same two attempts, 20 minutes later, are stalled (no progress for > 6 min) and no longer block.
    expect(code(() => assertCanSubmitAttempt(U, NOW + 20 * MIN))).toBeNull();
  });

  it("has a global ceiling that does not depend on who is asking", () => {
    // Ten different anonymous identities, each well within their own limits.
    for (let i = 0; i < 10; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      seedUsers(db, id);
      done(id, 5 * MIN);
    }
    expect(code(() => assertCanSubmitAttempt(V, NOW))).toMatchObject({ code: "capacity_reached", status: 503 });
  });
});

describe("restart limits", () => {
  it("allows restarts only while the attempt has processing runs left", () => {
    expect(code(() => assertCanRestart({ processingRuns: 2 }))).toBeNull();
    expect(code(() => assertCanRestart({ processingRuns: 3 }))).toMatchObject({ code: "restart_limit_reached", status: 429 });
  });

  it("enforces the cap atomically when claiming, so it cannot be bypassed by the client", () => {
    const id = seedAttempt(db, { userId: U, attemptNumber: n++, status: "uploaded" });
    const fail = () => db.update(speakingAttempts).set({ status: "failed" }).where(eq(speakingAttempts.id, id)).run();
    expect(claimAttempt(id)).toBe(true); // run 1
    fail();
    expect(claimAttempt(id)).toBe(true); // run 2
    fail();
    expect(claimAttempt(id)).toBe(true); // run 3
    fail();
    expect(claimAttempt(id)).toBe(false); // out of runs
    expect(db.select().from(speakingAttempts).where(eq(speakingAttempts.id, id)).get()).toMatchObject({ status: "failed", processingRuns: 3 });
  });
});

describe("FixedWindowLimiter", () => {
  it("allows up to the maximum per key and window, then reports when to retry", () => {
    const limiter = new FixedWindowLimiter(3, 60_000);
    expect(limiter.hit("a", 1, 0)).toEqual({ allowed: true });
    expect(limiter.hit("a", 2, 1_000)).toEqual({ allowed: true });
    expect(limiter.hit("a", 1, 2_000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
    expect(limiter.hit("b", 1, 2_000)).toEqual({ allowed: true });
    expect(limiter.hit("a", 1, 61_000)).toEqual({ allowed: true }); // new window
  });

  it("rejects a single request heavier than the whole allowance", () => {
    expect(new FixedWindowLimiter(5, 1000).hit("a", 6, 0)).toMatchObject({ allowed: false });
  });
});
