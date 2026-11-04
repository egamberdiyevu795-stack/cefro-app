import "server-only";
import { getEnv, type ServerEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";
import { FallbackTranscriptionProvider } from "./fallback-transcription";
import { GeminiTranscriptionProvider } from "./gemini-transcription";
import { MockTranscriptionProvider } from "./mock-transcription";
import { OpenAITranscriptionProvider } from "./openai-transcription";
import type { TranscriptionProvider } from "./types";

let override: TranscriptionProvider | undefined;

/** Resolve the configured provider (with its fallback, if one is set). Throws ProviderError if it is misconfigured. */
export function getTranscriptionProvider(): TranscriptionProvider {
  if (override) return override;
  const env = getEnv();
  const primary = buildProvider(env.TRANSCRIPTION_PROVIDER, env);
  if (env.TRANSCRIPTION_FALLBACK_PROVIDER === "none" || env.TRANSCRIPTION_FALLBACK_PROVIDER === env.TRANSCRIPTION_PROVIDER) return primary;
  return new FallbackTranscriptionProvider(primary, buildProvider(env.TRANSCRIPTION_FALLBACK_PROVIDER, env));
}

function buildProvider(kind: ServerEnv["TRANSCRIPTION_PROVIDER"], env: ServerEnv): TranscriptionProvider {
  switch (kind) {
    case "mock":
      if (env.NODE_ENV === "production") {
        throw new ProviderError("provider_not_configured", "Mock transcription is disabled in production", {
          retryable: false,
        });
      }
      return new MockTranscriptionProvider();
    case "gemini":
      if (!env.GEMINI_API_KEY) {
        throw new ProviderError("provider_not_configured", "GEMINI_API_KEY is not set", { retryable: false });
      }
      return new GeminiTranscriptionProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_TRANSCRIPTION_MODEL,
        timeoutMs: env.TRANSCRIPTION_TIMEOUT_MS,
      });
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
