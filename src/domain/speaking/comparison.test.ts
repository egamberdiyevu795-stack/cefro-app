import { describe, expect, it } from "vitest";
import { makeEvaluation } from "../../../test/fixtures";
import { compareAttempts } from "./comparison";

describe("compareAttempts", () => {
  it("reports real deltas, including declines", () => {
    const before = makeEvaluation();
    const after = makeEvaluation({
      overall_level: "B1",
      criteria: {
        ...before.criteria,
        grammar: { ...before.criteria.grammar, score: 7 },
        vocabulary: { ...before.criteria.vocabulary, score: 4 },
      },
    });
    const result = compareAttempts({ evaluation: before, metrics: null }, { evaluation: after, metrics: null });

    expect(result.overall).toEqual({ before: "B1+", after: "B1", direction: "declined" });
    const byCriterion = Object.fromEntries(result.criteria.map((c) => [c.criterion, c]));
    expect(byCriterion.grammar).toMatchObject({ before: 5, after: 7, delta: 2, direction: "improved" });
    expect(byCriterion.vocabulary).toMatchObject({ delta: -2, direction: "declined" });
    expect(byCriterion.fluency_coherence.direction).toBe("same");
    expect(byCriterion.pronunciation.direction).toBe("not_comparable");
    expect(result.tally).toEqual({ improved: 1, declined: 1, same: 2 });
  });

  it("does not report improvement when nothing changed", () => {
    const evaluation = makeEvaluation();
    const result = compareAttempts({ evaluation, metrics: null }, { evaluation, metrics: null });
    expect(result.overall.direction).toBe("same");
    expect(result.tally.improved).toBe(0);
  });

  it("lists criteria that are no longer flagged", () => {
    const before = makeEvaluation();
    const after = makeEvaluation({
      issues: [{ ...before.issues[0], criterion: "grammar", problem: "Missing verbs." }],
    });
    const result = compareAttempts({ evaluation: before, metrics: null }, { evaluation: after, metrics: null });
    expect(result.resolvedCriteria).toEqual(["vocabulary"]);
    expect(result.remainingIssues[0].problem).toBe("Missing verbs.");
  });
});
