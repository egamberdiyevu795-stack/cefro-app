import { describe, expect, it } from "vitest";
import type { AttemptView } from "@/domain/speaking/attempt";
import { initialPracticeState, practiceReducer } from "./practice-machine";

const attempt = (id: string, status: AttemptView["status"] = "processing"): AttemptView => ({
  id,
  taskId: "t",
  taskVersion: 1,
  attemptNumber: 1,
  previousAttemptId: null,
  status,
  failure: null,
  isStalled: false,
  recordingDurationMs: 1000,
  retryFocus: null,
  transcript: null,
  metrics: null,
  evaluation: null,
  createdAt: new Date(0).toISOString(),
  completedAt: null,
});

describe("practiceReducer", () => {
  it("stores absolute deadlines for preparation and recording", () => {
    let state = practiceReducer(initialPracticeState, { type: "preparationStarted", now: 1000, preparationMs: 60_000 });
    expect(state.phase).toEqual({ kind: "preparing", endsAt: 61_000 });
    state = practiceReducer(state, { type: "recordingStarted", now: 5000, speakingMs: 120_000 });
    expect(state.phase).toEqual({ kind: "recording", endsAt: 125_000 });
  });

  it("only moves to review when stopping an active recording", () => {
    expect(practiceReducer(initialPracticeState, { type: "recordingStopped" }).phase.kind).toBe("brief");
  });

  it("moves from processing to result when the polled attempt settles", () => {
    let state = practiceReducer(initialPracticeState, { type: "uploadSucceeded", attempt: attempt("a") });
    expect(state.phase).toEqual({ kind: "processing", attemptId: "a" });
    state = practiceReducer(state, { type: "attemptUpdated", attempt: attempt("a", "completed") });
    expect(state.phase).toEqual({ kind: "result", attemptId: "a" });
    expect(state.attempts.a.status).toBe("completed");
  });

  it("keeps the retry target until returning to the brief", () => {
    let state = practiceReducer(initialPracticeState, { type: "retryRequested", attempt: attempt("a", "completed") });
    expect(state.retryOf?.id).toBe("a");
    state = practiceReducer(state, { type: "backToBrief" });
    expect(state.retryOf).toBeNull();
  });

  it("attemptCached keeps an attempt without changing the screen", () => {
    const shown = practiceReducer(initialPracticeState, { type: "showAttempt", attempt: attempt("b", "completed") });
    const state = practiceReducer(shown, { type: "attemptCached", attempt: attempt("a", "completed") });
    expect(state.phase).toEqual({ kind: "result", attemptId: "b" });
    expect(Object.keys(state.attempts).sort()).toEqual(["a", "b"]);
  });
});
