import "server-only";
import type { LevelLadder } from "@/domain/evaluation/multilevel/levels";
import type { RetryFocusItem } from "@/domain/evaluation/stored";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import type { Rubric } from "./rubrics";

/** Everything the evaluator knows about one attempt. */
export interface EvaluationInput {
  task: SpeakingTask;
  rubric: Rubric;
  transcript: string;
  metrics: SpeechMetrics;
  /** Reference to the stored audio (the audio itself is passed to the audio step separately). */
  audio: { storageProvider: string; storageKey: string; mimeType: string; durationMs: number };
  /** Present when this attempt is a retry. */
  previousAttempt: {
    attemptNumber: number;
    transcript: string;
    /** The focus the student was given for this attempt. */
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
  /** The model requested; the model that actually answered is in ModelEvaluationOutput. */
  readonly model: string;
  readonly isDevelopmentProvider: boolean;
  /** Request settings that can affect results (effort, token limit…). Stored with each evaluation. */
  readonly config: Record<string, string | number | boolean>;
  evaluate(prompt: EvaluationPrompt, input: EvaluationInput): Promise<ModelEvaluationOutput>;
}

/** A model that listens to the recording and judges pronunciation and pausing (see audio-assessment.ts). */
export interface AudioAssessor {
  readonly provider: string;
  readonly model: string;
  /** `levels`: the rubric's level names, for the provider's response schema (Part 2's when left out). */
  assess(request: { prompt: string; audio: Buffer; mimeType: string; levels?: LevelLadder }): Promise<ModelEvaluationOutput>;
}
