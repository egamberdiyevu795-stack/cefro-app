import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics, withQuestionTimes } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { computePromptHash } from "./prompt-fingerprint";
import { buildAudioAssessmentPrompt } from "./prompts/multilevel-audio-assessment";
import { buildMultilevelEvaluationPrompt } from "./prompts/multilevel-evaluation";
import { getSpeakingRubric } from "./rubrics";
import type { EvaluationInput } from "./types";

const input = (task: SpeakingTask, transcript = "I play football."): EvaluationInput => ({
  task,
  rubric: getSpeakingRubric(task),
  transcript,
  metrics: withQuestionTimes(computeSpeechMetrics(transcript, 60_000, task.speakingSeconds), [0, 25_000, 50_000], 75_000),
  audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs: 75_000 },
  previousAttempt: null,
});

const part11 = getSpeakingTask("a2-part1-1-daily-life")!;
const part12 = getSpeakingTask("b1-part1-2-shopping")!;
const part2 = getSpeakingTask("b2-part2-advice-from-someone")!;

describe("Part 1 prompt: everything from the rubric (docs/part1-plan.md §3, Prompt)", () => {
  it("Part 1.1: its own levels and descriptors, no cohesion, only its statuses, no literal B2", () => {
    const { system, user } = buildMultilevelEvaluationPrompt(input(part11));
    expect(system).toContain("Part 1.1 (official Questions 1–3)");
    expect(system).toContain("target level A2");
    for (const level of ["above_A2", "A2", "A1", "below_A1"]) expect(system).toContain(`"${level}"`);
    expect(system).toContain(getSpeakingRubric(part11).config.descriptors.A2!.fluency!);
    expect(system).toContain("Allowed statuses: on_topic, missing, off_topic. Use no other status.");
    expect(system).toMatch(/even a single word/);
    expect(system).not.toMatch(/\bB2\b/);
    expect(system).not.toMatch(/"minimal"|"partial"/);
    expect(system).toContain("do not include cohesion");
    expect(user).toContain("Question 1 (id 1, 5 s to get ready, 30 s to speak): What do you usually do at the weekend?");
    expect(user).toContain("Preparation time: a few seconds before each answer (not recorded)");
    expect(system).toContain("the student has a few seconds to get ready, a chime sounds");
    expect(system).not.toContain("There is no preparation time.");
    expect(user).toContain('"questionOffsetsMs"');
    expect(user).toContain('"questionSeconds"');
  });

  it("Part 1.2: numbered 4–6, both pictures described, Question 4's hint word for word", () => {
    const { system, user } = buildMultilevelEvaluationPrompt(input(part12));
    expect(system).toContain("Part 1.2 (official Questions 4–6)");
    expect(system).toContain("target level B1");
    expect(system).toContain('tell the student to "compare the two pictures"');
    expect(system).toContain("Allowed statuses: on_topic, partial, missing, off_topic.");
    expect(system).toContain("(reference)");
    expect(system).not.toMatch(/"minimal"/);
    expect(user).toContain("Question 4 (id 1, 10 s to get ready, 45 s to speak)");
    expect(user).toContain("Question 6 (id 3, 5 s to get ready, 30 s to speak)");
    for (const image of part12.images!) expect(user).toContain(image.alt);
    expect(user).toContain("Preparation time: a few seconds before each answer (not recorded)");
  });

  it("the audio step uses the part's own ladder", () => {
    const p11 = buildAudioAssessmentPrompt(getSpeakingRubric(part11).config, "x");
    expect(p11).toContain("above_A2, A2, A1, below_A1");
    expect(p11).not.toMatch(/\bB2\b/);
    const p12 = buildAudioAssessmentPrompt(getSpeakingRubric(part12).config, "x");
    expect(p12).toContain("above_B1, B1, A2, below_A2");
  });

  it("Part 2's prompt hash is pinned (changed on purpose by evaluator 3.7.0: the below-B1 vocabulary rule, docs/feedback-review.md issue 5)", () => {
    const i = input(part2, "I think so.");
    const plain = { ...i, metrics: computeSpeechMetrics("I think so.", 60_000, 120) };
    expect(computePromptHash(plain, buildMultilevelEvaluationPrompt(plain))).toBe("h2:010ddc3d294b8e321e0e15fb379d802a2e0cf33a38d81a9798710da91a8b4fbb");
    expect(computePromptHash(input(part11), buildMultilevelEvaluationPrompt(input(part11)))).not.toBe(
      computePromptHash(input(part12), buildMultilevelEvaluationPrompt(input(part12))),
    );
  });

  it("the Part 2 provider schema is byte-for-byte the pinned fixture (with the required sentence_fixes list since 3.6.0)", async () => {
    const { z } = await import("zod");
    const { providerOutputSchema } = await import("@/domain/evaluation/multilevel/model-output");
    const before = fs.readFileSync(path.join(process.cwd(), "test", "fixtures", "q7-model-output-schema.json"), "utf8");
    expect(JSON.parse(before).required).toContain("sentence_fixes");
    expect(JSON.parse(before).properties.sentence_fixes.maxItems).toBe(8);
    expect(JSON.stringify(z.toJSONSchema(providerOutputSchema(getSpeakingRubric(part2).config)), null, 1)).toBe(before);
    expect(JSON.stringify(z.toJSONSchema(providerOutputSchema()), null, 1)).toBe(before);
  });

  it("only the mock evaluator imports the Part 1 mock rules", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
      });
    const importers = walk(path.join(process.cwd(), "src"))
      .filter((file) => /from ["'][^"']*mock-part1-rules["']/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file));
    expect(importers).toEqual(["src/server/evaluation/mock-evaluation-model.ts"]);
  });
});
