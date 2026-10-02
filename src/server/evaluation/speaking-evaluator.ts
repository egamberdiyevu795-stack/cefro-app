import "server-only";
import { createHash } from "node:crypto";
import { evaluationResultV1Schema, type EvaluationResult } from "@/domain/evaluation/schema";
import { ProviderError } from "@/server/errors";
import { logger } from "@/server/logging/logger";
import { buildSpeakingEvaluationPrompt } from "./prompts/speaking-evaluation-v1";
import type { EvaluationInput, EvaluationModel } from "./types";
import { EVALUATION_SCHEMA_VERSION, EVALUATOR_VERSION } from "./versions";

export interface SpeakingEvaluation {
  result: EvaluationResult;
  evaluatorVersion: string;
  rubricVersion: string;
  schemaVersion: number;
  promptHash: string;
  provider: string;
  model: string;
  isDevelopmentProvider: boolean;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Invalid/malformed output gets one more try before the attempt is marked failed. */
const MAX_INVALID_OUTPUT_ATTEMPTS = 2;

/**
 * Runs the speaking evaluation methodology: build prompt → call model →
 * validate against the schema → normalise → attach version metadata.
 */
export async function evaluateSpeaking(
  input: EvaluationInput,
  model: EvaluationModel,
): Promise<SpeakingEvaluation> {
  const prompt = buildSpeakingEvaluationPrompt(input);
  const promptHash = sha256(`${EVALUATOR_VERSION}\n${prompt.system}`);
  const startedAt = Date.now();

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_INVALID_OUTPUT_ATTEMPTS; attempt++) {
    try {
      const raw = await model.evaluate(prompt, input);
      const result = validateEvaluationOutput(raw.output);
      warnOnUnverifiedQuotes(result, input.transcript);
      return {
        result: normalise(result, input),
        evaluatorVersion: EVALUATOR_VERSION,
        rubricVersion: input.rubric.version,
        schemaVersion: EVALUATION_SCHEMA_VERSION,
        promptHash,
        provider: raw.provider,
        model: raw.model,
        isDevelopmentProvider: model.isDevelopmentProvider,
        latencyMs: Date.now() - startedAt,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ProviderError && error.failureCode === "evaluation_invalid_output";
      logger.warn("Evaluation attempt failed", { attempt, retryable, error });
      if (!retryable) throw error;
    }
  }
  throw lastError;
}

/** Parse and validate unknown model output (object or JSON string). */
export function validateEvaluationOutput(output: unknown): EvaluationResult {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new ProviderError("evaluation_invalid_output", "Evaluation output is not valid JSON", {
        cause: error,
      });
    }
  }
  const parsed = evaluationResultV1Schema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError(
      "evaluation_invalid_output",
      `Evaluation output failed schema validation: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Enforce invariants the JSON schema cannot express. */
function normalise(result: EvaluationResult, input: EvaluationInput): EvaluationResult {
  const criteria = { ...result.criteria };
  for (const key of Object.keys(criteria) as (keyof typeof criteria)[]) {
    const c = criteria[key];
    if (!c.assessable || c.score === null) {
      criteria[key] = { ...c, assessable: false, score: null, level: null };
    }
  }
  return {
    ...result,
    criteria,
    // A first attempt has nothing to review.
    retry_review: input.previousAttempt ? result.retry_review : null,
  };
}

function warnOnUnverifiedQuotes(result: EvaluationResult, transcript: string) {
  const haystack = squash(transcript);
  const quotes = [
    ...result.strengths.map((s) => s.evidence_quote),
    ...result.issues.flatMap((i) => i.evidence_quotes),
  ].filter((q) => q.trim().length > 0);
  const unverified = quotes.filter((quote) => !haystack.includes(squash(quote)));
  if (unverified.length > 0) {
    logger.warn("Evaluation contains quotes not found verbatim in transcript", {
      unverifiedCount: unverified.length,
      totalQuotes: quotes.length,
    });
  }
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
