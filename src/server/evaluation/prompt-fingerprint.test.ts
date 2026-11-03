import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { FIXTURE_TRANSCRIPT } from "../../../test/fixtures";

const tweak = vi.hoisted(() => ({ user: "", system: "", revision: "" }));
vi.mock("./prompts/multilevel-evaluation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./prompts/multilevel-evaluation")>();
  return {
    ...actual,
    buildMultilevelEvaluationPrompt: (input: Parameters<typeof actual.buildMultilevelEvaluationPrompt>[0]) => {
      const prompt = actual.buildMultilevelEvaluationPrompt(input);
      return { system: prompt.system + tweak.system, user: prompt.user + tweak.user };
    },
    buildRevisionRequest: (violations: Parameters<typeof actual.buildRevisionRequest>[0]) => actual.buildRevisionRequest(violations) + tweak.revision,
  };
});

import { computePromptHash, currentPromptParts, hashPromptParts, PROMPT_HASH_SCHEME } from "./prompt-fingerprint";
import { buildMultilevelEvaluationPrompt } from "./prompts/multilevel-evaluation";
import { getSpeakingRubric } from "./rubrics";
import type { EvaluationInput } from "./types";

const task = getSpeakingTask("b2-part2-technology-young-people")!;
const input = (transcript = FIXTURE_TRANSCRIPT): EvaluationInput => ({
  task,
  rubric: getSpeakingRubric(task),
  transcript,
  metrics: computeSpeechMetrics(transcript, 60_000, task.speakingSeconds),
  audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
  previousAttempt: null,
});

const hash = (i = input()) => computePromptHash(i, buildMultilevelEvaluationPrompt(i));
const reset = () => Object.assign(tweak, { user: "", system: "", revision: "" });

describe("prompt hash", () => {
  it("is scheme-prefixed, stable, and independent of the student's answer", () => {
    reset();
    expect(hash()).toMatch(new RegExp(`^${PROMPT_HASH_SCHEME}:[a-f0-9]{64}$`));
    expect(hash()).toBe(hash());
    expect(hash(input("A completely different answer about something else entirely, with other words."))).toBe(hash());
  });

  it("changes when the user-message template changes (the gap in the old hash)", () => {
    reset();
    const before = hash();
    tweak.user = "\nNEW INSTRUCTION IN THE USER MESSAGE";
    expect(hash()).not.toBe(before);
    reset();
    expect(hash()).toBe(before);
  });

  it("changes when the system prompt, the revision template, or the result schema change", () => {
    reset();
    const before = hash();
    tweak.system = "\nExtra rule";
    expect(hash()).not.toBe(before);
    reset();
    tweak.revision = " Extra revision wording";
    expect(hash()).not.toBe(before);
    reset();

    const parts = currentPromptParts(input(), buildMultilevelEvaluationPrompt(input()));
    expect(hashPromptParts({ ...parts, resultSchema: parts.resultSchema.replace("most serious first", "least serious first") })).not.toBe(hashPromptParts(parts));
    expect(hashPromptParts({ ...parts, evaluatorVersion: "speaking-evaluator/9.9.9" })).not.toBe(hashPromptParts(parts));
  });

  it("covers the official descriptors (system prompt), the audio-step prompt and the schema's field guidance", () => {
    reset();
    const parts = currentPromptParts(input(), buildMultilevelEvaluationPrompt(input()));
    expect(parts.system).toContain("A limited number of cohesive devices are used to indicate the links between ideas.");
    expect(parts.userTemplate).toContain("Mispronunciations do not put a strain on the listener");
    expect(parts.resultSchema).toContain("most serious first");
    expect(parts.userTemplate).toContain("<speech_metrics>");
    expect(parts.userTemplate).toContain("<previous_attempt number=");
  });

  it("keeps part boundaries unambiguous (moving text between parts changes the hash)", () => {
    const base = { evaluatorVersion: "v", system: "ab", userTemplate: "c", revisionTemplate: "d", resultSchema: "e" };
    expect(hashPromptParts(base)).not.toBe(hashPromptParts({ ...base, system: "a", userTemplate: "bc" }));
  });

  it("does not read any secret", () => {
    reset();
    const parts = currentPromptParts(input(), buildMultilevelEvaluationPrompt(input()));
    expect(JSON.stringify(parts)).not.toMatch(/api[_-]?key|sk-[a-z0-9]/i);
  });
});
