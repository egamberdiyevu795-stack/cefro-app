import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderError } from "@/server/errors";
import { PROCESSING_STALE_AFTER_MS, UPLOAD_STALE_AFTER_MS, isAttemptStalled } from "./attempt-views";
import { withDeadline } from "./deadline";
import type { AttemptRow } from "./attempt-repository";

const ROUTES = [
  "src/app/api/speaking/attempts/route.ts",
  "src/app/api/speaking/attempts/[attemptId]/process/route.ts",
];
const routeMaxDurationMs = (file: string) => {
  const match = /export const maxDuration = (\d+);/.exec(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
  expect(match, `${file} must declare maxDuration`).not.toBeNull();
  return Number(match![1]) * 1000;
};

describe("processing time budget (documented in docs/ARCHITECTURE_DECISIONS.md)", () => {
  it("orders the limits so a legitimate run is never killed or declared stalled while it is still working", async () => {
    // Defaults come from the real env schema; no override is set in this file.
    const { getEnv } = await import("@/server/config/env");
    const budget = getEnv().PROCESSING_BUDGET_MS;
    for (const file of ROUTES) {
      const maxDuration = routeMaxDurationMs(file);
      expect(budget).toBeLessThan(maxDuration); // the run ends itself before the platform would kill it
      expect(maxDuration).toBeLessThan(PROCESSING_STALE_AFTER_MS); // and before anyone may re-claim it as stalled
    }
    expect(PROCESSING_STALE_AFTER_MS - budget).toBeGreaterThanOrEqual(60_000);
  });

  it("cannot be configured above the platform limit", async () => {
    // The schema caps the budget below maxDuration; a larger value would reintroduce the old mismatch.
    const source = fs.readFileSync(path.join(process.cwd(), "src/server/config/env.ts"), "utf8");
    expect(/PROCESSING_BUDGET_MS: z\.coerce\.number\(\)\.int\(\)\.min\(10_000\)\.max\(290_000\)/.test(source)).toBe(true);
  });
});

describe("stalled detection", () => {
  const base = { status: "evaluating", createdAt: "2026-01-01T00:00:00.000Z", processingStartedAt: "2026-01-01T00:00:00.000Z" } as AttemptRow;
  const t0 = Date.parse(base.createdAt);

  it("does not flag a run that is within the stale window", () => {
    expect(isAttemptStalled(base, t0 + PROCESSING_STALE_AFTER_MS - 1)).toBe(false);
    expect(isAttemptStalled({ ...base, status: "transcribing" } as AttemptRow, t0 + 270_000)).toBe(false); // a full default budget
  });

  it("flags a run with no progress for longer than the window", () => {
    expect(isAttemptStalled(base, t0 + PROCESSING_STALE_AFTER_MS + 1)).toBe(true);
  });

  it("flags an upload whose processing never started, and ignores finished attempts", () => {
    const uploaded = { ...base, status: "uploaded", processingStartedAt: null } as AttemptRow;
    expect(isAttemptStalled(uploaded, t0 + UPLOAD_STALE_AFTER_MS - 1)).toBe(false);
    expect(isAttemptStalled(uploaded, t0 + UPLOAD_STALE_AFTER_MS + 1)).toBe(true);
    expect(isAttemptStalled({ ...base, status: "completed" } as AttemptRow, t0 + 10 * PROCESSING_STALE_AFTER_MS)).toBe(false);
    expect(isAttemptStalled({ ...base, status: "failed" } as AttemptRow, t0 + 10 * PROCESSING_STALE_AFTER_MS)).toBe(false);
  });
});

describe("withDeadline", () => {
  it("returns the result when the work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve(42), Date.now() + 1000, "x")).resolves.toBe(42);
  });

  it("fails with a retryable provider_timeout when the work outlives the deadline", async () => {
    const hung = new Promise<never>(() => undefined);
    await expect(withDeadline(hung, Date.now() + 30, "evaluation")).rejects.toMatchObject({
      failureCode: "provider_timeout",
      retryable: true,
    });
  });

  it("fails immediately when the budget is already spent", async () => {
    await expect(withDeadline(new Promise(() => undefined), Date.now() - 1, "evaluation")).rejects.toBeInstanceOf(ProviderError);
  });

  it("passes the work's own failure through unchanged, and swallows a rejection that arrives after the deadline", async () => {
    const own = new ProviderError("provider_rate_limited", "429");
    await expect(withDeadline(Promise.reject(own), Date.now() + 1000, "x")).rejects.toBe(own);
    const late = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late")), 60));
    await expect(withDeadline(late, Date.now() + 10, "x")).rejects.toMatchObject({ failureCode: "provider_timeout" });
    await new Promise((resolve) => setTimeout(resolve, 100)); // would surface as an unhandled rejection if not swallowed
  });
});
