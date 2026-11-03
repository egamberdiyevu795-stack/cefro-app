import { describe, expect, it, vi } from "vitest";
import { fakeWebm } from "../../../test/fixtures";
import { OpenAITranscriptionProvider, VERBATIM_TRANSCRIPTION_PROMPT, looksLikePromptEcho } from "./openai-transcription";

function provider(fetchImpl: typeof fetch, timeoutMs = 5_000) {
  return new OpenAITranscriptionProvider({
    apiKey: "sk-test-not-real",
    model: "gpt-4o-transcribe",
    baseUrl: "https://api.openai.test/v1",
    timeoutMs,
    fetch: fetchImpl,
  });
}
const audio = { audio: fakeWebm(), mimeType: "audio/webm;codecs=opus", language: "en" as const };

describe("OpenAITranscriptionProvider", () => {
  it("requests a verbatim transcript and returns the text unchanged (errors preserved)", async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: "  He go to school every day.  " }));
    const result = await provider(fetchMock as unknown as typeof fetch).transcribe(audio);
    expect(result.text).toBe("He go to school every day.");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.test/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-transcribe");
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe(VERBATIM_TRANSCRIPTION_PROMPT);
    expect((form.get("file") as File).name).toBe("recording.webm");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test-not-real");
  });

  it("asks for a verbatim, disfluent transcript and never alters a learner's agreement error", async () => {
    // Regression: "nobody will helps" once came back as "nobody helps".
    expect(VERBATIM_TRANSCRIPTION_PROMPT).toMatch(/verbatim, disfluent/i);
    expect(VERBATIM_TRANSCRIPTION_PROMPT).toMatch(/extra or missing -s, -ing or -ed ending/);
    expect(VERBATIM_TRANSCRIPTION_PROMPT).toMatch(/Never correct, normalise/);
    // No sample utterance (it could be echoed on silent audio).
    expect(VERBATIM_TRANSCRIPTION_PROMPT).not.toMatch(/nobody|helps|talking/i);
    const spoken = "When you have a problem, nobody will helps you, because they don't talking.";
    const result = await provider((async () => Response.json({ text: spoken })) as unknown as typeof fetch).transcribe(audio);
    expect(result.text).toBe(spoken);
  });

  it.each([
    [401, "provider_not_configured"],
    [429, "provider_rate_limited"],
    [400, "audio_unsupported"],
    [413, "audio_unsupported"],
    [500, "transcription_failed"],
  ])("maps HTTP %i to %s", async (status, failureCode) => {
    const p = provider((async () => new Response('{"error":{"message":"x"}}', { status })) as unknown as typeof fetch);
    await expect(p.transcribe(audio)).rejects.toMatchObject({ failureCode });
  });

  it("maps timeouts, network failures and unexpected payloads", async () => {
    const hanging = ((_u: string, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    await expect(provider(hanging, 30).transcribe(audio)).rejects.toMatchObject({ failureCode: "provider_timeout" });

    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(provider(offline).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed" });

    const weird = (async () => Response.json({ nope: true })) as unknown as typeof fetch;
    await expect(provider(weird).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_failed" });
  });

  it("treats a transcript that echoes the prompt (silent audio) as empty", async () => {
    const echo = (async () => Response.json({ text: "Verbatim transcript of an English learner answering a speaking exam question." })) as unknown as typeof fetch;
    await expect(provider(echo).transcribe(audio)).rejects.toMatchObject({ failureCode: "transcription_empty" });
  });
});

describe("looksLikePromptEcho", () => {
  it("flags prompt fragments but not real answers", () => {
    expect(looksLikePromptEcho("Keep grammar mistakes and hesitation sounds.", VERBATIM_TRANSCRIPTION_PROMPT)).toBe(true);
    expect(looksLikePromptEcho("I think phones are useful for students.", VERBATIM_TRANSCRIPTION_PROMPT)).toBe(false);
    expect(looksLikePromptEcho("Um, I think, uh, yes.", VERBATIM_TRANSCRIPTION_PROMPT)).toBe(false);
  });
});

describe("OpenAITranscriptionProvider usage metadata", () => {
  it("returns the usage the provider reported, flat fields only", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        text: "I think phones are useful",
        usage: { type: "tokens", input_tokens: 120, output_tokens: 8, total_tokens: 128, input_token_details: { audio_tokens: 120 } },
      }),
    );
    const result = await provider(fetchMock as unknown as typeof fetch).transcribe(audio);
    expect(result.usage).toEqual({ type: "tokens", input_tokens: 120, output_tokens: 8, total_tokens: 128 }); // nested objects dropped
  });

  it("omits usage when the provider reports none or something unexpected", async () => {
    for (const payload of [{ text: "hello there my friend again" }, { text: "hello there my friend again", usage: "x" }, { text: "hello there my friend again", usage: {} }]) {
      const result = await provider((async () => Response.json(payload)) as unknown as typeof fetch).transcribe(audio);
      expect(result).not.toHaveProperty("usage");
    }
  });
});
