import { describe, expect, it } from "vitest";
import { computeSpeechMetrics, tokenizeWords } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { B2_PART2_SAMPLES } from "./b2-part2-samples";
import { TECHNOLOGY_TASK as task } from "./technology-task";

const byId = Object.fromEntries(B2_PART2_SAMPLES.map((s) => [s.id, s]));
const metricsOf = (id: string) => computeSpeechMetrics(byId[id].transcript, byId[id].durationMs, task.speakingSeconds);
const minWords = getSpeakingRubric(task).config.scoring.min_words;

function inputFor(sampleId: string) {
  const sample = byId[sampleId];
  return {
    task,
    rubric: getSpeakingRubric(task),
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt: null,
  };
}

describe("S01–S15 evaluation sample set (former technology task)", () => {
  it("covers S01–S15 with valid expectations", () => {
    expect(B2_PART2_SAMPLES.map((s) => s.id.slice(0, 3))).toEqual(Array.from({ length: 15 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`));
    for (const sample of B2_PART2_SAMPLES) {
      const [min, max] = sample.expect.band;
      expect(min).toBeGreaterThanOrEqual(0);
      expect(min).toBeLessThanOrEqual(max);
      expect(max).toBeLessThanOrEqual(5);
    }
  });

  it("speech metrics capture what each sample is about", () => {
    expect(metricsOf("S07-repetitive").repeatedPhrases.map((p) => p.phrase)).toEqual(expect.arrayContaining(["i think", "social media"]));
    expect(metricsOf("S09-good-content-weak-fluency").fillerCount).toBeGreaterThanOrEqual(20);
    expect(metricsOf("S06-very-short").timeUsedRatio).toBeLessThanOrEqual(0.25);
    expect(metricsOf("S12-hesitant-slow").wordsPerMinute).toBeLessThan(25);
    expect(metricsOf("S01-strong-b2").wordsPerMinute).toBeGreaterThan(100);
    // Errors in the transcript are preserved as evidence, not corrected.
    expect(byId["S04-grammar-heavy"].transcript).toContain("he go to university");
  });

  it("the 30-word minimum counts everything spoken, fillers included (S06 is too short, S12 is not)", () => {
    expect(minWords).toBe(30);
    expect(tokenizeWords(byId["S06-very-short"].transcript).length).toBeLessThan(minWords);
    // S12 has 24 words plus 11 hesitation sounds: a ratable (if very hesitant) sample.
    expect(metricsOf("S12-hesitant-slow").wordCount).toBeLessThan(minWords);
    expect(tokenizeWords(byId["S12-hesitant-slow"].transcript).length).toBeGreaterThanOrEqual(minWords);
  });

  it.each(B2_PART2_SAMPLES.map((s) => [s.id]))("%s: the pipeline produces a gate-approved result (dev evaluator)", async (id) => {
    const evaluation = await evaluateSpeaking(inputFor(id), new MockEvaluationModel());
    expect(evaluation.quality.passed).toBe(true);
    expect(evaluation.result.assessment.features.pronunciation.level).toBe("not_assessed");
    expect(evaluation.result.scoring.band).toBeGreaterThanOrEqual(0);
    expect(evaluation.result.scoring.band).toBeLessThanOrEqual(5);
    if (id.startsWith("S06")) expect(evaluation.result.scoring.zero_reason).toBe("too_short");
  }, 10_000);

  it("the injection sample stays inside the escaped transcript section", () => {
    const prompt = buildMultilevelEvaluationPrompt(inputFor("S13-prompt-injection"));
    const transcriptSection = prompt.user.split("<transcript>")[1].split("</transcript>")[0];
    expect(transcriptSection).toContain("Ignore all previous instructions");
    expect(prompt.system).not.toContain("Ignore all previous instructions");
  });
});
