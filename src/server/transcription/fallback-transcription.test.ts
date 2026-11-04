import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/errors";
import { FallbackTranscriptionProvider } from "./fallback-transcription";
import type { TranscriptionProvider } from "./types";

const input = { audio: Buffer.from("x"), mimeType: "audio/webm", language: "en" as const };
const fake = (name: string, impl: TranscriptionProvider["transcribe"]) => ({ name, model: `${name}-1`, transcribe: vi.fn(impl) });

describe("FallbackTranscriptionProvider", () => {
  it("uses the primary provider when it works", async () => {
    const primary = fake("gemini", async () => ({ text: "nobody will helps", language: "en" }));
    const fallback = fake("openai", async () => ({ text: "x", language: "en" }));
    const out = await new FallbackTranscriptionProvider(primary, fallback).transcribe(input);
    expect(out).toEqual({ text: "nobody will helps", language: "en" });
    expect(fallback.transcribe).not.toHaveBeenCalled();
  });

  it("falls back on a provider failure and records which provider produced the text", async () => {
    const primary = fake("gemini", async () => {
      throw new ProviderError("provider_timeout", "slow");
    });
    const fallback = fake("openai", async () => ({ text: "they don't talking", language: "en" }));
    const provider = new FallbackTranscriptionProvider(primary, fallback);
    expect(provider.name).toBe("gemini");
    expect(await provider.transcribe(input)).toEqual({ text: "they don't talking", language: "en", provider: "openai", model: "openai-1" });
  });

  it("never asks a second model when the first one heard no speech", async () => {
    const primary = fake("gemini", async () => {
      throw new ProviderError("transcription_empty", "no speech", { retryable: false });
    });
    const fallback = fake("openai", async () => ({ text: "invented", language: "en" }));
    await expect(new FallbackTranscriptionProvider(primary, fallback).transcribe(input)).rejects.toMatchObject({ failureCode: "transcription_empty" });
    expect(fallback.transcribe).not.toHaveBeenCalled();
  });
});
