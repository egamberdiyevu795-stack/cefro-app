import { describe, expect, it } from "vitest";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { FIXTURE_TRANSCRIPT, makeEvaluation } from "../../../test/fixtures";
import { applyQualityGate, compareImprovedExample, isGeneric, makesPronunciationClaim } from "./quality-gate";

const context = { transcript: FIXTURE_TRANSCRIPT, taskPromptCount: 3, hasPreviousAttempt: false };

function gate(result: EvaluationResult, overrides: Partial<typeof context> = {}) {
  return applyQualityGate(result, { ...context, ...overrides });
}
function codes(result: EvaluationResult, overrides: Partial<typeof context> = {}) {
  return gate(result, overrides).report.violations.map((v) => `${v.severity}:${v.code}`);
}
function withIssue(patch: Partial<EvaluationResult["issues"][number]>, index = 0): EvaluationResult {
  const base = makeEvaluation();
  base.issues[index] = { ...base.issues[index], ...patch };
  return base;
}

describe("quality gate", () => {
  it("passes a clean, evidence-based evaluation unchanged", () => {
    const { result, report } = gate(makeEvaluation());
    expect(report).toEqual({ passed: true, violations: [] });
    expect(result).toEqual(makeEvaluation());
  });

  describe("Test A — evidence must exist in the transcript", () => {
    it("rejects an issue whose only quote is hallucinated", () => {
      const { report } = gate(withIssue({ evidence_quotes: ["I have gone to Bukhara"] }));
      expect(report.passed).toBe(false);
      expect(report.violations.map((v) => v.code)).toContain("issue_without_evidence");
    });

    it("keeps verified quotes and removes unverifiable ones with a warning", () => {
      const { result, report } = gate(withIssue({ evidence_quotes: ["I have went to Samarkand", "I goed there"] }));
      expect(report.passed).toBe(true);
      expect(result.issues[0].evidence_quotes).toEqual(["I have went to Samarkand"]);
      expect(report.violations).toEqual([expect.objectContaining({ severity: "warn", code: "quote_not_found" })]);
    });

    it("accepts quotes that differ only in case, punctuation or dropped fillers", () => {
      expect(gate(withIssue({ evidence_quotes: ["i HAVE went, to samarkand"] })).report.passed).toBe(true);
    });

    it("allows issues based on metrics or task requirements without quotes", () => {
      const result = withIssue({ evidence_basis: "task_requirement", evidence_quotes: [], improved_example: { original: "", improved: "Schools should limit phones during lessons." } });
      expect(gate(result).report.passed).toBe(true);
    });

    it("blanks an improved-example 'original' and strength quotes that are not in the transcript", () => {
      const evaluation = withIssue({ improved_example: { original: "I have went to Bukhara with my brother", improved: "I went to Bukhara with my brother" } });
      evaluation.strengths[0].evidence_quote = "a fantastic and invented sentence";
      const { result, report } = gate(evaluation);
      expect(report.passed).toBe(true);
      expect(result.issues[0].improved_example.original).toBe("");
      expect(result.strengths[0].evidence_quote).toBe("");
    });
  });

  describe("Test B — improved version must preserve meaning", () => {
    it("accepts a correction that keeps the student's idea", () => {
      const check = compareImprovedExample(
        "I visited Samarkand with my friend.",
        "I visited Samarkand with my friend, and we spent the whole day exploring the city.",
      );
      expect(check).toMatchObject({ meaningChanged: false, tooElaborate: false });
    });

    it("rejects a rewrite that replaces the idea with showy prose", () => {
      const check = compareImprovedExample(
        "I visited Samarkand with my friend.",
        "During my unforgettable journey across the breathtaking ancient city of Samarkand, I had the privilege of exploring its majestic monuments.",
      );
      expect(check.meaningChanged || check.tooElaborate).toBe(true);

      const { report } = gate(
        withIssue({
          improved_example: {
            original: "Last year I have went to Samarkand with my friend",
            improved: "During an unforgettable journey across the breathtaking ancient city of Samarkand, I had the privilege of exploring magnificent architecture alongside a companion.",
          },
        }),
      );
      expect(report.passed).toBe(false);
    });

    it("rejects an improved version about something else entirely", () => {
      const { report } = gate(
        withIssue({ improved_example: { original: "Last year I have went to Samarkand with my friend", improved: "Social media can be a distraction for teenagers." } }),
      );
      expect(report.violations.map((v) => v.code)).toContain("improved_example_changes_meaning");
    });
  });

  describe("Test C — no pronunciation claims from a transcript", () => {
    it("rejects an issue filed under pronunciation", () => {
      expect(codes(withIssue({ criterion: "pronunciation" }))).toContain("reject:pronunciation_claim");
    });

    it("rejects pronunciation claims hidden in other feedback text", () => {
      const evaluation = withIssue({ why_it_matters: "You mispronounce 'th' as 's', which confuses listeners." });
      expect(codes(evaluation)).toContain("reject:pronunciation_claim");
      expect(makesPronunciationClaim("Your accent is very clear.")).toBe(true);
      expect(makesPronunciationClaim("Your intonation is flat when you list ideas.")).toBe(true);
    });

    it("recognises the NOUN too: 'pronunciation' and 'mispronunciation' (the pattern once matched only 'pronounce…')", () => {
      for (const text of [
        "Your pronunciation of 'went' is unclear.",
        "Your pronunciation is good.",
        "Work on your pronunciation of long vowels.",
        "Mispronunciation of 'th' sounds makes you hard to follow.",
        "You mispronounced the word.",
      ]) {
        expect(makesPronunciationClaim(text), text).toBe(true);
      }
      expect(codes(withIssue({ why_it_matters: "Your pronunciation is very clear." }))).toContain("reject:pronunciation_claim");
      // Still allowed: saying it was not assessed.
      expect(makesPronunciationClaim("Pronunciation cannot be judged from a transcript.")).toBe(false);
      expect(makesPronunciationClaim("We did not assess pronunciation.")).toBe(false);
    });

    it("allows saying that pronunciation was not assessed", () => {
      expect(makesPronunciationClaim("Pronunciation was not assessed because we only have a transcript.")).toBe(false);
      const evaluation = makeEvaluation({ overall_summary: "Clear answer. Pronunciation cannot be judged from text." });
      expect(gate(evaluation).report.passed).toBe(true);
    });
  });

  describe("Test D — generic feedback is rejected unless it is specific", () => {
    it("rejects generic problem statements without evidence in the text", () => {
      expect(codes(withIssue({ problem: "You need to improve your grammar." }))).toContain("reject:generic_feedback");
      expect(codes(withIssue({ how_to_fix: "Use more advanced vocabulary." }))).toContain("reject:generic_feedback");
    });

    it("accepts the same words when they name the specific problem", () => {
      expect(gate(withIssue({ how_to_fix: "Practise more with 'have gone' and 'have seen' before your next answer." })).report.passed).toBe(true);
      expect(isGeneric("Speak more fluently.")).toBe(true);
      expect(isGeneric("Link your ideas with 'however' and 'as a result'.")).toBe(false);
    });

    it("rejects a generic retry focus", () => {
      const evaluation = makeEvaluation();
      evaluation.retry_focus[0].objective = "Give more details";
      expect(codes(evaluation)).toContain("reject:generic_feedback");
    });
  });

  describe("Test E — retry focus must come from an identified weakness", () => {
    it("rejects a focus pointing at an issue that does not exist", () => {
      const evaluation = makeEvaluation();
      evaluation.retry_focus[0].addresses_issue = 7;
      expect(codes(evaluation)).toContain("reject:retry_focus_unlinked");
    });

    it("aligns the focus criterion with its linked issue", () => {
      const evaluation = makeEvaluation();
      evaluation.retry_focus[0].criterion = "fluency_coherence";
      const { result, report } = gate(evaluation);
      expect(report.passed).toBe(true);
      expect(result.retry_focus[0].criterion).toBe("grammar");
    });

    it("keeps focus links correct when issues are reordered by severity", () => {
      const evaluation = makeEvaluation();
      evaluation.issues.reverse(); // medium first, high second
      evaluation.retry_focus[0].addresses_issue = 1; // the high-severity grammar issue
      const { result } = gate(evaluation);
      expect(result.issues[0].severity).toBe("high");
      expect(result.issues[result.retry_focus[0].addresses_issue].criterion).toBe("grammar");
    });
  });

  it("rejects duplicated issues", () => {
    const evaluation = makeEvaluation();
    evaluation.issues[1] = { ...evaluation.issues[0], severity: "medium" };
    expect(codes(evaluation)).toContain("reject:duplicate_issue");
  });

  it("drops invalid task-coverage entries and an unexpected retry review", () => {
    const evaluation = makeEvaluation({
      task_coverage: [
        { prompt_index: 1, status: "covered", note: "ok" },
        { prompt_index: 1, status: "covered", note: "duplicate" },
        { prompt_index: 9, status: "covered", note: "out of range" },
      ],
      retry_review: { objectives: [], summary: "Invented review." },
    });
    const { result, report } = gate(evaluation);
    expect(report.passed).toBe(true);
    expect(result.task_coverage).toHaveLength(1);
    expect(result.retry_review).toBeNull();
  });

  it("warns (but does not reject) when a retry has no retry review", () => {
    expect(codes(makeEvaluation(), { hasPreviousAttempt: true })).toEqual(["warn:missing_retry_review"]);
  });
});
