import type { CefrLevel } from "@/domain/cefr";
import type { EvaluationResult, RetryFocusItem } from "@/domain/evaluation/schema";
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
  "provider_not_configured",
  "provider_timeout",
  "provider_rate_limited",
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
  /** The focus the student was given before recording this attempt (retries only). */
  retryFocus: RetryFocusItem[] | null;
  transcript: { text: string; provider: string; model: string } | null;
  metrics: SpeechMetrics | null;
  evaluation: { result: EvaluationResult; meta: EvaluationMeta } | null;
  createdAt: string;
  completedAt: string | null;
}

/** Compact attempt row for history lists. */
export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: AttemptStatus;
  overallLevel: CefrLevel | null;
  createdAt: string;
  previousAttemptId: string | null;
}
