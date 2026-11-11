import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { providerOutputSchema } from "@/domain/evaluation/multilevel/model-output";
import { q8ModelOutputSchema } from "@/domain/evaluation/q8/model-output";
import { ProviderError } from "@/server/errors";
import type { ArgumentEvaluationInput, ArgumentEvaluationModel } from "./argument-types";
import type { EvaluationInput, EvaluationModel, EvaluationPrompt, ModelEvaluationOutput } from "./types";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicEvaluationOptions {
  apiKey: string;
  model: string;
  effort: AnthropicEffort;
  maxTokens: number;
  timeoutMs: number;
  /** Server-side refusal fallback (beta). Disable if the account does not have the beta. */
  serverFallbacks: boolean;
  /** SDK retries for 408/409/429/5xx and connection errors. */
  maxRetries?: number;
  /** Test seam: replaces the HTTP client. */
  fetch?: typeof fetch;
}

/**
 * Claude-backed evaluation model.
 *
 * Uses structured outputs so the response is JSON shaped like the evaluation
 * schema. Constraints such as enums and ranges are only hints to the API, so
 * the evaluation service re-validates everything before it is stored.
 */
export class AnthropicEvaluationModel implements EvaluationModel, ArgumentEvaluationModel {
  readonly provider = "anthropic";
  readonly isDevelopmentProvider = false;
  readonly config: Record<string, string | number | boolean>;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicEvaluationOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries ?? 2,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    this.config = {
      effort: options.effort,
      maxTokens: options.maxTokens,
      serverFallbacks: options.serverFallbacks,
      thinking: "adaptive",
    };
  }

  get model(): string {
    return this.options.model;
  }

  async evaluate(prompt: EvaluationPrompt, input: EvaluationInput | ArgumentEvaluationInput): Promise<ModelEvaluationOutput> {
    // Part 3 (official Question 8) has its own output shape; every other rubric is Part 2's shape on its own ladder.
    const schema =
      input?.rubric?.id === "multilevel-q8" ? q8ModelOutputSchema : providerOutputSchema((input as EvaluationInput | undefined)?.rubric?.config);
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        // If the primary model declines, the API retries on a fallback model in the same call.
        ...(this.options.serverFallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        thinking: { type: "adaptive" },
        output_config: {
          effort: this.options.effort,
          format: betaZodOutputFormat(schema),
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (error) {
      throw mapAnthropicError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError("evaluation_refused", "Evaluation model declined the request", {
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
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }
}

/** Anthropic keys look like `sk-ant-…`; never let one into an error message that reaches a log. */
const redactKeys = (text: string) => text.replace(/sk-ant-[\w-]+/gi, "[redacted]");

export function mapAnthropicError(error: unknown): ProviderError {
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
  if (error instanceof Anthropic.BadRequestError) {
    // Usually configuration (unknown model, beta not enabled) — retrying won't help.
    return new ProviderError("evaluation_failed", `Anthropic rejected the request: ${redactKeys(error.message)}`, {
      cause: error,
      retryable: false,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError("evaluation_failed", "Network error calling Anthropic", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError("evaluation_failed", `Anthropic API error ${error.status ?? ""}`, { cause: error });
  }
  // Anything else (e.g. the SDK failing to parse the JSON) is an invalid output.
  return new ProviderError("evaluation_invalid_output", "Could not parse evaluation output", { cause: error });
}
