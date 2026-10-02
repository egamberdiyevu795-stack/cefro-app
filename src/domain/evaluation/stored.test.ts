import { describe, expect, it } from "vitest";
import { makeEvaluation } from "../../../test/fixtures";
import { parseStoredEvaluation } from "./stored";

/** Shape of an evaluation as stored by speaking-evaluator/1.0.0 (schema v1). */
const v1Row = {
  overall_level: "B1",
  overall_summary: "Summary.",
  criteria: makeEvaluation().criteria,
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
  it("reads current (v2) evaluations as-is", () => {
    expect(parseStoredEvaluation(2, makeEvaluation())).toEqual(makeEvaluation());
  });

  it("upgrades v1 evaluations for display without inventing content", () => {
    const upgraded = parseStoredEvaluation(1, v1Row)!;
    expect(upgraded.task_coverage).toEqual([]);
    expect(upgraded.issues.map((i) => i.evidence_basis)).toEqual(["transcript_quote", "task_requirement"]);
    expect(upgraded.retry_focus[0].addresses_issue).toBe(1);
  });

  it("returns null for unreadable rows or unknown versions", () => {
    expect(parseStoredEvaluation(2, { nope: true })).toBeNull();
    expect(parseStoredEvaluation(99, makeEvaluation())).toBeNull();
  });
});
