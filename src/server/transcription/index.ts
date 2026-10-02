import "server-only";
import { getEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";
import { MockTranscriptionProvider } from "./mock-transcription";
import { OpenAITranscriptionProvider } from "./openai-transcription";
import type { TranscriptionProvider } from "./types";

let override: TranscriptionProvider | undefined;

/** Resolve the configured provider. Throws ProviderError if it is misconfigured. */
export function getTranscriptionProvider(): TranscriptionProvider {
  if (override) return override;
  const env = getEnv();
  switch (env.TRANSCRIPTION_PROVIDER) {
    case "mock":
      if (env.NODE_ENV === "production") {
        throw new ProviderError("provider_not_configured", "Mock transcription is disabled in production", {
          retryable: false,
        });
      }
      return new MockTranscriptionProvider();
    case "openai":
      if (!env.OPENAI_API_KEY) {
        throw new ProviderError("provider_not_configured", "OPENAI_API_KEY is not set", { retryable: false });
      }
      return new OpenAITranscriptionProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_TRANSCRIPTION_MODEL,
        baseUrl: env.OPENAI_BASE_URL,
        timeoutMs: env.TRANSCRIPTION_TIMEOUT_MS,
      });
  }
}

export function setTranscriptionProviderForTesting(provider: TranscriptionProvider | undefined) {
  override = provider;
}

export type { TranscriptionProvider } from "./types";
