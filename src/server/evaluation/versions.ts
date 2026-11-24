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
 * - speaking-evaluator/3.4.0 — First 3.3.0 live run (high thinking, ×3): anchors 7/7 on every run, but S03/S07/S12 fell
 *   to band 0 (fluency and cohesion both rated below_B1 → mean 0.5 → below B1). The 3.2.0 below-B1 cues contradicted
 *   the official descriptors: simple linkers ARE the B1 cohesion descriptor, and short sentences are not a fluency
 *   problem (pausing / false starts / reformulations are). Cues realigned. Also: no level codes in student text,
 *   concrete fluency techniques (5 of 7 regenerations were generic fluency advice), no intonation talk.
 * - speaking-evaluator/3.5.0 — Part 2 picture. The task can show a picture (task v2 of the advice task); the user
 *   message gives the model what it shows (from its alt text), and the system prompt gains the picture rule: describing
 *   the picture does NOT answer any question, even when it uses the topic's words ("the man is giving advice to the
 *   girl"). New anchor A0-picture-only (band 0). Scoring, schema and gate unchanged; new prompt hash.
 * - (no bump) Part 1.1 / 1.2 added (docs/part1-plan.md): per-rubric levels, features and question statuses, rubrics
 *   multilevel-q1-3/1.0.0 and multilevel-q4-6/1.0.0, and a Part 1 prompt of its own. Part 2's prompt, provider schema,
 *   scoring and gate results are byte-for-byte unchanged (tested: same prompt hash, same JSON schema), so stored Part 2
 *   attempts keep their methodology; Part 1 results are told apart by their rubric version.
 * - speaking-evaluator/3.6.0 — Transcript with mistakes and better versions (docs/v1-plan.md §3.3, step 5), Parts 1.1, 1.2 and 2.
 *   The model also returns "sentence_fixes": up to 8 of the student's own sentences with one mistake each (you_said /
 *   better / why). Prompt rules added to the Part 1 and Part 2 prompts (NOT live-tested); the quality gate drops any item
 *   that is not word for word in the transcript, that adds an idea or is more than a few words longer, that has more than
 *   one mistake, or that is about pauses or pronunciation (domain/evaluation/sentence-fixes.ts). Scoring, rubrics and the
 *   stored schema version are unchanged: the list is optional in stored results, so results from 3.5.0 and earlier have
 *   none and render as before. New prompt hash and provider schema (test fixtures updated).
 * - speaking-evaluator/3.7.0 — First live run on gemini-3.8-flash (3.6.0, high thinking): Part 2 anchors 7/8 exact on
 *   every run, but A0-below-b1 gave band 2 in 1 of 5 runs (grammar below_B1, vocabulary B1 justified by quotes that
 *   themselves had basic mistakes: "know many thing", "work in market"). One prompt rule (docs/feedback-review.md
 *   issue 5, option a): when grammar is below_B1, vocabulary B1 needs correct quotes. It only applies to answers whose
 *   grammar is already below_B1, so no other anchor can move. Scoring, schema and gate unchanged; new prompt hash.
 */
/* - speaking-evaluator/3.8.0 — Feedback wording (docs/feedback-review.md issues 1–4, seen on gemini-3.8-flash in 4, 19,
 *   15 and 3 of 24 runs). One prompt revision for Parts 1.1, 1.2 and 2 (prompts/feedback-rules.ts): each how_to_improve /
 *   how_to_check is about ONE issue, the first error's rule for grammar and vocabulary; it describes a skill and never
 *   requires a set phrase; examples use another topic than the task's; transcript-only fluency text never claims
 *   smoothness, pauses, hesitation or speed. The provider schema's how_to_improve description says the same. These rules
 *   change only what the model writes, not how it judges a level; scoring and gate unchanged; new prompt hash and schema.
 *   Part 1 prompt only: the 3.7.0 vocabulary rule for its own ladder (when grammar is at the lower level, vocabulary at the
 *   target needs correct quotes). Live (gemini-3.8-flash): Part 2 anchors 23/23 exact, Part 1 anchors 6/6 exact,
 *   issues 1–3 at 0 (docs/feedback-review.md, "Evaluator 3.8.0").
 * - speaking-evaluator/3.8.1 — Part 1.2 only (owner decision 2026-11-15): Question 4 is the exam's own "What can you see in these
 *   pictures?", so describing only one picture is partial and comparing is no longer required. One clause of the Part 1 prompt's
 *   "partial" rule changed; Parts 1.1 and 2 prompts unchanged. NOT live-tested: rerun the Part 1.2 anchors before Part 1.2 goes live.
 */
export const EVALUATOR_VERSION = "speaking-evaluator/3.8.1";

/**
 * Version of the Part 3 evaluation (prompt, gate and post-processing; argument-evaluator.ts). Stored with every
 * Part 3 result, next to its own schema version (`Q8_EVALUATION_SCHEMA_VERSION`) and prompt hash (q8-fingerprint.ts).
 *
 * History
 * - argument-evaluator/0.1.0 — Part 3 built in mock mode (docs/part3-plan.md): judgements + quotes, Q8 quality gate
 *   with one regeneration, prompt overlap + dependence decision, deterministic 0–6 band, retry goals. The prompt is
 *   written but NOT live-tested: no model has been called with it. The real attempt flow stores results with this
 *   version; the live anchor run (plan section 8) must happen before `PART_LIVE["3"]` is switched on.
 * - argument-evaluator/0.2.0 — Sentences with mistakes and better versions (docs/v1-plan.md §3.3, step 5): the model also
 *   returns "sentence_fixes" (you_said / better / why, up to 8), with the same rules and code checks as Part 2's. Still NOT
 *   live-tested. The stored Part 3 schema version is unchanged (the list is optional, older results have none).
 * - argument-evaluator/0.3.0 — First live anchor run (2026-11-15, gemini-3.8-flash): 7 of 11 exact, all within one band;
 *   weak answers that read the lists scored one band low. Prompt rules: a short simple reason counts as "developed"; one
 *   developed point means at most "heavily_dependent"; reading the lists never lowers a language level (dependence
 *   already judges it). Part 3 is live by default from this version (docs/part3-topic-bank.md).
 * - argument-evaluator/0.4.0 — Second live anchor run (2026-11-23, gemini-3.8-flash, 0.3.0): 18 of 21 exact; the top
 *   was over-rated (cars-A4 band 5 for B2 conditionals and "on the one hand" linkers; phones-A5 and tax-A5 band 6 for
 *   error-free standard C1 phrases), and all three band-0 anchors were regenerated (coherent_and_sustained false with
 *   own_development, rejected by the gate), taking 178–278 s. Prompt: a B2 / C1 / above_C1 calibration list (as Part 2
 *   has for B1 / B2), "error-free C1 is still C1", fluency never above_C1 without audio; and the gate's rule stated in
 *   the prompt: not coherent and sustained is never own_development. Scoring, schema and gate unchanged.
 */
export const ARGUMENT_EVALUATOR_VERSION = "argument-evaluator/0.4.0";

export { EVALUATION_SCHEMA_VERSION };
