/**
 * Loading the attempt a retry opened by its link (?retry=<id>) comes from, so its goal can be shown. The brief offers
 * "Start preparation" only once this is settled, so it must never stay "loading" forever:
 *
 *  - loading → loaded: the retry brief with its goal (or the plain brief if that attempt has no goal).
 *  - loading → failed (the request failed) or slow (no answer after RETRY_GOAL_TIMEOUT_MS): a short message with the
 *    black "Try again" and a quiet "Start without the goal". A slow request keeps running: if it still arrives, the goal
 *    is shown.
 *  - Try again: a new request (a new `request` number, so an older one that arrives late is ignored).
 *  - Start without the goal: the goal is given up for good; a late answer is ignored.
 */
export const RETRY_GOAL_TIMEOUT_MS = 10_000;

export type RetryGoalLoad =
  | { kind: "idle" }
  | { kind: "loading"; request: number }
  | { kind: "slow"; request: number }
  | { kind: "failed"; request: number }
  | { kind: "abandoned" };

export type RetryGoalLoadEvent =
  | { type: "timedOut"; request: number }
  | { type: "failed"; request: number }
  | { type: "loaded"; request: number }
  | { type: "tryAgain" }
  | { type: "startWithoutGoal" };

export function initialRetryGoalLoad(needsLoading: boolean): RetryGoalLoad {
  return needsLoading ? { kind: "loading", request: 1 } : { kind: "idle" };
}

/** The request whose answer is still wanted, or null (nothing to load, or the answer would be ignored). */
export function pendingRequest(state: RetryGoalLoad): number | null {
  return state.kind === "loading" || state.kind === "slow" ? state.request : null;
}

export function retryGoalLoadReducer(state: RetryGoalLoad, event: RetryGoalLoadEvent): RetryGoalLoad {
  switch (event.type) {
    case "timedOut":
      return state.kind === "loading" && state.request === event.request ? { kind: "slow", request: state.request } : state;
    case "failed":
      return pendingRequest(state) === event.request ? { kind: "failed", request: event.request } : state;
    case "loaded":
      return pendingRequest(state) === event.request ? { kind: "idle" } : state;
    case "tryAgain":
      return state.kind === "failed" || state.kind === "slow" ? { kind: "loading", request: state.request + 1 } : state;
    case "startWithoutGoal":
      return state.kind === "idle" ? state : { kind: "abandoned" };
  }
}
