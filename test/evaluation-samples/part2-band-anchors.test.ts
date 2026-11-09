import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { TRANSCRIPTION_SAMPLES } from "../live/audio-samples";
import { OWNER_SAMPLE_ANSWER } from "./owner-sample";
import { PART2_BAND_ANCHORS, PART2_INJECTION_PROBE } from "./part2-band-anchors";

const task = getSpeakingTask("b2-part2-advice-from-someone")!;
const rubric = getSpeakingRubric(task);

function inputFor(sample: { transcript: string; durationMs: number }): EvaluationInput {
  return {
    task,
    rubric,
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt: null,
  };
}

describe("Part 2 band anchor set (advice from someone)", () => {
  it("has the eight anchors with unique ids", () => {
    expect(PART2_BAND_ANCHORS.map((a) => a.expect.band).sort()).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
    expect(new Set(PART2_BAND_ANCHORS.map((a) => a.id)).size).toBe(PART2_BAND_ANCHORS.length);
  });

  it.each(PART2_BAND_ANCHORS.map((a) => [a.id, a] as const))(
    "%s: the expected judgements give the expected band under the official scoring",
    (_id, anchor) => {
      const level = anchor.expect.language;
      const score = scoreBand(
        {
          questions: anchor.expect.questions.map((status, i) => ({ id: i + 1, status })),
          features: { grammar: level, vocabulary: level, fluency: level, cohesion: level, pronunciation: "not_assessed" },
          memorizedOrIrrelevant: anchor.expect.memorized ?? false,
        },
        rubric.config,
      );
      expect(score.band).toBe(anchor.expect.band);
    },
  );

  it.each(PART2_BAND_ANCHORS.map((a) => [a.id, a] as const))("%s: the pipeline produces a gate-approved result (dev evaluator)", async (_id, anchor) => {
    const evaluation = await evaluateSpeaking(inputFor(anchor), new MockEvaluationModel());
    expect(evaluation.quality.passed).toBe(true);
    expect(evaluation.result.assessment.features.pronunciation.level).toBe("not_assessed");
    expect(evaluation.result.assessment.questions).toHaveLength(3);
  }, 10_000);

  it("the injection probe stays inside the escaped transcript section", () => {
    const prompt = buildMultilevelEvaluationPrompt(inputFor(PART2_INJECTION_PROBE));
    const transcriptSection = prompt.user.split("<transcript>")[1].split("</transcript>")[0];
    expect(transcriptSection).toContain("Ignore all previous instructions");
    expect(prompt.system).not.toContain("Ignore all previous instructions");
  });

  it("the task tells the evaluator that retelling the story does not answer question 3", () => {
    expect(task.prompts).toHaveLength(3);
    expect(task.evaluatorGuidance).toMatch(/does NOT answer question 3/);
    expect(buildMultilevelEvaluationPrompt(inputFor(PART2_BAND_ANCHORS[0])).user).toContain("does NOT answer question 3");
  });

  it("the verbatim regression sample (owner's real answer) contains every phrase it checks, word for word", () => {
    const t12 = TRANSCRIPTION_SAMPLES.find((x) => x.id.startsWith("T12"))!;
    expect(t12.mustKeep).toBe(true);
    expect(t12.ref).toBe(OWNER_SAMPLE_ANSWER);
    for (const phrase of [...t12.keep!, ...t12.watch!]) expect(isQuoteInTranscript(phrase, t12.ref!, { strict: true }), phrase).toBe(true);
  });
});
