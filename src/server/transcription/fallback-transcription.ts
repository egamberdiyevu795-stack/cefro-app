import "server-only";
import { ProviderError } from "@/server/errors";
import { logger } from "@/server/logging/logger";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Primary provider with a second one behind it. The fallback runs only when the primary fails with a provider error
 * (timeout, rate limit, outage, misconfiguration). A "no speech" or "unsupported audio" result is an answer about the
 * recording, not a provider failure, so it is returned as is: a second model must not get a chance to invent speech.
 */
const NOT_A_PROVIDER_FAILURE = new Set(["transcription_empty", "audio_unsupported"]);

export class FallbackTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private readonly primary: TranscriptionProvider,
    private readonly fallback: TranscriptionProvider,
  ) {}

  get name(): string {
    return this.primary.name;
  }

  get model(): string {
    return this.primary.model;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    try {
      return await this.primary.transcribe(input);
    } catch (error) {
      if (error instanceof ProviderError && NOT_A_PROVIDER_FAILURE.has(error.failureCode)) throw error;
      logger.warn("Primary transcription failed; trying the fallback provider", {
        primary: this.primary.name,
        fallback: this.fallback.name,
        code: error instanceof ProviderError ? error.failureCode : "unknown",
      });
      const output = await this.fallback.transcribe(input);
      return { ...output, provider: this.fallback.name, model: this.fallback.model };
    }
  }
}
