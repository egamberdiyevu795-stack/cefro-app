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
});
