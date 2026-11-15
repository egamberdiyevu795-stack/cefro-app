import type { AttemptStatus, AttemptView } from "@/domain/speaking/attempt";

/**
 * Pure helpers for the practice screens (brief → preparation → recording → scoring). No React, no browser APIs.
 */

/** Finishing before this asks "Finish anyway?": less than half of Part 2's two minutes is very likely too short. */
export const EARLY_FINISH_MS = 60_000;

export function isEarlyFinish(elapsedMs: number, speakingSeconds: number): boolean {
  // A shorter task (none today) would warn before half its own time instead.
  return elapsedMs < Math.min(EARLY_FINISH_MS, (speakingSeconds * 1000) / 2);
}

/** An attempt that has a stored evaluation and transcript. */
export type EvaluatedAttempt = AttemptView & {
  evaluation: NonNullable<AttemptView["evaluation"]>;
  transcript: NonNullable<AttemptView["transcript"]>;
};

export function isEvaluated(attempt: AttemptView): attempt is EvaluatedAttempt {
  return attempt.status === "completed" && attempt.evaluation !== null && attempt.transcript !== null;
}

/** The retry goal shown on every screen: the evaluator's first retry focus, the one "Retry with this goal" carries. */
export interface RetryGoal {
  objective: string;
  check: string | null;
}

export function retryGoalOf(attempt: AttemptView | null): RetryGoal | null {
  const first = attempt?.evaluation?.result.retry_focus[0];
  return first ? { objective: first.objective, check: first.success_check || null } : null;
}

/** Which step of the scoring screen an attempt is on (the same steps as the result page's "Scoring…"). */
export function scoringStep(status: AttemptStatus | null): "saved" | "transcribing" | "scoring" {
  return status === "evaluating" ? "scoring" : status === "transcribing" ? "transcribing" : "saved";
}

/* ---------------------------------------------------------------------------------------------------------- mock */

/** A saved live fixture run, standing in for the attempt a mock retry comes from. */
export interface MockAttemptKey {
  anchor: string;
  run: number;
}

/** Practice page links. `retry` is an attempt id, or (mock) a fixture anchor with its run. */
export function practiceHref(taskId: string, options: { mock?: boolean; retry?: string; run?: number } = {}): string {
  const params = new URLSearchParams();
  if (options.mock) params.set("mock", "1");
  if (options.retry) params.set("retry", options.retry);
  if (options.retry && options.run) params.set("run", String(options.run));
  const query = params.toString();
  return `/practice/speaking/${encodeURIComponent(taskId)}${query ? `?${query}` : ""}`;
}

/**
 * Mock mode, after Finish: the result page's "Scoring…" state, which then opens the mock result. A retry carries the
 * attempt it retries (`from`), so the result can say whether its goal was met.
 */
export function mockScoringHref(from: MockAttemptKey | null): string {
  const params = new URLSearchParams({ state: "scoring", next: "1" });
  if (from) {
    params.set("from", from.anchor);
    params.set("fromRun", String(from.run));
  }
  params.set("mock", "1"); // every link in mock mode keeps it
  return `/result?${params}`;
}

/**
 * Mock mode, demo results (see server/demo/demo-data.ts): the key of the result of a mock practice of a task, as a
 * first answer or as a retry of the demo result `retryOf`.
 */
export function demoPracticeKey(taskId: string, retryOf: string | null): string {
  return retryOf ? `retry.${taskId}.${retryOf}` : `answer.${taskId}`;
}

/** Mock mode, after Finish: "Scoring…" of the practised task's demo result, which then opens that result. */
export function demoScoringHref(taskId: string, retryOf: string | null): string {
  return `/result?${new URLSearchParams({ demo: demoPracticeKey(taskId, retryOf), state: "scoring", next: "1", mock: "1" })}`;
}
