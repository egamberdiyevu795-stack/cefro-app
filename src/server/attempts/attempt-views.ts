import "server-only";
import { CEFR_LEVELS, type CefrLevel } from "@/domain/cefr";
import type { EvaluationResult, RetryFocusItem } from "@/domain/evaluation/schema";
import type { AttemptSummary, AttemptView, FailureCode } from "@/domain/speaking/attempt";
import { FAILURE_CODES, IN_PROGRESS_STATUSES } from "@/domain/speaking/attempt";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import type { AttemptRow, EvaluationRow, RecordingRow, TranscriptRow } from "./attempt-repository";

/** Providers whose results are not real assessments (shown with a warning in the UI). */
const DEVELOPMENT_PROVIDERS = new Set(["mock"]);

/** An attempt with no progress for this long is considered stalled and may be restarted. */
export const PROCESSING_STALE_AFTER_MS = 6 * 60 * 1000;
/** An uploaded attempt whose processing never started (e.g. server restart). */
export const UPLOAD_STALE_AFTER_MS = 60 * 1000;

export function isAttemptStalled(attempt: AttemptRow, now = Date.now()): boolean {
  if (!IN_PROGRESS_STATUSES.includes(attempt.status)) return false;
  if (attempt.status === "uploaded") {
    return now - Date.parse(attempt.createdAt) > UPLOAD_STALE_AFTER_MS;
  }
  const startedAt = attempt.processingStartedAt ? Date.parse(attempt.processingStartedAt) : 0;
  return now - startedAt > PROCESSING_STALE_AFTER_MS;
}

export function toAttemptView(
  attempt: AttemptRow,
  related: {
    recording: RecordingRow | undefined;
    transcript: TranscriptRow | undefined;
    evaluation: EvaluationRow | undefined;
  },
): AttemptView {
  const { recording, transcript, evaluation } = related;
  return {
    id: attempt.id,
    taskId: attempt.taskId,
    taskVersion: attempt.taskVersion,
    attemptNumber: attempt.attemptNumber,
    previousAttemptId: attempt.previousAttemptId,
    status: attempt.status,
    failure:
      attempt.status === "failed"
        ? { stage: attempt.failureStage ?? null, code: toFailureCode(attempt.failureCode) }
        : null,
    isStalled: isAttemptStalled(attempt),
    recordingDurationMs: recording?.durationMs ?? 0,
    retryFocus: (attempt.retryFocus as RetryFocusItem[] | null) ?? null,
    transcript: transcript
      ? { text: transcript.text, provider: transcript.provider, model: transcript.model }
      : null,
    metrics: (attempt.metrics as SpeechMetrics | null) ?? null,
    evaluation:
      evaluation && attempt.status === "completed"
        ? {
            result: evaluation.result as EvaluationResult,
            meta: {
              evaluatorVersion: evaluation.evaluatorVersion,
              rubricVersion: evaluation.rubricVersion,
              schemaVersion: evaluation.schemaVersion,
              provider: evaluation.provider,
              model: evaluation.model,
              createdAt: evaluation.createdAt,
              isDevelopmentProvider: DEVELOPMENT_PROVIDERS.has(evaluation.provider),
            },
          }
        : null,
    createdAt: attempt.createdAt,
    completedAt: attempt.completedAt,
  };
}

export function toAttemptSummary(attempt: AttemptRow, evaluation: EvaluationRow | undefined): AttemptSummary {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    overallLevel:
      evaluation && (CEFR_LEVELS as readonly string[]).includes(evaluation.overallLevel)
        ? (evaluation.overallLevel as CefrLevel)
        : null,
    createdAt: attempt.createdAt,
    previousAttemptId: attempt.previousAttemptId,
  };
}

function toFailureCode(value: string | null): FailureCode {
  return value && (FAILURE_CODES as readonly string[]).includes(value) ? (value as FailureCode) : "unknown";
}
