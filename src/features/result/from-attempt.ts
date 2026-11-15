/**
 * Real attempts → the result page. Builds the view model's `ResultSource` from an attempt as the API returns it
 * (`AttemptView`), exactly as the fixtures do for the prototype, so the page renders a stored attempt with no other
 * change. Browser-safe: no provider, no database.
 */
import { isMultilevel } from "@/domain/evaluation/stored";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { BandLabel, ResultSource } from "./view-model";

type Task = ResultSource["task"];

/**
 * `null` for an attempt scored with the old method (no Part band): the result page cannot show it.
 * `previous` is the attempt this one retries, when it is loaded (its first retry focus is the goal that was checked).
 */
export function resultSourceFromAttempt(
  attempt: AttemptView,
  ctx: { task: Task; bandLabels: readonly BandLabel[]; previous?: AttemptView | null },
): ResultSource | null {
  const evaluation = attempt.evaluation;
  if (evaluation && !isMultilevel(evaluation.result)) return null;
  const previousResult = ctx.previous?.evaluation?.result;
  return {
    task: ctx.task,
    // A stalled attempt is not "still scoring": it goes to the failure screen, which offers to try again.
    status: attempt.isStalled ? "failed" : attempt.status,
    failure: attempt.isStalled ? { stage: null, code: "processing_stalled" } : attempt.failure,
    recordingDurationMs: attempt.recordingDurationMs,
    transcript: attempt.transcript?.text ?? null,
    evaluation: evaluation && isMultilevel(evaluation.result) ? { result: evaluation.result } : null,
    previous: previousResult && isMultilevel(previousResult) ? { evaluation: { result: previousResult } } : null,
    bandLabels: ctx.bandLabels,
    isDevelopmentProvider: evaluation?.meta.isDevelopmentProvider ?? false,
  };
}

/** Played on the result page: the stored recording, streamed by the API (owner only). */
export function attemptAudioUrl(attemptId: string): string {
  return `/api/speaking/attempts/${encodeURIComponent(attemptId)}/audio`;
}
