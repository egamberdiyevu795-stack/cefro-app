import "server-only";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { ProviderError } from "@/server/errors";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Learners' mistakes and hesitations are the evidence we assess, so we ask
 * for a verbatim transcript instead of a cleaned-up one. The wording names the
 * error types models tend to "fix" (a live run turned a learner's "nobody will
 * helps" into "nobody helps"); test/live has a regression sample for exactly that
 * (T12-verbatim-regression, npm run eval:transcription:controlled).
 *
 * The prompt deliberately contains NO sample utterance: speech-to-text
 * models can echo prompt text when the audio is silent, and an echoed
 * sample sentence would look like a real (short) answer.
 */
export const VERBATIM_TRANSCRIPTION_PROMPT =
  "Verbatim, disfluent transcript of an English learner answering a speaking exam question. " +
  "Write exactly what the speaker says, word for word, even when it is ungrammatical. " +
  "Keep every grammar mistake as spoken: wrong verb forms, wrong agreement, an extra or missing -s, -ing or -ed ending, " +
  "a wrong or extra auxiliary verb, missing words and wrong word choices. " +
  "Keep repetitions, false starts, self-corrections and hesitation sounds such as um, uh and er. " +
  "Never correct, normalise, tidy or complete the speech, and do not add words that were not spoken.";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

export interface OpenAITranscriptionOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Test seam: replaces the HTTP client. */
  fetch?: typeof fetch;
}

/** OpenAI speech-to-text via the REST API (no SDK dependency needed for one endpoint). */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAITranscriptionOptions) {}

  get model(): string {
    return this.options.model;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    const baseMime = input.mimeType.split(";")[0].trim();
    const extension = EXTENSION_BY_MIME[baseMime] ?? "webm";

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(input.audio)], { type: baseMime }), `recording.${extension}`);
    form.append("model", this.options.model);
    form.append("language", input.language);
    form.append("response_format", "json");
    form.append("temperature", "0");
    form.append("prompt", VERBATIM_TRANSCRIPTION_PROMPT);

    const doFetch = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${this.options.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ProviderError("provider_timeout", "OpenAI transcription timed out", { cause: error });
      }
      throw new ProviderError("transcription_failed", "Network error calling OpenAI transcription", { cause: error });
    }

    if (!response.ok) {
      // The error body never contains our key, but keep only a short excerpt in logs.
      const body = await response.text().catch(() => "");
      const detail = `OpenAI transcription HTTP ${response.status}: ${body.slice(0, 300)}`;
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("provider_not_configured", detail, { retryable: false });
      }
      if (response.status === 429) throw new ProviderError("provider_rate_limited", detail);
      if (response.status === 400 || response.status === 413 || response.status === 415) {
        // Corrupt, unsupported or too-large audio: retrying the same file won't help.
        throw new ProviderError("audio_unsupported", detail, { retryable: false });
      }
      throw new ProviderError("transcription_failed", detail);
    }

    const payload: unknown = await response.json().catch(() => null);
    const text =
      payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string"
        ? payload.text.trim()
        : null;
    if (text === null) {
      throw new ProviderError("transcription_failed", "OpenAI transcription returned an unexpected payload");
    }
    if (looksLikePromptEcho(text, VERBATIM_TRANSCRIPTION_PROMPT)) {
      throw new ProviderError("transcription_empty", "Transcript echoes the transcription prompt (likely silence)", {
        retryable: false,
      });
    }
    return { text, language: input.language, ...usageOf(payload) };
  }
}

/** Keep only flat numeric/string usage fields (e.g. input_tokens, output_tokens, seconds) from the response. */
function usageOf(payload: unknown): { usage?: Record<string, number | string> } {
  const raw = payload && typeof payload === "object" && "usage" in payload ? (payload as { usage: unknown }).usage : null;
  if (!raw || typeof raw !== "object") return {};
  const usage: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" || (typeof value === "string" && value.length <= 40)) usage[key] = value;
  }
  return Object.keys(usage).length > 0 ? { usage } : {};
}

/**
 * True when a (short) transcript consists almost entirely of words from the
 * prompt — the typical hallucination on silent or near-silent audio.
 */
export function looksLikePromptEcho(transcript: string, prompt: string): boolean {
  const words = evidenceTokens(transcript);
  if (words.length === 0 || words.length > 40) return false;
  const promptWords = new Set(evidenceTokens(prompt));
  const fromPrompt = words.filter((word) => promptWords.has(word)).length;
  return words.length >= 4 && fromPrompt / words.length >= 0.8;
}
