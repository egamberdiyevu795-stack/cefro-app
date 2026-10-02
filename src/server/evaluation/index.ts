import "server-only";
import { getEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";
import { AnthropicEvaluationModel } from "./anthropic-evaluation-model";
import { GeminiEvaluationModel } from "./gemini-evaluation-model";
import { MockEvaluationModel } from "./mock-evaluation-model";
import type { EvaluationModel } from "./types";

let override: EvaluationModel | undefined;

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
        structuredOutput: env.GEMINI_STRUCTURED_OUTPUT,
        timeoutMs: env.EVALUATION_TIMEOUT_MS,
      });
  }
}

export function setEvaluationModelForTesting(model: EvaluationModel | undefined) {
  override = model;
}

export { evaluateSpeaking } from "./speaking-evaluator";
export type { EvaluationModel } from "./types";
