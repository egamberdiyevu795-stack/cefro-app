import { describe, expect, it } from "vitest";
import { makeLegacyEvaluation, makeMultilevelResult } from "../../../test/fixtures";
import { parseStoredEvaluation } from "./stored";

/** Shape of an evaluation as stored by speaking-evaluator/1.0.0 (schema v1). */
const v1Row = {
  overall_level: "B1",
  overall_summary: "Summary.",
  criteria: makeLegacyEvaluation().criteria,
  strengths: [{ title: "t", detail: "d", evidence_quote: "q" }],
  issues: [
    { criterion: "vocabulary", severity: "high", problem: "p", evidence_quotes: ["q"], why_it_matters: "w", how_to_fix: "h", improved_example: { original: "o", improved: "i" } },
    { criterion: "task_achievement", severity: "low", problem: "p2", evidence_quotes: [], why_it_matters: "w", how_to_fix: "h", improved_example: { original: "", improved: "i" } },
  ],
  retry_focus: [{ objective: "o", success_check: "s", criterion: "task_achievement" }],
  retry_review: null,
  reliability_note: null,
};

describe("parseStoredEvaluation", () => {
  it("reads current (v3, Multilevel band) evaluations as-is", () => {
    expect(parseStoredEvaluation(3, makeMultilevelResult())).toEqual(makeMultilevelResult());
  });

  it("reads v2 analytic evaluations as legacy, never as a band", () => {
    const legacy = parseStoredEvaluation(2, makeLegacyEvaluation())!;
    expect(legacy.kind).toBe("legacy");
    expect(legacy).not.toHaveProperty("scoring");
  });

  it("upgrades v1 evaluations to legacy for display without inventing content", () => {
    const upgraded = parseStoredEvaluation(1, v1Row)!;
    if (upgraded.kind !== "legacy") throw new Error("expected legacy");
    expect(upgraded.task_coverage).toEqual([]);
    expect(upgraded.issues.map((i) => i.evidence_basis)).toEqual(["transcript_quote", "task_requirement"]);
    expect(upgraded.retry_focus[0].addresses_issue).toBe(1);
  });

  it("returns null for unreadable rows or unknown versions", () => {
    expect(parseStoredEvaluation(3, { nope: true })).toBeNull();
    expect(parseStoredEvaluation(3, makeLegacyEvaluation())).toBeNull();
    expect(parseStoredEvaluation(99, makeMultilevelResult())).toBeNull();
  });
});
