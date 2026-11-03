import {
  evaluationResultV1Schema,
  evaluationResultV2Schema,
  type EvaluationResultV1,
  type LegacyEvaluationResult,
} from "./schema";
import { multilevelResultSchema, type MultilevelResult } from "./multilevel/result";

/** A stored evaluation as the app reads it: the current Multilevel result, or an older analytic one. */
export type StoredEvaluation = MultilevelResult | LegacyEvaluation;
export type LegacyEvaluation = LegacyEvaluationResult & { kind: "legacy" };

/** Anything the next attempt can be asked to focus on: both generations carry the same two fields. */
export interface RetryFocusItem {
  objective: string;
  success_check: string;
}

/**
 * Parse an evaluation stored with any schema version for display. The stored row (and its version metadata) is never
 * modified. Schema 1–2 rows are old analytic results: they are shown as "scored with an older method" and never
 * converted into a band. Returns null if the stored JSON is unreadable.
 */
export function parseStoredEvaluation(schemaVersion: number, data: unknown): StoredEvaluation | null {
  if (schemaVersion === 3) {
    const parsed = multilevelResultSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }
  if (schemaVersion === 2) {
    const parsed = evaluationResultV2Schema.safeParse(data);
    return parsed.success ? { ...parsed.data, kind: "legacy" } : null;
  }
  if (schemaVersion === 1) {
    const parsed = evaluationResultV1Schema.safeParse(data);
    return parsed.success ? { ...upgradeV1(parsed.data), kind: "legacy" } : null;
  }
  return null;
}

export function isMultilevel(evaluation: StoredEvaluation): evaluation is MultilevelResult {
  return evaluation.kind === "multilevel";
}

function upgradeV1(v1: EvaluationResultV1): LegacyEvaluationResult {
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
