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
 * - speaking-evaluator/2.1.0 — Gemini provider added. Shared post-processing
 *   changed: markdown-fenced JSON is accepted, and a provider-reported unusable
 *   response (empty/truncated) gets the same single regeneration as invalid
 *   JSON. The prompt, rubric, schema and quality gate are unchanged, so the
 *   prompt hash is identical to 2.0.0. Provider and model are recorded
 *   separately from the evaluator version.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/2.1.0";

export { EVALUATION_SCHEMA_VERSION };
