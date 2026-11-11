import "server-only";
import type { RetryFocusItem } from "@/domain/evaluation/stored";
import type { BalancedArgumentTask, PointId } from "@/domain/speaking/argument-task";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import type { ArgumentRubric } from "./rubrics/q8";
import type { EvaluationPrompt, ModelEvaluationOutput } from "./types";

/** Everything the Part 3 evaluator knows about one attempt (the Part 2 `EvaluationInput`, with a Part 3 task). */
export interface ArgumentEvaluationInput {
  task: BalancedArgumentTask;
  rubric: ArgumentRubric;
  transcript: string;
  metrics: SpeechMetrics;
  /** The points the student ticked on the preparation screen. Feedback only: the evaluator judges what was said. */
  chosenPoints: readonly PointId[];
  audio: { storageProvider: string; storageKey: string; mimeType: string; durationMs: number };
  previousAttempt: { attemptNumber: number; transcript: string; retryFocus: RetryFocusItem[] } | null;
}

/**
 * A Part 3 model backend: the Part 2 `EvaluationModel` contract with a Part 3 input. The mock, Gemini and Anthropic
 * models all implement it (the real providers pick the Part 3 output schema from the input's rubric). No model has
 * been called with the Part 3 prompt yet: it still needs the live anchor run before `PART_LIVE["3"]` is switched on.
 */
export interface ArgumentEvaluationModel {
  readonly provider: string;
  readonly model: string;
  readonly isDevelopmentProvider: boolean;
  readonly config: Record<string, string | number | boolean>;
  evaluate(prompt: EvaluationPrompt, input: ArgumentEvaluationInput): Promise<ModelEvaluationOutput>;
}
