import { describe, expect, it } from "vitest";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { FIXTURE_TRANSCRIPT, makeModelOutput } from "../../../test/fixtures";
import { applyQualityGate, findPronunciationClaim, findUnmetTarget, isGeneric } from "./quality-gate";

const context = { transcript: FIXTURE_TRANSCRIPT, questionCount: 3, hasPreviousAttempt: false };

function gate(output: MultilevelModelOutput, overrides: Partial<typeof context> & { metrics?: { speakingSeconds: number; wordCount: number } } = {}) {
  return applyQualityGate(output, { ...context, ...overrides });
}
function codes(output: MultilevelModelOutput, overrides: Partial<typeof context> = {}) {
  return gate(output, overrides).report.violations.map((v) => `${v.severity}:${v.code}`);
}

describe("quality gate (Multilevel)", () => {
  it("passes a clean, evidence-based output unchanged", () => {
    const { result, report } = gate(makeModelOutput());
    expect(report).toEqual({ passed: true, violations: [] });
    expect(result).toEqual(makeModelOutput());
  });

  describe("question numbering is 1-based and complete", () => {
    it("rejects 0-based ids", () => {
      const output = makeModelOutput();
      output.questions = output.questions.map((q) => ({ ...q, id: q.id - 1 }));
      expect(codes(output)).toContain("reject:question_ids_invalid");
    });

    it("rejects a missing or duplicated question", () => {
      const missing = makeModelOutput();
      missing.questions = missing.questions.slice(0, 2);
      expect(codes(missing)).toContain("reject:question_ids_invalid");
      const duplicated = makeModelOutput();
      duplicated.questions[2] = { ...duplicated.questions[2], id: 2 };
      expect(codes(duplicated)).toContain("reject:question_ids_invalid");
    });

    it("sorts questions by id", () => {
      const output = makeModelOutput();
      output.questions.reverse();
      expect(gate(output).result.questions.map((q) => q.id)).toEqual([1, 2, 3]);
    });
  });

  describe("evidence must be the student's exact words", () => {
    it("rejects a feature whose every quote is not in the transcript (including a 'corrected' quote)", () => {
      const output = makeModelOutput();
      output.features.grammar.evidence = ["Last year I have gone to Samarkand"];
      expect(codes(output)).toContain("reject:feature_evidence_fabricated");
    });

    it("keeps verified quotes and drops the rest with a warning", () => {
      const output = makeModelOutput();
      output.features.grammar.evidence = ["I have went to Samarkand", "I have visited Bukhara"];
      const { result, report } = gate(output);
      expect(report.passed).toBe(true);
      expect(result.features.grammar.evidence).toEqual(["I have went to Samarkand"]);
      expect(report.violations.map((v) => v.code)).toContain("quote_not_found");
    });

    it("is strict: no ellipsis gaps and no tolerated differing word in long quotes", () => {
      const output = makeModelOutput();
      output.features.vocabulary.evidence = ["I think … talk with friends"];
      expect(codes(output)).toContain("reject:feature_evidence_fabricated");
      const long = makeModelOutput();
      long.features.vocabulary.evidence = ["Last year I have go to Samarkand with my friend and we used maps"];
      expect(codes(long)).toContain("reject:feature_evidence_fabricated");
    });

    it("ignores case, punctuation and fillers", () => {
      const output = makeModelOutput();
      output.features.grammar.evidence = ["i HAVE went, to samarkand"];
      expect(gate(output).report.passed).toBe(true);
    });

    it("clears unverifiable question evidence, errors and strengths", () => {
      const output = makeModelOutput();
      output.questions[0].evidence = "we always chat on Telegram";
      output.errors.push({ quote: "nobody helps", correction: "nobody will help", type: "grammar" });
      output.strengths.push({ feature: "fluency", quote: "made-up words", note: "x" });
      const { result, report } = gate(output);
      expect(report.passed).toBe(true);
      expect(result.questions[0].evidence).toBe("");
      expect(result.errors).toHaveLength(1);
      expect(result.strengths).toHaveLength(1);
    });
  });

  it("drops a strength for a feature judged below B2", () => {
    const output = makeModelOutput();
    output.strengths = [{ feature: "grammar", quote: "I think phones are good", note: "Correct sentence." }];
    const { result, report } = gate(output);
    expect(result.strengths).toEqual([]);
    expect(report.violations.map((v) => v.code)).toContain("strength_below_b2");
  });

  it("requires a concrete fix for every assessed feature", () => {
    const empty = makeModelOutput();
    empty.features.cohesion.how_to_improve = " ";
    expect(codes(empty)).toContain("reject:missing_fix");
    const generic = makeModelOutput();
    generic.features.vocabulary.how_to_improve = "Use more advanced vocabulary.";
    expect(codes(generic)).toContain("reject:generic_feedback");
  });

  it("resets a pronunciation level from the transcript evaluator and rejects pronunciation talk elsewhere", () => {
    const assessed = makeModelOutput();
    assessed.features.pronunciation = { level: "B1", evidence: [], note: "x", how_to_improve: "y", how_to_check: "z" };
    const { result, report } = gate(assessed);
    expect(result.features.pronunciation.level).toBe("not_assessed");
    expect(report.violations.map((v) => `${v.severity}:${v.code}`)).toContain("warn:pronunciation_from_transcript");

    const claim = makeModelOutput();
    claim.features.fluency.note = "Your pronunciation of 'Samarkand' was unclear.";
    expect(codes(claim)).toContain("reject:pronunciation_claim");
  });

  it("rejects internal field names in student-facing text", () => {
    const output = makeModelOutput();
    output.features.fluency.note = "You spoke slowly (wordsPerMinute: 70).";
    expect(codes(output)).toContain("reject:internal_field_leak");
  });

  it("warns when an answer is marked memorised despite two answered questions", () => {
    const output = makeModelOutput({ memorized_or_irrelevant: true });
    output.questions[1].status = "on_topic";
    expect(codes(output)).toContain("warn:memorized_conflict");
  });

  it("removes a retry review on a first attempt and warns when a retry has none", () => {
    const review = { objectives: [], summary: "Same." };
    const first = gate(makeModelOutput({ retry_review: review }));
    expect(first.result.retry_review).toBeNull();
    expect(codes(makeModelOutput(), { hasPreviousAttempt: true })).toContain("warn:missing_retry_review");
  });

  it("downgrades 'achieved' when the measured value misses an explicit target", () => {
    const output = makeModelOutput({
      retry_review: { objectives: [{ objective: "Speak for at least 90 seconds", outcome: "achieved", evidence: "You spoke longer." }], summary: "Better." },
    });
    const { result, report } = gate(output, { hasPreviousAttempt: true, metrics: { speakingSeconds: 88, wordCount: 150 } });
    expect(result.retry_review?.objectives[0].outcome).toBe("partly_achieved");
    expect(report.passed).toBe(true);
  });
});

describe("helpers", () => {
  it("findUnmetTarget understands 'at least' and 'over', and ignores rates", () => {
    const measured = { speakingSeconds: 88, wordCount: 152 };
    expect(findUnmetTarget("Speak for at least 90 seconds.", measured)).not.toBeNull();
    expect(findUnmetTarget("Use over 151 words.", measured)).toBeNull();
    expect(findUnmetTarget("Reach at least 130 words per minute.", measured)).toBeNull();
  });

  it("findPronunciationClaim names the sentence and ignores 'cannot be assessed'", () => {
    expect(findPronunciationClaim("Good. Pronounce the final -s clearly.")).toBe("Pronounce the final -s clearly.");
    expect(findPronunciationClaim("Pronunciation cannot be assessed from a transcript.")).toBeNull();
  });

  it("isGeneric flags advice with no specifics", () => {
    expect(isGeneric("Improve your grammar")).toBe(true);
    expect(isGeneric("Use 'however' to contrast two ideas")).toBe(false);
  });
});
