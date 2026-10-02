import {
  evaluationResultV1Schema,
  evaluationResultV2Schema,
  type EvaluationResult,
  type EvaluationResultV1,
} from "./schema";

/**
 * Parse an evaluation stored with any schema version into the current shape
 * for display. The stored row (and its version metadata) is never modified;
 * fields that did not exist in older versions get neutral defaults.
 * Returns null if the stored JSON is unreadable.
 */
export function parseStoredEvaluation(schemaVersion: number, data: unknown): EvaluationResult | null {
  if (schemaVersion === 2) {
    const parsed = evaluationResultV2Schema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }
  if (schemaVersion === 1) {
    const parsed = evaluationResultV1Schema.safeParse(data);
    return parsed.success ? upgradeV1(parsed.data) : null;
  }
  return null;
}

function upgradeV1(v1: EvaluationResultV1): EvaluationResult {
  const issues = v1.issues.slice(0, 4).map((issue) => ({
    ...issue,
    evidence_basis: issue.evidence_quotes.length > 0 ? ("transcript_quote" as const) : ("task_requirement" as const),
  }));
  return {
    ...v1,
    task_coverage: [],
    strengths: v1.strengths.slice(0, 3),
    issues,
    retry_focus: v1.retry_focus.slice(0, 2).map((focus) => {
      const index = issues.findIndex((issue) => issue.criterion === focus.criterion);
      return { ...focus, addresses_issue: Math.max(0, index) };
    }),
  };
}
