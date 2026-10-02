import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { evaluationResultV1Schema } from "@/domain/evaluation/schema";
import { ProviderError } from "@/server/errors";
import type { EvaluationInput, EvaluationModel, EvaluationPrompt, ModelEvaluationOutput } from "./types";

/**
 * Claude-backed evaluation model.
 *
 * Uses structured outputs so the response is JSON matching the evaluation
 * schema. The result is still re-validated by the evaluation service before
 * it is stored — we never trust model output blindly.
 */
export class AnthropicEvaluationModel implements EvaluationModel {
  readonly provider = "anthropic";
  readonly isDevelopmentProvider = false;
  private readonly client: Anthropic;

  constructor(private readonly options: { apiKey: string; model: string; timeoutMs: number }) {
    this.client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 2 });
  }

  get model(): string {
    return this.options.model;
  }

  async evaluate(prompt: EvaluationPrompt, _input: EvaluationInput): Promise<ModelEvaluationOutput> {
    void _input; // v1 is transcript-only; the prompt already contains everything needed.
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.options.model,
        max_tokens: 16000,
        // If the primary model declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: {
          // Assessment quality matters more than latency here.
          effort: "high",
          format: betaZodOutputFormat(evaluationResultV1Schema),
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (error) {
      throw mapAnthropicError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError("evaluation_failed", "Evaluation model refused the request", {
        cause: response.stop_details,
      });
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("evaluation_invalid_output", "Evaluation output was truncated (max_tokens)");
    }

    // Prefer the SDK's parsed output; fall back to the raw text so the
    // service can report exactly why validation failed.
    const output =
      response.parsed_output ??
      response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

    return {
      output,
      provider: this.provider,
      model: response.model,
      inputTokens: response.usage.input_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? null,
    };
  }
}

function mapAnthropicError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("provider_timeout", "Anthropic request timed out", { cause: error });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("provider_not_configured", "Anthropic rejected the API key", {
      cause: error,
      retryable: false,
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("provider_rate_limited", "Anthropic rate limit", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError("evaluation_failed", `Anthropic API error ${error.status ?? ""}`, { cause: error });
  }
  // Anything else (e.g. the SDK failing to parse the JSON) is an invalid output.
  return new ProviderError("evaluation_invalid_output", "Could not parse evaluation output", { cause: error });
}
