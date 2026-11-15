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
  audio: null,
  retryFocus: null,
  transcript: null,
  metrics: null,
  evaluation: null,
  createdAt: new Date(0).toISOString(),
  completedAt: null,
});

describe("practiceReducer", () => {
  it("the spoken introduction comes between the brief and preparation, and only from a brief", () => {
    const intro = practiceReducer(initialPracticeState, { type: "introStarted" });
    expect(intro.phase).toEqual({ kind: "intro" });
    expect(practiceReducer(intro, { type: "preparationStarted", now: 1_000, preparationMs: 60_000 }).phase).toEqual({ kind: "preparing", endsAt: 61_000 });
    const preparing = practiceReducer(intro, { type: "preparationStarted", now: 0, preparationMs: 60_000 });
    expect(practiceReducer(preparing, { type: "introStarted" })).toBe(preparing);
    expect(practiceReducer(intro, { type: "backToBrief" }).phase).toEqual({ kind: "brief" });
  });

  it("Part 2: after the introduction the questions are read (no countdown), and only then the minute of preparation", () => {
    const intro = practiceReducer(initialPracticeState, { type: "introStarted" });
    const questions = practiceReducer(intro, { type: "questionsStarted" });
    expect(questions.phase).toEqual({ kind: "questions" });
    expect(practiceReducer(questions, { type: "preparationStarted", now: 1_000, preparationMs: 60_000 }).phase).toEqual({ kind: "preparing", endsAt: 61_000 });
    // Only from the introduction: never from the brief, preparation or a second time.
    expect(practiceReducer(initialPracticeState, { type: "questionsStarted" })).toBe(initialPracticeState);
    expect(practiceReducer(questions, { type: "questionsStarted" })).toBe(questions);
    const preparing = practiceReducer(questions, { type: "preparationStarted", now: 0, preparationMs: 60_000 });
    expect(practiceReducer(preparing, { type: "questionsStarted" })).toBe(preparing);
    expect(practiceReducer(questions, { type: "backToBrief" }).phase).toEqual({ kind: "brief" });
  });

  it("a retry that finishes loading late never pulls the student out of preparation or recording", () => {
    const preparing = practiceReducer(initialPracticeState, { type: "preparationStarted", now: 1000, preparationMs: 60_000 });
    expect(practiceReducer(preparing, { type: "retryRequested", attempt: attempt("a", "completed") })).toBe(preparing);
    const recording = practiceReducer(preparing, { type: "recordingStarted", now: 5000, speakingMs: 120_000 });
    expect(practiceReducer(recording, { type: "retryRequested", attempt: attempt("a", "completed") })).toBe(recording);
    // From the brief it still opens the retry brief.
    expect(practiceReducer(initialPracticeState, { type: "retryRequested", attempt: attempt("a", "completed") }).phase).toEqual({ kind: "retryBrief" });
  });

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
