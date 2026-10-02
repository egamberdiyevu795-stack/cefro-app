import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { evaluationResultSchema } from "@/domain/evaluation/schema";
import { ProviderError } from "@/server/errors";
import { toGeminiJsonSchema } from "./gemini-json-schema";
import type { EvaluationInput, EvaluationModel, EvaluationPrompt, ModelEvaluationOutput } from "./types";

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";
export type GeminiStructuredOutputMode = "schema" | "json";

export interface GeminiEvaluationOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** Unset = the model's default. Only valid for models that support thinking levels. */
  thinkingLevel?: GeminiThinkingLevel;
  structuredOutput: GeminiStructuredOutputMode;
  timeoutMs: number;
  /** Retries for 408/429/5xx (the SDK handles them). */
  maxRetries?: number;
  /** Test seam: replaces the HTTP client. */
  fetch?: typeof fetch;
}

const THINKING_LEVELS: Record<GeminiThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** The model declined to answer for safety/policy reasons. */
const REFUSAL_FINISH_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

/**
 * Gemini-backed evaluation model (official `@google/genai` SDK).
 *
 * It receives exactly the prompt the other providers get. The only additions
 * are plumbing: the JSON schema (sent to the API as `responseJsonSchema` and
 * repeated in the system instruction, which also makes the "json" fallback
 * mode work) and the JSON mime type. The raw text is returned as-is: parsing,
 * Zod validation, the quality gate and regeneration are shared, provider-
 * independent code in `speaking-evaluator.ts`. API-side schema enforcement is
 * a convenience and is never trusted.
 */
export class GeminiEvaluationModel implements EvaluationModel {
  readonly provider = "gemini";
  readonly isDevelopmentProvider = false;
  readonly config: Record<string, string | number | boolean>;
  private readonly client: GoogleGenAI;
  private readonly responseSchema = toGeminiJsonSchema(evaluationResultSchema);

  constructor(private readonly options: GeminiEvaluationOptions) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        timeout: options.timeoutMs,
        retryOptions: { attempts: (options.maxRetries ?? 2) + 1 },
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    });
    this.config = {
      maxTokens: options.maxTokens,
      structuredOutput: options.structuredOutput,
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    };
  }

  get model(): string {
    return this.options.model;
  }

  async evaluate(prompt: EvaluationPrompt, _input: EvaluationInput): Promise<ModelEvaluationOutput> {
    void _input; // transcript-only evaluation: the prompt already contains everything needed.

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.options.model,
        contents: prompt.user,
        config: {
          systemInstruction: `${prompt.system}\n\n${this.outputFormatInstruction()}`,
          maxOutputTokens: this.options.maxTokens,
          responseMimeType: "application/json",
          ...(this.options.structuredOutput === "schema" ? { responseJsonSchema: this.responseSchema } : {}),
          ...(this.options.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.options.thinkingLevel] } }
            : {}),
        },
      });
    } catch (error) {
      throw mapGeminiError(error, this.options.apiKey);
    }

    if (response.promptFeedback?.blockReason) {
      throw new ProviderError("evaluation_refused", `Gemini blocked the request (${response.promptFeedback.blockReason})`);
    }
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new ProviderError("evaluation_invalid_output", "Gemini returned no candidates");
    }
    if (candidate.finishReason && REFUSAL_FINISH_REASONS.has(candidate.finishReason)) {
      throw new ProviderError("evaluation_refused", `Gemini declined to answer (${candidate.finishReason})`);
    }
    if (candidate.finishReason === FinishReason.MAX_TOKENS) {
      throw new ProviderError("evaluation_invalid_output", "Gemini output was truncated (MAX_TOKENS)");
    }

    // Answer text only: parts flagged as "thought" are the model's reasoning summary.
    const text = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    if (!text) {
      throw new ProviderError(
        "evaluation_invalid_output",
        `Gemini returned an empty response${candidate.finishReason ? ` (${candidate.finishReason})` : ""}`,
      );
    }

    const usage = response.usageMetadata;
    // Reasoning tokens are billed as output, so they are included. Absent metadata stays null.
    const outputTokens =
      usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
        ? null
        : (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);

    return {
      output: text, // raw text: parsing and validation happen in the shared evaluator
      provider: this.provider,
      model: response.modelVersion ?? this.options.model,
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens,
    };
  }

  private outputFormatInstruction(): string {
    return `# Output format
Respond with ONLY a JSON object (no markdown, no code fences, no text before or after) that matches this JSON Schema exactly. Include every property, and use null where the schema allows it and nothing applies.
${JSON.stringify(this.responseSchema)}`;
  }
}

/**
 * Translate SDK/network failures into controlled ProviderErrors. Messages are
 * for logs only (students see friendly copy), and are scrubbed of the API key.
 */
export function mapGeminiError(error: unknown, apiKey: string): ProviderError {
  if (error instanceof ProviderError) return error;
  const detail = redactSecrets(error instanceof Error ? error.message : String(error), apiKey);
  const cause = Object.assign(new Error(detail), { name: error instanceof Error ? error.name : "Error" });

  if (error instanceof ApiError) {
    const { status } = error;
    if (status === 401 || status === 403 || (status === 400 && /api key|permission|not valid/i.test(detail))) {
      return new ProviderError("provider_not_configured", `Gemini rejected the API key or access (${status}): ${detail}`, {
        cause,
        retryable: false,
      });
    }
    if (status === 404) {
      return new ProviderError("provider_not_configured", `Gemini model not found (check GEMINI_EVALUATION_MODEL): ${detail}`, {
        cause,
        retryable: false,
      });
    }
    if (status === 429) return new ProviderError("provider_rate_limited", `Gemini rate limit or quota (429): ${detail}`, { cause });
    if (status === 408 || status === 504) return new ProviderError("provider_timeout", `Gemini timed out (${status})`, { cause });
    if (status === 400) {
      const hint = /schema|constraint|too many states|nesting/i.test(detail) ? " (try GEMINI_STRUCTURED_OUTPUT=json)" : "";
      return new ProviderError("evaluation_failed", `Gemini rejected the request (400)${hint}: ${detail}`, { cause, retryable: false });
    }
    return new ProviderError("evaluation_failed", `Gemini API error (${status}): ${detail}`, { cause });
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out|aborted/i.test(detail)) {
    return new ProviderError("provider_timeout", "Gemini request timed out", { cause });
  }
  return new ProviderError("evaluation_failed", `Network or SDK error calling Gemini: ${detail}`, { cause });
}

/** Remove the API key (and anything shaped like a Google API key) from text destined for logs. */
export function redactSecrets(text: string, apiKey: string): string {
  let out = apiKey.length >= 8 ? text.split(apiKey).join("[redacted]") : text;
  out = out.replace(/AIza[0-9A-Za-z_-]{30,}/g, "[redacted]");
  return out;
}
