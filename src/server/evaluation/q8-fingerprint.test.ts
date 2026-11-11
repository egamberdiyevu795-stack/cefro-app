import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { PART3_ANCHORS } from "../../../test/evaluation-samples/part3-anchors";
import type { ArgumentEvaluationInput } from "./argument-types";
import { computeQ8PromptHash, currentQ8PromptParts, q8ProviderSchemaJson } from "./q8-fingerprint";
import { hashPromptParts, PROMPT_HASH_SCHEME } from "./prompt-fingerprint";
import { buildQ8EvaluationPrompt } from "./prompts/q8-evaluation";
import { getArgumentRubric } from "./rubrics/q8";
import { ARGUMENT_EVALUATOR_VERSION } from "./versions";

/**
 * The Part 3 prompt fingerprint fixture (the Part 2 one is in prompt-fingerprint.test.ts and part1-prompt.test.ts).
 * No model is called: the hash is computed from the prompt text, the revision template and the provider schema.
 * If this test fails after a deliberate change to the Part 3 prompt, schema or evaluator, bump
 * ARGUMENT_EVALUATOR_VERSION (versions.ts), then update PINNED_HASH and test/fixtures/q8-model-output-schema.json
 * (UPDATE_Q8_FIXTURES=1 npx vitest run src/server/evaluation/q8-fingerprint.test.ts).
 */
const PINNED_HASH = "h2:1e37b63b66714451261a2cfe48ac24d05c97f58bbb0d577981ff5751075568f3";
const SCHEMA_FIXTURE = path.join(process.cwd(), "test", "fixtures", "q8-model-output-schema.json");

const anchor = PART3_ANCHORS.find((a) => a.id === "cars-A4")!;
const task = getArgumentTask(anchor.taskId)!;
const input = (transcript = anchor.transcript): ArgumentEvaluationInput => ({
  task,
  rubric: getArgumentRubric(task),
  transcript,
  metrics: computeSpeechMetrics(transcript, 110_000, task.speakingSeconds),
  chosenPoints: ["F1", "F2", "A1", "A2"],
  audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: 110_000 },
  previousAttempt: null,
});
const hash = (i = input()) => computeQ8PromptHash(i, buildQ8EvaluationPrompt(i));

describe("Part 3 prompt fingerprint", () => {
  it("is scheme-prefixed, stable, and independent of the student's answer and chosen points", () => {
    expect(hash()).toMatch(new RegExp(`^${PROMPT_HASH_SCHEME}:[a-f0-9]{64}$`));
    expect(hash()).toBe(hash());
    expect(hash(input("A completely different answer about something else entirely, with other words."))).toBe(hash());
    expect(hash({ ...input(), chosenPoints: ["F3", "A3"] })).toBe(hash());
  });

  it("differs from Part 2's fingerprint scheme inputs: its own evaluator version, prompt and schema", () => {
    const parts = currentQ8PromptParts(input(), buildQ8EvaluationPrompt(input()));
    expect(parts.evaluatorVersion).toBe(ARGUMENT_EVALUATOR_VERSION);
    expect(parts.system).toContain("Part 3 (official Question 8)");
    expect(parts.userTemplate).toContain("<previous_attempt number=");
    expect(parts.userTemplate).toContain("FOR:");
    expect(parts.resultSchema).toContain("prompt_dependence");
    expect(JSON.stringify(parts)).not.toMatch(/api[_-]?key|sk-[a-z0-9]/i);
  });

  it("changes when the prompt, the revision template, the schema or the evaluator version change", () => {
    const parts = currentQ8PromptParts(input(), buildQ8EvaluationPrompt(input()));
    const base = hashPromptParts(parts);
    expect(hashPromptParts({ ...parts, system: `${parts.system}\nExtra rule` })).not.toBe(base);
    expect(hashPromptParts({ ...parts, userTemplate: `${parts.userTemplate}\nNEW` })).not.toBe(base);
    expect(hashPromptParts({ ...parts, revisionTemplate: `${parts.revisionTemplate} more` })).not.toBe(base);
    expect(hashPromptParts({ ...parts, resultSchema: parts.resultSchema.replace("prompt_dependence", "prompt_dependency") })).not.toBe(base);
    expect(hashPromptParts({ ...parts, evaluatorVersion: "argument-evaluator/9.9.9" })).not.toBe(base);
  });

  it("the provider schema is byte-for-byte the pinned fixture", () => {
    const current = JSON.stringify(JSON.parse(q8ProviderSchemaJson()), null, 1);
    if (process.env.UPDATE_Q8_FIXTURES === "1") fs.writeFileSync(SCHEMA_FIXTURE, current);
    expect(current).toBe(fs.readFileSync(SCHEMA_FIXTURE, "utf8"));
  });

  it("the fingerprint is pinned (a prompt or schema change must be deliberate)", () => {
    expect(hash()).toBe(PINNED_HASH);
  });
});
