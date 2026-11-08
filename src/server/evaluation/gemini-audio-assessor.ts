import "server-only";
import { FinishReason, GoogleGenAI } from "@google/genai";
import { audioAssessmentSchemaFor } from "@/domain/evaluation/multilevel/model-output";
import type { LevelLadder } from "@/domain/evaluation/multilevel/levels";
import { ProviderError } from "@/server/errors";
import { MAX_INLINE_AUDIO_BYTES } from "@/server/transcription/gemini-transcription";
import { mapGeminiError } from "./gemini-evaluation-model";
import { toGeminiJsonSchema } from "./gemini-json-schema";
import type { AudioAssessor, ModelEvaluationOutput } from "./types";

export interface GeminiAudioAssessorOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries?: number;
  /** Test seam: replaces the HTTP client. */
  fetch?: typeof fetch;
}

/**
 * Listens to the recording and judges pronunciation (intelligibility, listener strain) and pausing. The raw JSON text
 * is returned; validation and evidence checks are shared code in audio-assessment.ts.
 */
export class GeminiAudioAssessor implements AudioAssessor {
  readonly provider = "gemini";
  private readonly client: GoogleGenAI;
  private readonly schemas = new Map<string, ReturnType<typeof toGeminiJsonSchema>>();
  private responseSchemaFor(levels?: LevelLadder) {
    const key = levels?.join() ?? "default";
    let schema = this.schemas.get(key);
    if (!schema) {
      schema = toGeminiJsonSchema(audioAssessmentSchemaFor(levels));
      this.schemas.set(key, schema);
    }
    return schema;
  }

  constructor(private readonly options: GeminiAudioAssessorOptions) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        timeout: options.timeoutMs,
        retryOptions: { attempts: (options.maxRetries ?? 1) + 1 },
        ...(options.fetch ? { fetch: options.fetch } : {}),
      },
    });
  }

  get model(): string {
    return this.options.model;
  }

  async assess(request: { prompt: string; audio: Buffer; mimeType: string; levels?: LevelLadder }): Promise<ModelEvaluationOutput> {
    if (request.audio.byteLength > MAX_INLINE_AUDIO_BYTES) {
      throw new ProviderError("audio_unsupported", "Recording is too large to send to Gemini inline", { retryable: false });
    }
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [
          {
            role: "user",
            parts: [
              { text: request.prompt },
              { inlineData: { mimeType: request.mimeType.split(";")[0].trim().toLowerCase(), data: request.audio.toString("base64") } },
            ],
          },
        ],
        config: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json", responseJsonSchema: this.responseSchemaFor(request.levels) },
      });
    } catch (error) {
      throw mapGeminiError(error, this.options.apiKey);
    }
    const candidate = response.candidates?.[0];
    if (!candidate) throw new ProviderError("evaluation_invalid_output", "Gemini returned no candidates for the audio assessment");
    if (candidate.finishReason && candidate.finishReason !== FinishReason.STOP) {
      throw new ProviderError("evaluation_invalid_output", `Gemini did not finish the audio assessment (${candidate.finishReason})`);
    }
    const text = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    const usage = response.usageMetadata;
    return {
      output: text,
      provider: this.provider,
      model: response.modelVersion ?? this.options.model,
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens:
        usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
          ? null
          : (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    };
  }
}
