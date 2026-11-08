import type { RetryFocusItem, StoredEvaluation } from "@/domain/evaluation/stored";
import type { SpeechMetrics } from "./metrics";

/**
 * Lifecycle of a speaking attempt on the server.
 *
 *   uploaded → processing → transcribing → evaluating → completed
 *                    ↘            ↘             ↘
 *                                failed (retryable — audio is kept)
 */
export const ATTEMPT_STATUSES = [
  "uploaded",
  "processing",
  "transcribing",
  "evaluating",
  "completed",
  "failed",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const IN_PROGRESS_STATUSES: readonly AttemptStatus[] = [
  "uploaded",
  "processing",
  "transcribing",
  "evaluating",
];

export type ProcessingStage = "transcription" | "evaluation";

/**
 * Machine-readable failure reasons. The UI maps these to student-friendly
 * messages; technical details stay in server logs.
 */
export const FAILURE_CODES = [
  "transcription_failed",
  "transcription_empty",
  "evaluation_failed",
  "evaluation_invalid_output",
  "evaluation_quality_rejected",
  "evaluation_refused",
  "provider_not_configured",
  "provider_timeout",
  "provider_rate_limited",
  "audio_unsupported",
  "audio_unavailable",
  "processing_stalled",
  "unknown",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export interface AttemptFailure {
  stage: ProcessingStage | null;
  code: FailureCode;
}

/** Metadata that answers "which methodology produced this evaluation?". */
export interface EvaluationMeta {
  evaluatorVersion: string;
  rubricVersion: string;
  schemaVersion: number;
  provider: string;
  model: string;
  createdAt: string;
  latencyMs: number | null;
  /** True for the local development evaluator — the UI must flag it clearly. */
  isDevelopmentProvider: boolean;
}

/** Attempt as returned by the API to the student's browser. */
export interface AttemptView {
  id: string;
  taskId: string;
  taskVersion: number;
  attemptNumber: number;
  previousAttemptId: string | null;
  status: AttemptStatus;
  failure: AttemptFailure | null;
  /** True when processing has been "in progress" for too long and can be restarted. */
  isStalled: boolean;
  recordingDurationMs: number;
  /**
   * The stored audio (docs/consent-design.md: deleted 30 days after scoring). `deletedAt`: when the daily job deleted
   * it (null while it is stored). `deletesAt`: when it is due (null while the attempt is still being processed).
   * Null when the attempt has no recording row.
   */
  audio: { deletedAt: string | null; deletesAt: string | null } | null;
  /** The focus the student was given before recording this attempt (retries only). */
  retryFocus: RetryFocusItem[] | null;
  transcript: { text: string; provider: string; model: string } | null;
  metrics: SpeechMetrics | null;
  evaluation: { result: StoredEvaluation; meta: EvaluationMeta } | null;
  createdAt: string;
  completedAt: string | null;
}

/** Compact attempt row for history lists. */
export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: AttemptStatus;
  /** Part band, for Multilevel results only (never an overall exam level). */
  band: { band: number; bandMax: number; label: string; provisional: boolean } | null;
  createdAt: string;
  previousAttemptId: string | null;
}
