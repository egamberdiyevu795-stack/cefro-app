import "server-only";
import { EVALUATION_SCHEMA_VERSION } from "@/domain/evaluation/schema";

/**
 * Evaluation methodology versions. Every stored evaluation records these.
 *
 * Bump EVALUATOR_VERSION whenever the prompt, the input given to the model,
 * the quality gate, or post-processing changes in a way that could change
 * results. (The stored `prompt_hash` also catches prompt edits that forgot a
 * bump.) Rubric versions live with each rubric in ./rubrics.
 *
 * History
 * - speaking-evaluator/1.0.0 — Stage 1: prompt v1, schema v1, normalisation only.
 * - speaking-evaluator/2.0.0 — Stage 2: prompt v2 (prioritisation, evidence
 *   basis, task coverage, linked retry focus, meaning-preserving examples),
 *   schema v2, quality gate with one controlled regeneration.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/2.0.0";

export { EVALUATION_SCHEMA_VERSION };
