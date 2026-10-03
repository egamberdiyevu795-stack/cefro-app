import { describe, expect, it } from "vitest";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { makeEvaluation } from "../../../test/fixtures";
import { compareAttempts } from "./comparison";

function withScores(scores: Partial<Record<"fluency_coherence" | "grammar" | "vocabulary" | "task_achievement", number>>, overrides: Partial<EvaluationResult> = {}) {
  const evaluation = makeEvaluation(overrides);
  for (const [key, score] of Object.entries(scores)) {
    evaluation.criteria[key as keyof typeof scores] = { ...evaluation.criteria[key as keyof typeof scores], score };
  }
  return evaluation;
}
const compare = (before: EvaluationResult, after: EvaluationResult, methodology?: [string, string]) =>
  compareAttempts(
    { evaluation: before, metrics: null, methodology: methodology?.[0] },
    { evaluation: after, metrics: null, methodology: methodology?.[1] },
  );

describe("compareAttempts", () => {
  it("reports real deltas, including declines, with their magnitude", () => {
    const result = compare(makeEvaluation(), withScores({ grammar: 7, vocabulary: 4 }, { overall_level: "B1" }));
    const byCriterion = Object.fromEntries(result.criteria.map((c) => [c.criterion, c]));
    expect(byCriterion.grammar).toMatchObject({ before: 5, after: 7, delta: 2, direction: "improved", magnitude: "clear" });
    expect(byCriterion.vocabulary).toMatchObject({ delta: -2, direction: "declined", magnitude: "clear" });
    expect(byCriterion.fluency_coherence).toMatchObject({ direction: "same", magnitude: "none" });
    expect(byCriterion.pronunciation.direction).toBe("not_comparable");
    expect(result.overall).toMatchObject({ before: "B1+", after: "B1", direction: "declined", magnitude: "slight" });
    expect(result.verdict).toBe("mixed");
  });

  it("does not present one-point changes as progress", () => {
    const result = compare(makeEvaluation(), withScores({ grammar: 6, vocabulary: 7 }, { overall_level: "B2-" }));
    expect(result.criteria.find((c) => c.criterion === "grammar")?.magnitude).toBe("slight");
    expect(result.clearlyImproved).toEqual([]);
    expect(result.verdict).toBe("slight_improvement");
  });

  it("reports 'about the same' when nothing changed", () => {
    const result = compare(makeEvaluation(), makeEvaluation());
    expect(result.verdict).toBe("about_the_same");
    expect(result.tally.improved).toBe(0);
  });

  it("reports clear improvement and clear decline honestly", () => {
    expect(compare(makeEvaluation(), withScores({ grammar: 7, task_achievement: 7 }, { overall_level: "B2" })).verdict).toBe("clear_improvement");
    expect(compare(makeEvaluation(), withScores({ grammar: 3 }, { overall_level: "B1-" })).verdict).toBe("clear_decline");
  });

  it("summarises whether the retry focus was achieved and what to practise next", () => {
    const after = makeEvaluation({
      retry_review: {
        objectives: [
          { objective: "a", outcome: "achieved", evidence: "x" },
          { objective: "b", outcome: "not_achieved", evidence: "y" },
        ],
        summary: "Partly better.",
      },
    });
    const result = compare(makeEvaluation(), after);
    expect(result.focus).toEqual({ achieved: 1, partlyAchieved: 0, notAchieved: 1, total: 2 });
    expect(result.practiceNext).toEqual(after.retry_focus);
  });

  it("lists criteria that are no longer flagged and what remains", () => {
    const before = makeEvaluation();
    const after = makeEvaluation({ issues: [{ ...before.issues[0], problem: "Missing verbs." }] });
    const result = compare(before, after);
    expect(result.resolvedCriteria).toEqual(["vocabulary"]);
    expect(result.remainingIssues[0].problem).toBe("Missing verbs.");
  });

  it("flags comparisons across different methodology versions", () => {
    expect(compare(makeEvaluation(), makeEvaluation(), ["v1", "v2"]).methodologyChanged).toBe(true);
    expect(compare(makeEvaluation(), makeEvaluation(), ["v2", "v2"]).methodologyChanged).toBe(false);
  });

  describe("real Gemini score variation (same transcript, different runs)", () => {
    const scored = (level: EvaluationResult["overall_level"], f: number, g: number, v: number, t: number) =>
      withScores({ fluency_coherence: f, grammar: g, vocabulary: v, task_achievement: t }, { overall_level: level });

    it("S02: B2+ → C1 with every criterion only +1 is NOT a clear improvement", () => {
      const result = compare(scored("B2+", 7, 9, 8, 8), scored("C1", 8, 10, 9, 9));
      expect(result.overall).toMatchObject({ before: "B2+", after: "C1", direction: "improved", magnitude: "clear" });
      expect(result.clearlyImproved).toEqual([]);
      expect(result.verdict).toBe("slight_improvement");
    });

    it("S09: identical criterion scores, B1 → B1- is within normal variation", () => {
      const result = compare(scored("B1", 4, 5, 5, 5), scored("B1-", 4, 5, 5, 5));
      expect(result.verdict).toBe("slight_decline");
      expect(result.tally).toEqual({ improved: 0, declined: 0, same: 4 });
    });

    it("a big overall drop with only 1-point criterion changes is not a clear decline either", () => {
      expect(compare(scored("C1", 8, 10, 9, 9), scored("B2+", 7, 9, 8, 8)).verdict).toBe("slight_decline");
    });

    it("a genuine retry (S03 → S01: every criterion +4) is still a clear improvement", () => {
      const result = compare(scored("B1-", 4, 4, 4, 4), scored("B2+", 8, 8, 8, 8));
      expect(result.clearlyImproved).toHaveLength(4);
      expect(result.verdict).toBe("clear_improvement");
    });

    it("a clear criterion change in the opposite direction to the overall level is reported as mixed", () => {
      expect(compare(scored("B1", 5, 5, 5, 5), scored("B1+", 5, 3, 6, 6)).verdict).toBe("mixed");
    });
  });
});
