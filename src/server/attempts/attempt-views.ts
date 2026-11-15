import "server-only";
import { audioDeleteDueAt } from "@/domain/audio-retention";
import { parseStoredEvaluation, type RetryFocusItem } from "@/domain/evaluation/stored";
import type { AttemptSummary, AttemptView, FailureCode } from "@/domain/speaking/attempt";
import { FAILURE_CODES, IN_PROGRESS_STATUSES } from "@/domain/speaking/attempt";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
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
  // Older evaluations are upgraded for display only; their stored versions are reported unchanged.
  const parsedEvaluation = evaluation ? parseStoredEvaluation(evaluation.schemaVersion, evaluation.result) : null;
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
    audio: recording ? { deletedAt: recording.audioDeletedAt ?? null, deletesAt: audioDeleteDueAt(attempt) } : null,
    retryFocus: (attempt.retryFocus as RetryFocusItem[] | null) ?? null,
    transcript: transcript
      ? { text: transcript.text, provider: transcript.provider, model: transcript.model }
      : null,
    // Before transcription a Part 1 attempt's metrics hold only its question offsets: not speech metrics yet.
    metrics: typeof (attempt.metrics as SpeechMetrics | null)?.wordCount === "number" ? (attempt.metrics as SpeechMetrics) : null,
    evaluation:
      evaluation && attempt.status === "completed" && parsedEvaluation
        ? {
            result: parsedEvaluation,
            meta: {
              evaluatorVersion: evaluation.evaluatorVersion,
              rubricVersion: evaluation.rubricVersion,
              schemaVersion: evaluation.schemaVersion,
              provider: evaluation.provider,
              model: evaluation.model,
              createdAt: evaluation.createdAt,
              latencyMs: evaluation.latencyMs,
              isDevelopmentProvider: DEVELOPMENT_PROVIDERS.has(evaluation.provider),
            },
          }
        : null,
    createdAt: attempt.createdAt,
    completedAt: attempt.completedAt,
    feedbackHelpful: attempt.feedbackHelpful ?? null,
  };
}

export function toAttemptSummary(attempt: AttemptRow, evaluation: EvaluationRow | undefined): AttemptSummary {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    band: bandOf(evaluation),
    createdAt: attempt.createdAt,
    previousAttemptId: attempt.previousAttemptId,
  };
}

export function toHistoryAttempt(
  row: { attempt: AttemptRow; title: string; part: number; level: string; recordingDurationMs: number | null },
  evaluation: EvaluationRow | undefined,
): HistoryAttempt {
  const { attempt } = row;
  const parsed = evaluation && attempt.status === "completed" ? parseStoredEvaluation(evaluation.schemaVersion, evaluation.result) : null;
  return {
    id: attempt.id,
    taskId: attempt.taskId,
    title: row.title,
    part: examPartOf(row),
    createdAt: attempt.createdAt,
    status: attempt.status,
    isStalled: isAttemptStalled(attempt),
    failureCode: attempt.status === "failed" ? toFailureCode(attempt.failureCode) : null,
    recordingDurationMs: row.recordingDurationMs ?? 0,
    previousAttemptId: attempt.previousAttemptId,
    sessionId: attempt.sessionId ?? null,
    result: parsed && (parsed.kind === "multilevel" || parsed.kind === "multilevel_q8") ? parsed : null,
  };
}

/** Band headline for history lists. Old (schema 1–2) results have none: they were not scored on the band scale. */
function bandOf(evaluation: EvaluationRow | undefined): AttemptSummary["band"] {
  if (!evaluation) return null;
  const parsed = parseStoredEvaluation(evaluation.schemaVersion, evaluation.result);
  if (!parsed || (parsed.kind !== "multilevel" && parsed.kind !== "multilevel_q8")) return null;
  const { band, band_max, label, provisional } = parsed.scoring;
  return { band, bandMax: band_max, label, provisional };
}

function toFailureCode(value: string | null): FailureCode {
  return value && (FAILURE_CODES as readonly string[]).includes(value) ? (value as FailureCode) : "unknown";
}
