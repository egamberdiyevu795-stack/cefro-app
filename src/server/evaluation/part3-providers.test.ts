import { describe, expect, it, vi } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { PART3_ANCHORS } from "../../../test/evaluation-samples/part3-anchors";
import { makeModelOutput } from "../../../test/fixtures";
import { AnthropicEvaluationModel } from "./anthropic-evaluation-model";
import { evaluateArgument } from "./argument-evaluator";
import type { ArgumentEvaluationInput } from "./argument-types";
import { GeminiEvaluationModel } from "./gemini-evaluation-model";
import { getSpeakingTask } from "@/content/speaking";
import { buildMockArgument } from "./mock-argument-model";
import { getArgumentRubric } from "./rubrics/q8";
import { getSpeakingRubric } from "./rubrics";
import type { EvaluationInput } from "./types";

/*
 * The real providers are wired for Part 3 (docs/part3-plan.md, "what the plan says and this branch does not do yet",
 * item 6): given a Part 3 input they ask for the Part 3 output schema, and their reply goes through the whole Part 3
 * evaluation. Only a fake HTTP client is used: no model is ever called.
 */

const anchor = PART3_ANCHORS.find((a) => a.id === "cars-A4")!;
const task = getArgumentTask(anchor.taskId)!;
const input: ArgumentEvaluationInput = {
  task,
  rubric: getArgumentRubric(task),
  transcript: anchor.transcript,
  metrics: computeSpeechMetrics(anchor.transcript, 110_000, 120),
  chosenPoints: ["F1", "F2", "A1", "A2"],
  audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: 110_000 },
  previousAttempt: null,
};
const reply = () => JSON.stringify(buildMockArgument(input));
const prompt = { system: "SYSTEM RULES", user: "USER DATA" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Gemini with a Part 3 input", () => {
  const model = (fetchImpl: unknown) =>
    new GeminiEvaluationModel({ apiKey: "test-key-not-real-0123456789", model: "gemini-test", maxTokens: 24000, structuredOutput: "schema", timeoutMs: 5000, maxRetries: 0, fetch: fetchImpl as typeof fetch });
  const gemini = (text: string) => ({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 700 },
    modelVersion: "gemini-test-001",
  });

  it("asks for the Part 3 schema (points, prompt dependence), not Part 2's", async () => {
    const fetchMock = vi.fn(async () => json(200, gemini(reply())));
    await model(fetchMock).evaluate(prompt, input);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const system: string = JSON.parse(String(init.body)).systemInstruction.parts[0].text;
    expect(system).toContain('"prompt_dependence"');
    expect(system).toContain('"points"');
    expect(system).not.toContain('"questions"');
  });

  it("still asks for Part 2's schema for a Part 2 input", async () => {
    const fetchMock = vi.fn(async () => json(200, gemini(JSON.stringify(makeModelOutput()))));
    const part2 = getSpeakingTask("b2-part2-advice-from-someone")!;
    await model(fetchMock).evaluate(prompt, { task: part2, rubric: getSpeakingRubric(part2) } as unknown as EvaluationInput);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const system: string = JSON.parse(String(init.body)).systemInstruction.parts[0].text;
    expect(system).toContain('"questions"');
    expect(system).not.toContain('"prompt_dependence"');
  });

  it("the whole Part 3 evaluation runs on its reply: Q8 result, own schema version, prompt fingerprint, tokens", async () => {
    const fetchMock = vi.fn(async () => json(200, gemini(reply())));
    const evaluation = await evaluateArgument(input, model(fetchMock));
    expect(evaluation.result.kind).toBe("multilevel_q8");
    expect(evaluation.result.chosen_points).toEqual(["F1", "F2", "A1", "A2"]);
    expect(evaluation.provider).toBe("gemini");
    expect(evaluation.schemaVersion).toBe(4);
    expect(evaluation.promptHash).toMatch(/^h2:[a-f0-9]{64}$/);
    expect(evaluation.inputTokens).toBe(1000);
    expect(evaluation.outputTokens).toBe(700);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Anthropic with a Part 3 input", () => {
  const model = (fetchImpl: unknown) =>
    new AnthropicEvaluationModel({ apiKey: "sk-ant-test-not-real", model: "claude-test", effort: "high", maxTokens: 16000, timeoutMs: 5000, serverFallbacks: false, maxRetries: 0, fetch: fetchImpl as typeof fetch });
  const message = (text: string) => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
  });

  it("sends the Part 3 output schema and the evaluation runs on its reply", async () => {
    const fetchMock = vi.fn(async () => json(200, message(reply())));
    const evaluation = await evaluateArgument(input, model(fetchMock));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const schema = JSON.stringify(JSON.parse(String(init.body)).output_config.format.schema);
    expect(schema).toContain("prompt_dependence");
    expect(schema).not.toContain('"questions"');
    expect(evaluation.result.kind).toBe("multilevel_q8");
    expect(evaluation.provider).toBe("anthropic");
  });
});
