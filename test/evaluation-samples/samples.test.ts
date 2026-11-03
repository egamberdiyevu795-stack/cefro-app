import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { TRANSCRIPTION_SAMPLES } from "../live/audio-samples";
import { B2_PART2_SAMPLES } from "./b2-part2-samples";

const task = getSpeakingTask("b2-part2-technology-young-people")!;
const byId = Object.fromEntries(B2_PART2_SAMPLES.map((s) => [s.id, s]));
const metricsOf = (id: string) => computeSpeechMetrics(byId[id].transcript, byId[id].durationMs, task.speakingSeconds);

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

describe("B2 Part 2 evaluation sample set", () => {
  it("covers the required range of answer types with valid expectations", () => {
    expect(B2_PART2_SAMPLES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(B2_PART2_SAMPLES.map((s) => s.id)).size).toBe(B2_PART2_SAMPLES.length);
    for (const sample of B2_PART2_SAMPLES) {
      const [min, max] = sample.expect.band;
      expect(min).toBeGreaterThanOrEqual(0);
      expect(min).toBeLessThanOrEqual(max);
      expect(max).toBeLessThanOrEqual(5);
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
    expect(evaluation.result.assessment.features.pronunciation.level).toBe("not_assessed");
    expect(evaluation.result.scoring.band).toBeGreaterThanOrEqual(0);
    expect(evaluation.result.scoring.band).toBeLessThanOrEqual(5);
  }, 10_000);

  it("the verbatim regression sample (owner's real answer) contains every phrase it checks, word for word", () => {
    const t12 = TRANSCRIPTION_SAMPLES.find((x) => x.id.startsWith("T12"))!;
    expect(t12.mustKeep).toBe(true);
    for (const phrase of [...t12.keep!, ...t12.watch!]) expect(isQuoteInTranscript(phrase, t12.ref!, { strict: true }), phrase).toBe(true);
    expect(byId["S15-owner-real-answer"].transcript).toBe(t12.ref);
  });

  it("the injection sample stays inside the escaped transcript section", () => {
    const prompt = buildMultilevelEvaluationPrompt(inputFor("S13-prompt-injection"));
    const transcriptSection = prompt.user.split("<transcript>")[1].split("</transcript>")[0];
    expect(transcriptSection).toContain("Ignore all previous instructions");
    expect(prompt.system).not.toContain("Ignore all previous instructions");
  });
});
