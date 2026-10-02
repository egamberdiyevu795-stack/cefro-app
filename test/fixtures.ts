import type { EvaluationResult } from "@/domain/evaluation/schema";

/** Transcript that matches the quotes used by makeEvaluation(). */
export const FIXTURE_TRANSCRIPT =
  "I think phones are good. I think they help us talk with friends every day. Last year I have went to Samarkand with my friend and we used maps.";

/** A schema-valid, quality-gate-clean evaluation result for tests. Override fields as needed. */
export function makeEvaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  const criterion = (score: number) => ({ assessable: true, score, level: "B1" as const, justification: "Grounded reason." });
  return {
    overall_level: "B1+",
    overall_summary: "Clear answer with limited development.",
    criteria: {
      fluency_coherence: criterion(6),
      grammar: criterion(5),
      vocabulary: criterion(6),
      pronunciation: { assessable: false, score: null, level: null, justification: "Not assessed from a transcript." },
      task_achievement: criterion(5),
    },
    task_coverage: [
      { prompt_index: 0, status: "covered", note: "You talk about using phones with friends." },
      { prompt_index: 1, status: "partly_covered", note: "You mention only advantages." },
      { prompt_index: 2, status: "not_covered", note: "You did not talk about schools." },
    ],
    strengths: [{ title: "Clear opinion", detail: "You state your view early.", evidence_quote: "I think phones are good" }],
    issues: [
      {
        criterion: "grammar",
        severity: "high",
        evidence_basis: "transcript_quote",
        problem: "After 'have' you used 'went' instead of the past participle 'gone'.",
        evidence_quotes: ["I have went to Samarkand"],
        why_it_matters: "Wrong verb forms with 'have' are noticeable and lower your grammar score.",
        how_to_fix: "When you use 'have' for experiences, use the third form: have gone, have seen, have visited.",
        improved_example: {
          original: "Last year I have went to Samarkand with my friend",
          improved: "Last year I went to Samarkand with my friend",
        },
      },
      {
        criterion: "vocabulary",
        severity: "medium",
        evidence_basis: "transcript_quote",
        problem: "You start two sentences with 'I think'.",
        evidence_quotes: ["I think phones are good", "I think they help us"],
        why_it_matters: "Repeating the same opener makes your range look narrow.",
        how_to_fix: "Use 'In my view' or 'I believe' for your second opinion.",
        improved_example: { original: "I think they help us talk with friends every day", improved: "I believe they help us talk with friends every day" },
      },
    ],
    retry_focus: [
      {
        objective: "Use 'have' + third form (have gone, have seen) when you talk about experiences",
        success_check: "Every 'have' in your answer is followed by a third-form verb.",
        criterion: "grammar",
        addresses_issue: 0,
      },
    ],
    retry_review: null,
    reliability_note: null,
    ...overrides,
  };
}

/** Minimal bytes with a valid WebM (EBML) header, for upload tests. */
export function fakeWebm(bytes = 64): Buffer {
  const data = Buffer.alloc(bytes, 1);
  data.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return data;
}
