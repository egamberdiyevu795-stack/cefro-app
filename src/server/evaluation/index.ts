import "server-only";
import { getEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";
import { AnthropicEvaluationModel } from "./anthropic-evaluation-model";
import type { ArgumentEvaluationModel } from "./argument-types";
import { GeminiAudioAssessor } from "./gemini-audio-assessor";
import { GeminiEvaluationModel } from "./gemini-evaluation-model";
import { MockArgumentModel } from "./mock-argument-model";
import { MockEvaluationModel } from "./mock-evaluation-model";
import type { AudioAssessor, EvaluationModel } from "./types";

let override: EvaluationModel | undefined;
let argumentOverride: ArgumentEvaluationModel | undefined;
let audioOverride: AudioAssessor | null | undefined;

/** Resolve the configured evaluation model. Throws ProviderError if misconfigured. */
export function getEvaluationModel(): EvaluationModel {
  if (override) return override;
  const env = getEnv();
  switch (env.EVALUATION_PROVIDER) {
    case "mock":
      if (env.NODE_ENV === "production") {
        throw new ProviderError("provider_not_configured", "Mock evaluator is disabled in production", {
          retryable: false,
        });
      }
      return new MockEvaluationModel();
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) {
        throw new ProviderError("provider_not_configured", "ANTHROPIC_API_KEY is not set", { retryable: false });
      }
      return new AnthropicEvaluationModel({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_EVALUATION_MODEL,
        effort: env.ANTHROPIC_EVALUATION_EFFORT,
        maxTokens: env.ANTHROPIC_EVALUATION_MAX_TOKENS,
        serverFallbacks: env.ANTHROPIC_SERVER_FALLBACKS,
        timeoutMs: env.EVALUATION_TIMEOUT_MS,
      });
    case "gemini":
      if (!env.GEMINI_API_KEY) {
        throw new ProviderError("provider_not_configured", "GEMINI_API_KEY is not set", { retryable: false });
      }
      return new GeminiEvaluationModel({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_EVALUATION_MODEL,
        maxTokens: env.GEMINI_EVALUATION_MAX_TOKENS,
        thinkingLevel: env.GEMINI_THINKING_LEVEL,
        temperature: env.GEMINI_TEMPERATURE,
        structuredOutput: env.GEMINI_STRUCTURED_OUTPUT,
        timeoutMs: env.EVALUATION_TIMEOUT_MS,
      });
  }
}

export function setEvaluationModelForTesting(model: EvaluationModel | undefined) {
  override = model;
}

/**
 * The configured model for Part 3 (official Question 8). The same providers as Part 2, asked for the Part 3 output
 * schema (they pick it from the input's rubric); development uses the Part 3 mock evaluator. Throws ProviderError if
 * misconfigured, exactly like `getEvaluationModel`.
 */
export function getArgumentEvaluationModel(): ArgumentEvaluationModel {
  if (argumentOverride) return argumentOverride;
  const env = getEnv();
  if (env.EVALUATION_PROVIDER === "mock") {
    if (env.NODE_ENV === "production") {
      throw new ProviderError("provider_not_configured", "Mock evaluator is disabled in production", { retryable: false });
    }
    return new MockArgumentModel();
  }
  // Gemini and Anthropic implement both contracts: their response schema follows the input's rubric.
  const model = getEvaluationModel();
  if (model instanceof AnthropicEvaluationModel || model instanceof GeminiEvaluationModel) return model;
  throw new ProviderError("provider_not_configured", `No Part 3 evaluator for provider "${model.provider}"`, { retryable: false });
}

export function setArgumentEvaluationModelForTesting(model: ArgumentEvaluationModel | undefined) {
  argumentOverride = model;
}

/**
 * The audio step (pronunciation and pausing from the recording), or null when it is off (AUDIO_ASSESSMENT).
 * "auto" turns it on only for a real evaluator with a Gemini key, so development with mocks never calls Gemini.
 */
export function getAudioAssessor(): AudioAssessor | null {
  if (audioOverride !== undefined) return audioOverride;
  const env = getEnv();
  const wanted =
    env.AUDIO_ASSESSMENT === "gemini" || (env.AUDIO_ASSESSMENT === "auto" && Boolean(env.GEMINI_API_KEY) && env.EVALUATION_PROVIDER !== "mock");
  if (!wanted) return null;
  if (!env.GEMINI_API_KEY) {
    throw new ProviderError("provider_not_configured", "GEMINI_API_KEY is not set (AUDIO_ASSESSMENT=gemini)", { retryable: false });
  }
  return new GeminiAudioAssessor({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_AUDIO_ASSESSMENT_MODEL, timeoutMs: env.EVALUATION_TIMEOUT_MS });
}

/** undefined = use the configured assessor again. */
export function setAudioAssessorForTesting(assessor: AudioAssessor | null | undefined) {
  audioOverride = assessor;
}

export { evaluateSpeaking } from "./speaking-evaluator";
export { evaluateArgument } from "./argument-evaluator";
export type { AudioAssessor, EvaluationModel } from "./types";
export type { ArgumentEvaluationModel } from "./argument-types";
