import { describe, expect, it } from "vitest";
import { initialRetryGoalLoad, pendingRequest, RETRY_GOAL_TIMEOUT_MS, retryGoalLoadReducer as next } from "./retry-goal-load";

describe("loading a retry's goal never leaves the student stuck", () => {
  it("gives up waiting after about 10 seconds", () => {
    expect(RETRY_GOAL_TIMEOUT_MS).toBe(10_000);
  });

  it("nothing to load (no ?retry, or the attempt came with the page): idle", () => {
    expect(initialRetryGoalLoad(false)).toEqual({ kind: "idle" });
    expect(initialRetryGoalLoad(true)).toEqual({ kind: "loading", request: 1 });
  });

  it("loads normally", () => {
    expect(next(initialRetryGoalLoad(true), { type: "loaded", request: 1 })).toEqual({ kind: "idle" });
  });

  it("a failed load offers Try again, which sends a new request that can succeed", () => {
    const failed = next(initialRetryGoalLoad(true), { type: "failed", request: 1 });
    expect(failed).toEqual({ kind: "failed", request: 1 });
    expect(pendingRequest(failed)).toBeNull(); // the old answer is no longer wanted
    const again = next(failed, { type: "tryAgain" });
    expect(again).toEqual({ kind: "loading", request: 2 });
    expect(next(again, { type: "loaded", request: 2 })).toEqual({ kind: "idle" });
  });

  it("a slow load times out, but its answer is still used if it arrives", () => {
    const slow = next(initialRetryGoalLoad(true), { type: "timedOut", request: 1 });
    expect(slow).toEqual({ kind: "slow", request: 1 });
    expect(pendingRequest(slow)).toBe(1);
    expect(next(slow, { type: "loaded", request: 1 })).toEqual({ kind: "idle" });
    expect(next(slow, { type: "failed", request: 1 })).toEqual({ kind: "failed", request: 1 });
  });

  it("after Try again, a late answer to the older request is ignored", () => {
    const again = next(next(initialRetryGoalLoad(true), { type: "timedOut", request: 1 }), { type: "tryAgain" });
    expect(next(again, { type: "loaded", request: 1 })).toBe(again);
    expect(next(again, { type: "failed", request: 1 })).toBe(again);
    expect(next(again, { type: "timedOut", request: 1 })).toBe(again);
  });

  it("Start without the goal gives the goal up for good: a late answer is ignored", () => {
    for (const from of [initialRetryGoalLoad(true), { kind: "slow", request: 1 } as const, { kind: "failed", request: 1 } as const]) {
      const without = next(from, { type: "startWithoutGoal" });
      expect(without).toEqual({ kind: "abandoned" });
      expect(pendingRequest(without)).toBeNull();
      expect(next(without, { type: "loaded", request: 1 })).toBe(without);
      expect(next(without, { type: "tryAgain" })).toBe(without);
    }
  });

  it("a timeout after the answer arrived changes nothing", () => {
    const loaded = next(initialRetryGoalLoad(true), { type: "loaded", request: 1 });
    expect(next(loaded, { type: "timedOut", request: 1 })).toBe(loaded);
  });
});
