import "server-only";
import { EVALUATION_SCHEMA_VERSION } from "@/domain/evaluation/schema";

/**
 * Evaluation methodology versions. Every stored evaluation records these.
 *
 * Bump EVALUATOR_VERSION whenever the prompt, the input given to the model,
 * or the post-processing logic changes in a way that could change scores.
 * (The stored `prompt_hash` also catches prompt edits that forgot a bump.)
 * Rubric versions live with each rubric in ./rubrics.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/1.0.0";

export { EVALUATION_SCHEMA_VERSION };
