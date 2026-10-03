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
 * - speaking-evaluator/2.2.0 — Calibrated on the first real Gemini runs
 *   (docs/AI_EVALUATION_QUALITY.md). Prompt: keep the student's stance, no
 *   replacement examples, "original" rules for missing-content issues, no
 *   invented benchmark figures, retry focus must be the direct fix. Quality gate:
 *   improved-example checks no longer reject good corrections (word-swap fixes,
 *   short statements gaining a reason clause) and repair unrelated originals
 *   for missing-content issues instead of regenerating. New prompt hash.
 * - speaking-evaluator/2.3.0 — From the third real Gemini run. Gate: a retry review may not
 *   mark a numeric target ("at least 90 seconds") achieved when the measured value misses it
 *   (repaired to partly_achieved). Metrics gain repeatedWords; the prompt tells the evaluator
 *   to take repetition counts from the metrics. New prompt hash.
 * - speaking-evaluator/2.4.0 — Fourth real Gemini run. Gate rejects student-facing text that
 *   contains internal field names (a live issue read "(timeUsedRatio: 0.73)"); prompt asks for
 *   plain-language numbers. New prompt hash.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/2.4.0";

export { EVALUATION_SCHEMA_VERSION };
