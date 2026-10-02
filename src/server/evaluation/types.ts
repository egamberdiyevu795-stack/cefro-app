import "server-only";
import type { EvaluationResult, RetryFocusItem } from "@/domain/evaluation/schema";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import type { Rubric } from "./rubrics";

/** Everything the evaluator knows about one attempt. */
export interface EvaluationInput {
  task: SpeakingTask;
  rubric: Rubric;
  transcript: string;
  metrics: SpeechMetrics;
  /**
   * Reference to the stored audio. The v1 evaluator is transcript-based and
   * does not use it; it is passed so audio-capable evaluators can be added
   * without changing the pipeline.
   */
  audio: { storageProvider: string; storageKey: string; mimeType: string; durationMs: number };
  /** Present when this attempt is a retry. */
  previousAttempt: {
    attemptNumber: number;
    transcript: string;
    evaluation: EvaluationResult;
    retryFocus: RetryFocusItem[];
  } | null;
}

/** The prompt actually sent to a model (also hashed for versioning). */
export interface EvaluationPrompt {
  system: string;
  user: string;
}

export interface ModelEvaluationOutput {
  /** Unvalidated model output — must go through schema validation before use. */
  output: unknown;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * A model backend that turns an evaluation prompt into structured output.
 * Provider-specific code lives only in implementations of this interface.
 */
export interface EvaluationModel {
  readonly provider: string;
  readonly model: string;
  readonly isDevelopmentProvider: boolean;
  evaluate(prompt: EvaluationPrompt, input: EvaluationInput): Promise<ModelEvaluationOutput>;
}
