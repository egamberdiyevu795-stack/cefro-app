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
 *
 * - speaking-evaluator/2.4.1 — Stage 3B. Gate only: the pronunciation-claim check matched "pronounce…" but not
 *   the noun "pronunciation" / "mispronunciation", so "Your pronunciation is good" passed. Found while building the
 *   real-pipeline checks. No real Gemini output in four runs contained either word in student-facing text, so
 *   nothing the model produced would have been rejected differently; prompt unchanged.
 *
 * Stage 3 (no evaluator version change; what the model is asked and how results are judged did not
 * change): `prompt_hash` now also covers the user-message template, the revision template and the
 * result schema, and is stored with an "h2:" prefix (prompt-fingerprint.ts). Hashes written before
 * this are bare hex and identify only version + system prompt; they are not comparable with h2 hashes.
 *
 * - speaking-evaluator/3.0.0 — Multilevel (UZBMB) band evaluation, schema v3. The model no longer scores: it judges
 *   each question (on_topic / partial / missing / off_topic) and each feature against the official Question 7
 *   descriptors (rubric multilevel-q7/2.0.0), with strictly verified quotes. The 0–5 band is computed in code
 *   (domain/evaluation/multilevel/band-scoring.ts). Pronunciation and pausing come from an optional audio step
 *   (AUDIO_ASSESSMENT); without it the result is provisional. 1-based question numbering throughout. New quality gate.
 * - speaking-evaluator/3.1.0 — First live run of the Part 2 band anchors (advice task): question statuses 7/7
 *   correct, but language over-rated by one level (a B1 answer scored band 4, a B2 answer band 5). Prompt gains a
 *   calibration section: what counts as simple vs complex grammar, everyday vs topic vocabulary, simple vs B2 linkers,
 *   "accuracy is not range", choose the lower level when in doubt, and fluency from a transcript capped near the
 *   language level. New prompt hash; scoring, schema and gate unchanged.
 * - speaking-evaluator/3.2.0 — Second anchor run (3.1.0): 6/7, A2 and A4 fixed, but the below-B1 anchor rose to band 2
 *   (vocabulary, fluency and cohesion rated B1 although the notes said "very simple" and "only simple linkers"): the
 *   3.1.0 rules were read as floors. Prompt now says they only cap a level, gives concrete below_B1 signals per
 *   feature, says what B1 needs, and caps transcript-only fluency at the higher of grammar and vocabulary.
 * - speaking-evaluator/3.3.0 — Owner decisions after the 3.2.0 runs (rubric multilevel-q7/2.1.0):
 *   grammar is below_B1 when basic errors in simple structures recur systematically (3+ instances across 2+ kinds);
 *   new question status "minimal" (bare one-sentence answer, not on topic); band 5 only with grammar AND vocabulary
 *   above_B2; under 30 words = band 0 (too_short); fluency strictly lowest = biggest fix and first retry focus;
 *   feedback written one level above the student (no C1 for B1 students), missing-question model answers give a
 *   should / shouldn't frame instead of an invented opinion; the gate allows pronunciation practice tips in
 *   instruction fields but still blocks judgements of the student's pronunciation.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/3.3.0";

export { EVALUATION_SCHEMA_VERSION };
