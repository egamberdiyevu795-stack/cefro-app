import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import type { CefrLevel } from "@/domain/cefr";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { bandFor, deriveBand, describeDerivation, languageBandOf, type LanguageBand } from "./part2-band";
import { PART2_BAND_ANCHORS } from "./part2-band-anchors";

const task = getSpeakingTask("b2-part2-technology-young-people")!;

function fakeResult(levels: [CefrLevel | null, CefrLevel | null, CefrLevel | null], statuses: (string | null)[], overall: CefrLevel = "B1"): EvaluationResult {
  const c = (level: CefrLevel | null) => ({ assessable: level !== null, score: level ? 5 : null, level, justification: "x" });
  return {
    overall_level: overall,
    criteria: {
      grammar: c(levels[0]),
      vocabulary: c(levels[1]),
      fluency_coherence: c(levels[2]),
      pronunciation: c(null),
      task_achievement: c("B1"),
    },
    task_coverage: statuses.flatMap((status, prompt_index) => (status ? [{ prompt_index, status, note: "x" }] : [])),
  } as unknown as EvaluationResult;
}

describe("Part 2 band derivation", () => {
  it("maps CEFRO sub-levels to official language bands ('-' means approaching)", () => {
    expect(["A1", "A2", "A2+", "B1-"].map((l) => languageBandOf(l as CefrLevel))).toEqual(Array(4).fill("below_b1"));
    expect(["B1", "B1+", "B2-"].map((l) => languageBandOf(l as CefrLevel))).toEqual(Array(3).fill("b1"));
    expect(["B2", "B2+", "C1-"].map((l) => languageBandOf(l as CefrLevel))).toEqual(Array(3).fill("b2"));
    expect(["C1", "C2"].map((l) => languageBandOf(l as CefrLevel))).toEqual(Array(2).fill("above_b2"));
  });

  it.each<[LanguageBand, number, number]>([
    ["below_b1", 3, 0],
    ["b1", 0, 0],
    ["b1", 1, 1],
    ["b1", 2, 2],
    ["b1", 3, 2],
    ["b2", 0, 0],
    ["b2", 1, 2],
    ["b2", 2, 3],
    ["b2", 3, 4],
    ["above_b2", 0, 0],
    ["above_b2", 3, 5],
  ])("%s language with %i questions on topic → band %i", (language, n, band) => {
    expect(bandFor(language, n)).toBe(band);
  });

  it("uses the median language feature and counts partly covered points as on topic", () => {
    const d = deriveBand(fakeResult(["B2", "B1+", "C1"], ["covered", "partly_covered", "not_covered"]));
    expect(d.languageLevel).toBe("B2");
    expect(d.language).toBe("b2");
    expect(d.questionsOnTopic).toBe(2);
    expect(d.band).toBe(3);
    expect(describeDerivation(d)).toContain("Q2=partly_covered");
  });

  it("treats a missing task point as not answered and ignores unassessable features", () => {
    const d = deriveBand(fakeResult(["B1", null, "B1+"], ["covered", null, null]));
    expect(d.questionStatuses).toEqual(["covered", "missing", "missing"]);
    expect(d.languageLevel).toBe("B1");
    expect(d.band).toBe(1);
  });

  it("off-topic answers are band 0 whatever the language", () => {
    expect(deriveBand(fakeResult(["C1", "C1", "C1"], ["not_covered", "not_covered", "not_covered"])).band).toBe(0);
  });
});

describe("Part 2 band anchor set", () => {
  it("has the seven anchors with unique ids and consistent expectations", () => {
    expect(PART2_BAND_ANCHORS.map((a) => a.expect.band).sort()).toEqual([0, 0, 1, 2, 3, 4, 5]);
    expect(new Set(PART2_BAND_ANCHORS.map((a) => a.id)).size).toBe(PART2_BAND_ANCHORS.length);
    for (const anchor of PART2_BAND_ANCHORS) {
      const onTopic = anchor.expect.questions.filter((q) => q !== "not_covered").length;
      expect(bandFor(anchor.expect.language, onTopic), anchor.id).toBe(anchor.expect.band);
    }
  });

  it.each(PART2_BAND_ANCHORS.map((a) => [a.id, a] as const))("%s: the pipeline produces a gate-approved result (dev evaluator)", async (_id, anchor) => {
    const evaluation = await evaluateSpeaking(
      {
        task,
        rubric: getSpeakingRubric(task),
        transcript: anchor.transcript,
        metrics: computeSpeechMetrics(anchor.transcript, anchor.durationMs, task.speakingSeconds),
        audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: anchor.durationMs },
        previousAttempt: null,
      },
      new MockEvaluationModel(),
    );
    expect(evaluation.quality.passed).toBe(true);
    expect(deriveBand(evaluation.result).questionStatuses).toHaveLength(3);
  }, 10_000);
});
