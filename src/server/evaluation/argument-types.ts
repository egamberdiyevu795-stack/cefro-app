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
 * A Part 3 model backend: the Part 2 `EvaluationModel` contract with a Part 3 input. Only the mock implements it in
 * this branch; the Gemini and Anthropic models are hard-wired to the Part 2 output schema and are not wired for
 * Part 3 until the live anchor run (Part 3 is not live).
 */
export interface ArgumentEvaluationModel {
  readonly provider: string;
  readonly model: string;
  readonly isDevelopmentProvider: boolean;
  readonly config: Record<string, string | number | boolean>;
  evaluate(prompt: EvaluationPrompt, input: ArgumentEvaluationInput): Promise<ModelEvaluationOutput>;
}
