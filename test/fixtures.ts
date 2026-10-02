import type { EvaluationResult } from "@/domain/evaluation/schema";

/** A schema-valid evaluation result for tests. Override fields as needed. */
export function makeEvaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  const criterion = (score: number) => ({ assessable: true, score, level: "B1" as const, justification: "Grounded reason." });
  return {
    overall_level: "B1+",
    overall_summary: "Clear answer with limited development.",
    criteria: {
      fluency_coherence: criterion(6),
      grammar: criterion(5),
      vocabulary: criterion(6),
      pronunciation: { assessable: false, score: null, level: null, justification: "Transcript only." },
      task_achievement: criterion(5),
    },
    strengths: [{ title: "Clear opinion", detail: "You state your view early.", evidence_quote: "I think" }],
    issues: [
      {
        criterion: "vocabulary",
        severity: "high",
        problem: "You repeat 'I think' four times.",
        evidence_quotes: ["I think"],
        why_it_matters: "It makes your range look narrow.",
        how_to_fix: "Use 'In my view' or 'I believe'.",
        improved_example: { original: "I think phones are good.", improved: "In my view, phones help us stay in touch." },
      },
    ],
    retry_focus: [
      { objective: "Use 'I think' at most once", success_check: "Count it when you listen back.", criterion: "vocabulary" },
    ],
    retry_review: null,
    reliability_note: null,
    ...overrides,
  };
}
