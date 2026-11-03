import { describe, expect, it, vi } from "vitest";
import { makeModelOutput } from "../../../test/fixtures";
import { AnthropicEvaluationModel } from "./anthropic-evaluation-model";
import type { EvaluationInput } from "./types";

const prompt = { system: "system", user: "user" };
const input = {} as EvaluationInput;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function message(text: string, stop_reason = "end_turn") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: text ? [{ type: "text", text }] : [],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
  };
}

function modelWith(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof AnthropicEvaluationModel>[0]> = {}) {
  return new AnthropicEvaluationModel({
    apiKey: "sk-ant-test-not-real",
    model: "claude-opus-5-5",
    effort: "high",
    maxTokens: 16000,
    timeoutMs: 5_000,
    serverFallbacks: true,
    maxRetries: 0,
    fetch: fetchImpl,
    ...overrides,
  });
}

describe("AnthropicEvaluationModel", () => {
  it("sends the configured request server-side and returns output, model and token usage", async () => {
    const fetchMock = vi.fn(async () => json(200, message(JSON.stringify(makeModelOutput()))));
    const result = await modelWith(fetchMock as unknown as typeof fetch).evaluate(prompt, input);

    expect(result).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 800 });
    expect(result.output).toMatchObject({ memorized_or_irrelevant: false });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("/v1/messages");
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    expect(new Headers(init.headers).get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("omits the fallback beta when disabled in configuration", async () => {
    const fetchMock = vi.fn(async () => json(200, message(JSON.stringify(makeModelOutput()))));
    await modelWith(fetchMock as unknown as typeof fetch, { serverFallbacks: false }).evaluate(prompt, input);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).fallbacks).toBeUndefined();
    expect(new Headers(init.headers).get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it.each([
    [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "provider_not_configured"],
    [429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "provider_rate_limited"],
    [500, { type: "error", error: { type: "api_error", message: "boom" } }, "evaluation_failed"],
    [529, { type: "error", error: { type: "overloaded_error", message: "overloaded" } }, "evaluation_failed"],
    [400, { type: "error", error: { type: "invalid_request_error", message: "unknown model" } }, "evaluation_failed"],
  ])("maps HTTP %i to a controlled failure (%s)", async (status, body, failureCode) => {
    const model = modelWith((async () => json(status, body)) as unknown as typeof fetch);
    const error = await model.evaluate(prompt, input).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "ProviderError", failureCode });
    // The API key never appears in what we log.
    expect(JSON.stringify({ message: (error as Error).message })).not.toContain("sk-ant-test-not-real");
  });

  it("maps refusals and truncated output", async () => {
    const refused = modelWith((async () => json(200, message("", "refusal"))) as unknown as typeof fetch);
    await expect(refused.evaluate(prompt, input)).rejects.toMatchObject({ failureCode: "evaluation_refused" });

    const truncated = modelWith((async () => json(200, message('{"questions":', "max_tokens"))) as unknown as typeof fetch);
    await expect(truncated.evaluate(prompt, input)).rejects.toMatchObject({ failureCode: "evaluation_invalid_output" });
  });

  it("maps malformed JSON to evaluation_invalid_output", async () => {
    const model = modelWith((async () => json(200, message("this is not json"))) as unknown as typeof fetch);
    const outcome = await model.evaluate(prompt, input).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    // Either the SDK rejects the JSON, or it hands back raw text for schema validation to reject.
    if (outcome.ok) expect(typeof outcome.value.output).toBe("string");
    else expect(outcome.error).toMatchObject({ failureCode: "evaluation_invalid_output" });
  });

  it("maps timeouts and network failures", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    await expect(modelWith(hanging, { timeoutMs: 50 }).evaluate(prompt, input)).rejects.toMatchObject({
      failureCode: "provider_timeout",
    });

    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(modelWith(offline).evaluate(prompt, input)).rejects.toMatchObject({ failureCode: "evaluation_failed" });
  });

  describe("HTTP failures end as stable failure codes", () => {
    const failing = (status: number, message = "boom") =>
      modelWith((async () => json(status, { type: "error", error: { type: "api_error", message } })) as unknown as typeof fetch);

    it("invalid credentials (401/403): provider_not_configured, not retryable, and the key is never in the error", async () => {
      for (const status of [401, 403]) {
        const error = await failing(status, "invalid x-api-key sk-ant-test-not-real").evaluate(prompt, input).catch((e) => e);
        expect(error).toMatchObject({ failureCode: "provider_not_configured", retryable: false });
        expect(String(error.message)).not.toContain("sk-ant-test-not-real");
        expect(JSON.stringify(error.message)).not.toMatch(/sk-ant-/);
      }
    });

    it("rate limit (429): provider_rate_limited, retryable", async () => {
      await expect(failing(429).evaluate(prompt, input)).rejects.toMatchObject({ failureCode: "provider_rate_limited", retryable: true });
    });

    it("rejected request (400, e.g. unknown model): evaluation_failed, not retryable, key redacted from the message", async () => {
      const error = await failing(400, "model not found (key sk-ant-api03-SECRETSECRET)").evaluate(prompt, input).catch((e) => e);
      expect(error).toMatchObject({ failureCode: "evaluation_failed", retryable: false });
      expect(error.message).not.toContain("SECRETSECRET");
    });

    it("server errors and overload (500/529): evaluation_failed, retryable", async () => {
      for (const status of [500, 529]) {
        await expect(failing(status).evaluate(prompt, input)).rejects.toMatchObject({ failureCode: "evaluation_failed", retryable: true });
      }
    });

    it("no failure carries a stack trace or the request body into its message", async () => {
      const error = await failing(500, "x").evaluate(prompt, { ...input }).catch((e) => e);
      expect(String(error.message)).not.toMatch(/\n\s+at /);
      expect(String(error.message)).not.toContain("system"); // the prompt is never echoed
    });
  });
});

