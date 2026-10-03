import "server-only";
import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { ProviderError } from "@/server/errors";
import { redactSecrets } from "@/server/evaluation/gemini-evaluation-model";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Verbatim instructions for an audio-understanding model. Learner mistakes and hesitations are the evidence CEFRO
 * assesses, and a language model is inclined to tidy speech up, so the rules say so explicitly and the result is
 * measured (docs/AI_EVALUATION_QUALITY.md), never assumed.
 *
 * Like the OpenAI prompt it contains NO sample utterance: an echoed sample would look like a real short answer.
 * Silence is signalled with a fixed marker instead of letting the model describe or invent something.
 */
export const NO_SPEECH_MARKER = "[[NO_SPEECH]]";

/**
 * The first live run (docs/AI_EVALUATION_QUALITY.md, Stage 2B) showed that with a plain-text reply and a prompt that
 * mentioned an exam, Gemini INVENTED a plausible learner answer for 8 seconds of silence ("Uh my parents gave me uh
 * their support..."). So the reply is structured: the model must first decide `speech_detected`, the prompt says
 * that many recordings contain no speech and that guessing is forbidden, and nothing about the exam is mentioned.
 */
export const GEMINI_TRANSCRIPTION_PROMPT =
  "Transcribe the English speech that is actually audible in this audio recording, exactly as spoken, word for word. " +
  "Many recordings contain no speech at all: only silence, a quiet room, hiss or background noise. " +
  "If you cannot clearly hear a person speaking, set speech_detected to false and transcript to an empty string. " +
  "Never guess, never invent words, and never produce a sentence that is not clearly audible. " +
  "The speaker may be an English learner: keep every grammar mistake, wrong verb form, missing word, wrong word choice, repetition, false start, self-correction and hesitation sound (um, uh, er) exactly as said. " +
  "Do NOT correct, improve, complete, summarise or translate anything, and do not add words that were not spoken. " +
  "In transcript write plain text only: no timestamps, no speaker labels, no notes and no introduction.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    speech_detected: { type: "boolean", description: "true only if a person can clearly be heard speaking" },
    transcript: { type: "string", description: "verbatim words spoken; empty string when speech_detected is false" },
  },
  required: ["speech_detected", "transcript"],
};

/** Gemini accepts audio inline up to about 20 MB of request; base64 adds a third, so stay well under. */
export const MAX_INLINE_AUDIO_BYTES = 14 * 1024 * 1024;

export interface GeminiTranscriptionOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Retries for 408/429/5xx (the SDK handles them). */
  maxRetries?: number;
  /** Test seam: replaces the HTTP client. */
  fetch?: typeof fetch;
}

/** Speech-to-text with a Gemini audio-understanding model, through the same TranscriptionProvider interface as every other provider. */
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(private readonly options: GeminiTranscriptionOptions) {
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

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    if (input.audio.byteLength > MAX_INLINE_AUDIO_BYTES) {
      throw new ProviderError("audio_unsupported", "Recording is too large to send to Gemini inline", { retryable: false });
    }
    const mimeType = input.mimeType.split(";")[0].trim().toLowerCase();

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.options.model,
        contents: [
          {
            role: "user",
            parts: [{ text: GEMINI_TRANSCRIPTION_PROMPT }, { inlineData: { mimeType, data: input.audio.toString("base64") } }],
          },
        ],
        config: { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA },
      });
    } catch (error) {
      throw mapGeminiTranscriptionError(error, this.options.apiKey);
    }

    if (response.promptFeedback?.blockReason) {
      throw new ProviderError("transcription_failed", `Gemini blocked the request (${response.promptFeedback.blockReason})`, { retryable: false });
    }
    const candidate = response.candidates?.[0];
    if (!candidate) throw new ProviderError("transcription_failed", "Gemini returned no candidates");
    if (candidate.finishReason === FinishReason.MAX_TOKENS) {
      throw new ProviderError("transcription_failed", "Gemini transcript was truncated (MAX_TOKENS)");
    }
    if (candidate.finishReason && candidate.finishReason !== FinishReason.STOP) {
      throw new ProviderError("transcription_failed", `Gemini did not finish the transcript (${candidate.finishReason})`);
    }

    const raw = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();

    let parsed: { speech_detected?: unknown; transcript?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (raw === "") throw new ProviderError("transcription_empty", "Gemini reported no intelligible speech", { retryable: false });
      throw new ProviderError("transcription_failed", "Gemini returned a transcript that is not the requested JSON");
    }
    const text = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
    if (parsed.speech_detected === false || text === "" || text.includes(NO_SPEECH_MARKER)) {
      throw new ProviderError("transcription_empty", "Gemini reported no intelligible speech", { retryable: false });
    }
    if (looksLikeInstructionEcho(text)) {
      throw new ProviderError("transcription_empty", "Transcript echoes the transcription instructions (likely silence)", { retryable: false });
    }

    const usage = response.usageMetadata;
    return {
      text,
      language: input.language,
      usage: {
        ...(usage?.promptTokenCount !== undefined ? { input_tokens: usage.promptTokenCount } : {}),
        ...(usage?.candidatesTokenCount !== undefined || usage?.thoughtsTokenCount !== undefined
          ? { output_tokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0) }
          : {}),
        ...(usage?.totalTokenCount !== undefined ? { total_tokens: usage.totalTokenCount } : {}),
      },
    };
  }
}

/** A short "transcript" made almost entirely of words from the instructions is a hallucination on silent audio. */
export function looksLikeInstructionEcho(transcript: string): boolean {
  const words = evidenceTokens(transcript);
  if (words.length < 4 || words.length > 60) return false;
  const promptWords = new Set(evidenceTokens(GEMINI_TRANSCRIPTION_PROMPT));
  return words.filter((w) => promptWords.has(w)).length / words.length >= 0.8;
}

export function mapGeminiTranscriptionError(error: unknown, apiKey: string): ProviderError {
  if (error instanceof ProviderError) return error;
  const detail = redactSecrets(error instanceof Error ? error.message : String(error), apiKey);
  const cause = Object.assign(new Error(detail), { name: error instanceof Error ? error.name : "Error" });

  if (error instanceof ApiError) {
    const { status } = error;
    if (status === 401 || status === 403 || (status === 400 && /api key|permission|not valid/i.test(detail))) {
      return new ProviderError("provider_not_configured", `Gemini rejected the API key or access (${status}): ${detail}`, { cause, retryable: false });
    }
    if (status === 404) {
      return new ProviderError("provider_not_configured", `Gemini model not found (check GEMINI_TRANSCRIPTION_MODEL): ${detail}`, { cause, retryable: false });
    }
    if (status === 429) return new ProviderError("provider_rate_limited", `Gemini rate limit or quota (429): ${detail}`, { cause });
    if (status === 408 || status === 504) return new ProviderError("provider_timeout", `Gemini timed out (${status})`, { cause });
    if (status === 400 || status === 413 || status === 415) {
      // Typically an audio format or size the model does not accept; the same file will not work on retry.
      return new ProviderError("audio_unsupported", `Gemini rejected the audio (${status}): ${detail}`, { cause, retryable: false });
    }
    return new ProviderError("transcription_failed", `Gemini API error (${status}): ${detail}`, { cause });
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out|aborted/i.test(detail)) {
    return new ProviderError("provider_timeout", "Gemini transcription timed out", { cause });
  }
  return new ProviderError("transcription_failed", `Network or SDK error calling Gemini: ${detail}`, { cause });
}
