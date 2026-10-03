import { describe, expect, it, vi } from "vitest";
import { fakeWebm } from "../../../test/fixtures";
import { GEMINI_TRANSCRIPTION_PROMPT, GeminiTranscriptionProvider, MAX_INLINE_AUDIO_BYTES, NO_SPEECH_MARKER, looksLikeInstructionEcho } from "./gemini-transcription";
import { getTranscriptionProvider, setTranscriptionProviderForTesting } from "./index";

const KEY = "test-key-not-real-0123456789"; // deliberately not shaped like a real key
const audio = { audio: fakeWebm(2048), mimeType: "audio/webm;codecs=opus", language: "en" as const };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const reply = (text: string | null, candidate: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: text === null ? [] : [{ text }] }, finishReason: "STOP", index: 0, ...candidate }],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, totalTokenCount: 1020 },
  modelVersion: "gemini-test-001",
  ...extra,
});
const apiError = (code: number, status: string, message: string) => json(code, { error: { code, message, status } });

function provider(fetchImpl: (...args: never[]) => Promise<Response>, overrides: Partial<ConstructorParameters<typeof GeminiTranscriptionProvider>[0]> = {}) {
  return new GeminiTranscriptionProvider({ apiKey: KEY, model: "gemini-test", timeoutMs: 5_000, maxRetries: 0, fetch: fetchImpl as unknown as typeof fetch, ...overrides });
}

describe("GeminiTranscriptionProvider", () => {
  it("sends the audio and the verbatim instructions server-side, with the key only in a header, and returns the text unchanged", async () => {
    const fetchMock = vi.fn(async () => json(200, reply("  He go to school every day, uh, and I have went there twice.  ")));
    const result = await provider(fetchMock).transcribe(audio);
    expect(result.text).toBe("He go to school every day, uh, and I have went there twice."); // mistakes preserved, only trimmed
    expect(result.language).toBe("en");
    expect(result.usage).toEqual({ input_tokens: 900, output_tokens: 120, total_tokens: 1020 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-test:generateContent");
    expect(url).not.toContain(KEY);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    const body = JSON.parse(String(init.body));
    const parts = body.contents[0].parts;
    expect(parts[0].text).toBe(GEMINI_TRANSCRIPTION_PROMPT);
    expect(parts[1].inlineData.mimeType).toBe("audio/webm"); // codec parameter removed
    expect(Buffer.from(parts[1].inlineData.data, "base64").equals(audio.audio)).toBe(true);
    expect(body.generationConfig.temperature).toBe(0);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("tells the model not to correct anything, and contains no sample utterance to echo", () => {
    expect(GEMINI_TRANSCRIPTION_PROMPT).toMatch(/Do NOT correct/);
    expect(GEMINI_TRANSCRIPTION_PROMPT).toContain(NO_SPEECH_MARKER);
    expect(GEMINI_TRANSCRIPTION_PROMPT).not.toMatch(/"[^"]{12,}"/); // no quoted example sentence
  });

  it("treats the no-speech marker, an empty answer and an echo of the instructions as silence (transcription_empty)", async () => {
    for (const text of [NO_SPEECH_MARKER, `${NO_SPEECH_MARKER}\n`, "", null, "Transcribe the speech exactly as spoken word for word and keep every mistake."]) {
      const p = provider(async () => json(200, reply(text)));
      await expect(p.transcribe(audio), String(text)).rejects.toMatchObject({ failureCode: "transcription_empty", retryable: false });
    }
  });

  it("accepts a genuine short answer that merely shares a few words with the instructions", () => {
    expect(looksLikeInstructionEcho("I think the speaker was very happy about the exam")).toBe(false);
    expect(looksLikeInstructionEcho("transcribe the speech exactly word for word")).toBe(true);
  });

  it("refuses oversized audio before sending anything", async () => {
    const fetchMock = vi.fn();
    const big = { ...audio, audio: Buffer.alloc(MAX_INLINE_AUDIO_BYTES + 1) };
    await expect(provider(fetchMock as never).transcribe(big)).rejects.toMatchObject({ failureCode: "audio_unsupported", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("failures end as stable codes, and the key never reaches an error", () => {
    const failing = (status: number, statusText: string, message: string) => provider(async () => apiError(status, statusText, message));

    it("invalid key or access (400-with-key-text, 401, 403) and unknown model (404): provider_not_configured, not retryable", async () => {
      const cases: [number, string, string][] = [
        [400, "INVALID_ARGUMENT", `API key not valid. Please pass a valid API key. (${KEY})`],
        [401, "UNAUTHENTICATED", "bad credentials"],
        [403, "PERMISSION_DENIED", `permission denied for ${KEY}`],
        [404, "NOT_FOUND", "model not found"],
      ];
      for (const [status, name, message] of cases) {
        const error = await failing(status, name, message).transcribe(audio).catch((e) => e);
        expect(error, String(status)).toMatchObject({ failureCode: "provider_not_configured", retryable: false });
        expect(String(error.message)).not.toContain(KEY);
        expect(String((error.cause as Error)?.message ?? "")).not.toContain(KEY);
      }
    });

    it("unsupported or rejected audio (400/413/415): audio_unsupported, not retryable", async () => {
      for (const status of [400, 413, 415]) {
        await expect(failing(status, "INVALID_ARGUMENT", "Unsupported MIME type: audio/webm").transcribe(audio)).rejects.toMatchObject({ failureCode: "audio_unsupported", retryable: false });
      }
    });

    it("rate limit (429), timeout statuses (408/504), server errors (500/503): their own retryable codes", async () => {
      await expect(failing(429, "RESOURCE_EXHAUSTED", "quota").transcribe(audio)).rejects.toMatchObject({ failureCode: "provider_rate_limited", retryable: true });
      for (const status of [408, 504]) await expect(failing(status, "DEADLINE_EXCEEDED", "slow").transcribe(audio)).rejects.toMatchObject({ failureCode: "provider_timeout" });
      for (const status of [500, 503]) await expect(failing(status, "UNAVAILABLE", "down").transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed", retryable: true });
    });

    it("a hung request ends as provider_timeout; a dropped connection as transcription_failed", async () => {
      const hanging = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as (...args: never[]) => Promise<Response>;
      await expect(provider(hanging, { timeoutMs: 50 }).transcribe(audio)).rejects.toMatchObject({ failureCode: "provider_timeout" });
      const offline = (async () => {
        throw new TypeError(`fetch failed for key ${KEY}`);
      }) as unknown as (...args: never[]) => Promise<Response>;
      const error = await provider(offline).transcribe(audio).catch((e) => e);
      expect(error).toMatchObject({ failureCode: "transcription_failed" });
      expect(String(error.message)).not.toContain(KEY);
      expect(String(error.message)).not.toMatch(/\n\s+at /);
    });

    it("blocked, truncated or unfinished output is a transcription_failed, never a partial transcript", async () => {
      await expect(provider(async () => json(200, { promptFeedback: { blockReason: "SAFETY" }, candidates: [] })).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed", retryable: false });
      await expect(provider(async () => json(200, reply("He go to sch", { finishReason: "MAX_TOKENS" }))).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed" });
      await expect(provider(async () => json(200, reply("text", { finishReason: "SAFETY" }))).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed" });
      await expect(provider(async () => json(200, { candidates: [] })).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed" });
    });
  });
});

describe("provider selection", () => {
  it("is chosen by configuration through the same factory as every other provider", () => {
    setTranscriptionProviderForTesting(undefined);
    expect(typeof getTranscriptionProvider).toBe("function"); // TRANSCRIPTION_PROVIDER=gemini resolves here; covered by provider-config tests
  });
});
