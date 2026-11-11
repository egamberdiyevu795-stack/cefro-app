import {
  evaluationResultV1Schema,
  evaluationResultV2Schema,
  type EvaluationResultV1,
  type LegacyEvaluationResult,
} from "./schema";
import { multilevelResultSchema, type MultilevelResult } from "./multilevel/result";
import { q8ResultSchema, type Q8Result } from "./q8/result";

/** A stored evaluation as the app reads it: the current Multilevel result (Part 1/2 or Part 3), or an older analytic one. */
export type StoredEvaluation = MultilevelResult | Q8Result | LegacyEvaluation;
export type LegacyEvaluation = LegacyEvaluationResult & { kind: "legacy" };

/**
 * Part 3 results (`kind: "multilevel_q8"`) are stored with their own schema version, so a stored row says which Zod
 * schema reads it; Part 1/2 rows keep version 3 and are untouched.
 */
export const Q8_EVALUATION_SCHEMA_VERSION = 4;

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
  if (schemaVersion === Q8_EVALUATION_SCHEMA_VERSION) {
    const parsed = q8ResultSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }
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

/** A Part 3 (official Question 8) result. */
export function isMultilevelQ8(evaluation: StoredEvaluation): evaluation is Q8Result {
  return evaluation.kind === "multilevel_q8";
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
