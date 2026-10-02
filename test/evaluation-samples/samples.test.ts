import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { CEFR_LEVELS } from "@/domain/cefr";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { buildSpeakingEvaluationPrompt } from "@/server/evaluation/prompts/speaking-evaluation-v2";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { B2_PART2_SAMPLES } from "./b2-part2-samples";

const task = getSpeakingTask("b2-part2-technology-young-people")!;
const byId = Object.fromEntries(B2_PART2_SAMPLES.map((s) => [s.id, s]));
const metricsOf = (id: string) => computeSpeechMetrics(byId[id].transcript, byId[id].durationMs, task.speakingSeconds);

function inputFor(sampleId: string) {
  const sample = byId[sampleId];
  return {
    task,
    rubric: getSpeakingRubric("B2"),
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt: null,
  };
}

describe("B2 Part 2 evaluation sample set", () => {
  it("covers the required range of answer types with valid expectations", () => {
    expect(B2_PART2_SAMPLES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(B2_PART2_SAMPLES.map((s) => s.id)).size).toBe(B2_PART2_SAMPLES.length);
    for (const sample of B2_PART2_SAMPLES) {
      const [min, max] = sample.expect.level;
      expect(CEFR_LEVELS.indexOf(min)).toBeLessThanOrEqual(CEFR_LEVELS.indexOf(max));
    }
  });

  it("speech metrics capture what each sample is about", () => {
    expect(metricsOf("S07-repetitive").repeatedPhrases.map((p) => p.phrase)).toEqual(
      expect.arrayContaining(["i think", "social media"]),
    );
    expect(metricsOf("S09-good-content-weak-fluency").fillerCount).toBeGreaterThanOrEqual(20);
    expect(metricsOf("S06-very-short").timeUsedRatio).toBeLessThanOrEqual(0.25);
    expect(metricsOf("S12-hesitant-slow").wordsPerMinute).toBeLessThan(25);
    expect(metricsOf("S01-strong-b2").wordsPerMinute).toBeGreaterThan(100);
    // Errors in the transcript are preserved as evidence, not corrected.
    expect(byId["S04-grammar-heavy"].transcript).toContain("he go to university");
  });

  it.each(B2_PART2_SAMPLES.map((s) => [s.id]))("%s: the pipeline produces a gate-approved result (dev evaluator)", async (id) => {
    const evaluation = await evaluateSpeaking(inputFor(id), new MockEvaluationModel());
    expect(evaluation.quality.passed).toBe(true);
    expect(evaluation.modelCalls).toBe(1);
    expect(evaluation.result.criteria.pronunciation.assessable).toBe(false);
  }, 10_000);

  it("the injection sample stays inside the escaped transcript section", () => {
    const prompt = buildSpeakingEvaluationPrompt(inputFor("S13-prompt-injection"));
    const transcriptSection = prompt.user.split("<transcript>")[1].split("</transcript>")[0];
    expect(transcriptSection).toContain("Ignore all previous instructions");
    expect(prompt.system).not.toContain("Ignore all previous instructions");
  });
});
