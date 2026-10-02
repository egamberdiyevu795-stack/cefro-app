import "server-only";
import { ProviderError } from "@/server/errors";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Learners' mistakes and hesitations are exactly what we need to assess,
 * so ask for a verbatim transcript instead of a cleaned-up one.
 */
const VERBATIM_PROMPT =
  "The speaker is an English learner answering a speaking exam question. " +
  "Transcribe verbatim: keep grammatical mistakes, repetitions, self-corrections " +
  "and hesitations such as um, uh, er. Do not correct or paraphrase. " +
  "Umm, so I think, uh, I think that...";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

/** OpenAI speech-to-text via the REST API (no SDK dependency needed for one endpoint). */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl: string;
      timeoutMs: number;
    },
  ) {}

  get model(): string {
    return this.options.model;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    const baseMime = input.mimeType.split(";")[0].trim();
    const extension = EXTENSION_BY_MIME[baseMime] ?? "webm";

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.audio)], { type: baseMime }),
      `recording.${extension}`,
    );
    form.append("model", this.options.model);
    form.append("language", input.language);
    form.append("response_format", "json");
    form.append("prompt", VERBATIM_PROMPT);

    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ProviderError("provider_timeout", "OpenAI transcription timed out", { cause: error });
      }
      throw new ProviderError("transcription_failed", "Network error calling OpenAI transcription", {
        cause: error,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const detail = `OpenAI transcription HTTP ${response.status}: ${body.slice(0, 500)}`;
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("provider_not_configured", detail, { retryable: false });
      }
      if (response.status === 429) throw new ProviderError("provider_rate_limited", detail);
      throw new ProviderError("transcription_failed", detail);
    }

    const payload: unknown = await response.json().catch(() => null);
    const text =
      payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string"
        ? payload.text
        : null;
    if (text === null) {
      throw new ProviderError("transcription_failed", "OpenAI transcription returned an unexpected payload");
    }
    return { text: text.trim(), language: input.language };
  }
}
