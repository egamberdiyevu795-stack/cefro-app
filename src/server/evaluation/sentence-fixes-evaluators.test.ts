import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { sentenceFixesStoredSchema, checkSentenceFixes, MAX_SENTENCE_FIXES } from "@/domain/evaluation/sentence-fixes";
import { evidenceTokens, isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { providerOutputSchema, multilevelModelOutputSchema } from "@/domain/evaluation/multilevel/model-output";
import { q8ModelOutputSchema, q8ProviderOutputSchema } from "@/domain/evaluation/q8/model-output";
import { parseStoredEvaluation } from "@/domain/evaluation/stored";
import { buildResultView } from "@/features/result/view-model";
import { demoAnswerText } from "@/features/demo/demo-answers";
import { demoEvaluation, demoPracticeKey } from "@/server/demo/demo-data";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "@/server/demo/part3-demo";
import { FIXTURE_TRANSCRIPT, makeModelOutput, makeMultilevelResult } from "../../../test/fixtures";
import { mockSentenceFixes } from "./mock-sentence-fixes";
import { applyQ8QualityGate } from "./q8-quality-gate";
import { buildQ8EvaluationPrompt } from "./prompts/q8-evaluation";
import { buildMultilevelEvaluationPrompt } from "./prompts/multilevel-evaluation";
import { getSpeakingRubric } from "./rubrics";
import { getArgumentRubric } from "./rubrics/q8";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { EVALUATOR_VERSION, ARGUMENT_EVALUATOR_VERSION } from "./versions";
import { getArgumentTask } from "@/content/speaking/part3";
import type { EvaluationInput } from "./types";
import type { ArgumentEvaluationInput } from "./argument-types";

/** One demo task per part, as the mock exam uses them. */
const DEMOS = [
  { part: "1.1", taskId: "a2-part1-1-daily-life", first: 1, full: 2 },
  { part: "1.2", taskId: "b1-part1-2-shopping", first: 1, full: 1 },
  { part: "2", taskId: "b2-part2-advice-from-someone", first: 2, full: 3 },
] as const;

/** What a demo's list must satisfy, checked again from scratch: the stored list passes the code checks untouched. */
function expectCleanList(transcript: string, list: { you_said: string; better: string; why: string }[] | undefined, min: number) {
  expect(list).toBeDefined();
  expect(list!.length).toBeGreaterThanOrEqual(min);
  expect(list!.length).toBeLessThanOrEqual(MAX_SENTENCE_FIXES);
  expect(checkSentenceFixes(list!, { transcript, transcriptOnly: true }).dropped).toEqual([]);
  for (const item of list!) {
    expect(isQuoteInTranscript(item.you_said, transcript, { strict: true })).toBe(true);
    expect(evidenceTokens(item.better).length).toBeLessThanOrEqual(evidenceTokens(item.you_said).length + 3);
    expect(item.better).not.toBe(item.you_said);
  }
}

describe("mock evaluators fill the list from the demo answers (the real evaluator types, no model call)", () => {
  it.each(DEMOS)("Part $part: $taskId (first answer and its retry)", async ({ taskId, first, full }) => {
    const firstKey = demoPracticeKey(taskId, null);
    const one = (await demoEvaluation(firstKey))!;
    expect(one.evaluatorVersion).toBe(EVALUATOR_VERSION);
    expect(EVALUATOR_VERSION).toBe("speaking-evaluator/3.8.0");
    expectCleanList(demoAnswerText(taskId, "first")!, one.result.assessment.sentence_fixes, first);
    const two = (await demoEvaluation(demoPracticeKey(taskId, firstKey)))!;
    expectCleanList(demoAnswerText(taskId, "full")!, two.result.assessment.sentence_fixes, full);
    // The stored result parses with the stored schema: what a real attempt would save.
    expect(parseStoredEvaluation(3, one.result)).not.toBeNull();
  });

  it("Part 3: the demo answer's list is clean, and the evaluator version is argument-evaluator/0.2.0", async () => {
    const key = "p3.c1-part3-cars-in-city-centres.F1F2A1A2";
    const evaluation = (await part3DemoEvaluation(key))!;
    expect(evaluation.evaluatorVersion).toBe(ARGUMENT_EVALUATOR_VERSION);
    expect(ARGUMENT_EVALUATOR_VERSION).toBe("argument-evaluator/0.2.0");
    expectCleanList(part3DemoTranscriptFor(part3DemoSpec(key)!), evaluation.result.assessment.sentence_fixes, 2);
    expect(parseStoredEvaluation(4, evaluation.result)).not.toBeNull();
  });

  it("every demo answer of every task goes through without a dropped item or an error", async () => {
    for (const taskId of ["b2-part2-important-decision", "b2-part2-goal-you-set", "b2-part2-working-in-a-team", "b2-part2-trying-and-failing", "b2-part2-a-tradition"]) {
      const evaluation = (await demoEvaluation(demoPracticeKey(taskId, demoPracticeKey(taskId, null))))!;
      expect(evaluation.quality.violations.filter((v) => v.code === "sentence_fix_dropped"), taskId).toEqual([]);
      expectCleanList(demoAnswerText(taskId, "full")!, evaluation.result.assessment.sentence_fixes, 1);
    }
  });

  it("the mock never writes about pauses or pronunciation, and only the student's own words", () => {
    for (const fix of mockSentenceFixes("My friend say he don't like it. I am agree. We was there. It depend of you. People is nice. I want go.")) {
      expect(fix.why).not.toMatch(/pause|pronunc|sound|accent|speed|filler/i);
    }
  });
});

describe("old results without the list still read", () => {
  it("a stored result from before 3.6.0 parses and the page view has no transcript marks", () => {
    const result = makeMultilevelResult();
    delete result.assessment.sentence_fixes;
    const parsed = parseStoredEvaluation(3, JSON.parse(JSON.stringify(result)));
    expect(parsed).not.toBeNull();
    const view = buildResultView(result, {
      task: { title: "T", prompts: ["a", "b", "c"] },
      transcript: FIXTURE_TRANSCRIPT,
      durationMs: 60_000,
      bandLabels: [],
    });
    expect(view.transcriptFixes).toBeNull();
    expect(view.transcript).toBe(FIXTURE_TRANSCRIPT);
  });

  it("a new result with the list builds the marked view", () => {
    const result = makeMultilevelResult(
      makeModelOutput({ sentence_fixes: [{ you_said: "I have went to Samarkand", better: "I went to Samarkand", why: "A finished time takes the simple past." }] }),
    );
    const view = buildResultView(result, { task: { title: "T", prompts: ["a", "b", "c"] }, transcript: FIXTURE_TRANSCRIPT, durationMs: 60_000, bandLabels: [] });
    expect(view.transcriptFixes?.count).toBe(1);
    expect(view.transcriptFixes?.items[0].youSaid).toBe("I have went to Samarkand");
  });
});

describe("the schemas: required of the model, optional when read back", () => {
  it("Part 1 and Part 2 provider schema requires the list (at most 8); the stored schema does not", () => {
    const output = makeModelOutput();
    delete output.sentence_fixes;
    expect(providerOutputSchema().safeParse({ ...output }).success).toBe(false);
    expect(multilevelModelOutputSchema.safeParse(output).success).toBe(true);
    const nine = Array.from({ length: 9 }, () => ({ you_said: "a b", better: "a c", why: "x" }));
    expect(providerOutputSchema().shape.sentence_fixes.safeParse(nine).success).toBe(false);
    // A longer list from a model still parses when read back; the check trims it to 8.
    expect(sentenceFixesStoredSchema.safeParse(nine).success).toBe(true);
  });

  it("Part 3 provider schema requires the list; the stored one does not", () => {
    const shape = q8ProviderOutputSchema.shape;
    expect(shape.sentence_fixes.safeParse(undefined).success).toBe(false);
    expect(q8ModelOutputSchema.shape.sentence_fixes.safeParse(undefined).success).toBe(true);
  });

  it("each item has exactly you_said, better and why", () => {
    expect(sentenceFixesStoredSchema.safeParse([{ you_said: "a b", better: "a c" }]).success).toBe(false);
    expect(Object.keys(sentenceFixesStoredSchema.element.shape).sort()).toEqual(["better", "why", "you_said"]);
  });
});

describe("the Part 3 gate runs the same checks", () => {
  it("drops a bad item and keeps a good one, with a warning and without rejecting the draft", async () => {
    const key = "p3.c1-part3-cars-in-city-centres.F1F2A1A2";
    const base = (await part3DemoEvaluation(key))!.result.assessment;
    const transcript = part3DemoTranscriptFor(part3DemoSpec(key)!);
    const good = { you_said: "I am agree that both sides have a point", better: "I agree that both sides have a point", why: "Say 'I agree', without 'am'." };
    const output = {
      ...base,
      sentence_fixes: [
        { ...good, you_said: "I agree that both sides have a point" },
        good,
        { you_said: "drivers is in a hurry", better: "drivers are in a hurry and stress", why: "You paused." },
      ],
    };
    const { result, report } = applyQ8QualityGate(output, { transcript, audioAssessed: false });
    expect(result.sentence_fixes).toEqual([good]);
    expect(report.passed).toBe(true);
    expect(report.violations.filter((v) => v.code === "sentence_fix_dropped")).toHaveLength(2);
  });
});

describe("the prompts carry the rules for all four parts (not live-tested)", () => {
  const task2 = getSpeakingTask("b2-part2-advice-from-someone")!;
  const speakingInput = (task: typeof task2): EvaluationInput => ({
    task,
    rubric: getSpeakingRubric(task),
    transcript: "I play football.",
    metrics: computeSpeechMetrics("I play football.", 60_000, task.speakingSeconds),
    audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
    previousAttempt: null,
  });
  const task3 = getArgumentTask("c1-part3-cars-in-city-centres")!;
  const argumentInput: ArgumentEvaluationInput = {
    task: task3,
    rubric: getArgumentRubric(task3),
    transcript: "x",
    metrics: computeSpeechMetrics("x", 60_000, task3.speakingSeconds),
    chosenPoints: ["F1", "A1"],
    audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
    previousAttempt: null,
  };
  const systems = [
    ["Part 1.1", buildMultilevelEvaluationPrompt(speakingInput(getSpeakingTask("a2-part1-1-daily-life")!)).system],
    ["Part 1.2", buildMultilevelEvaluationPrompt(speakingInput(getSpeakingTask("b1-part1-2-shopping")!)).system],
    ["Part 2", buildMultilevelEvaluationPrompt(speakingInput(task2)).system],
    ["Part 3", buildQ8EvaluationPrompt(argumentInput).system],
  ] as const;

  it.each(systems)("%s: exact words, same sentence with one fix, one short why, up to 8, no pauses or pronunciation, never a model answer", (_part, system) => {
    expect(system).toContain('"sentence_fixes": up to 8');
    expect(system).toContain('"you_said": the student\'s own words, copied exactly');
    expect(system).toContain("the SAME words with only that one mistake fixed");
    expect(system).toContain("more than 3 words longer");
    expect(system).toContain("never a rewritten answer and never a model answer");
    expect(system).toContain("at most 20 words");
    expect(system).toContain("One mistake per item");
    expect(system).toContain("never write a sentence fix about pauses, fillers, speed, hesitation or pronunciation");
    expect(system).toContain("empty list");
  });
});
