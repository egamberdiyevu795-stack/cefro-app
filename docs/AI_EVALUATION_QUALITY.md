# AI evaluation quality (B2 Part 2)

This document describes how CEFRO evaluates spoken answers, how evaluation
quality is checked, and what we know about its weaknesses. It is a working
document: add a row to the [findings log](#findings-log) whenever a review
changes the prompt, schema, gate or rubric.

> **Status:** the Gemini evaluation provider has been exercised against the **real Gemini API**
> (`gemini-3.8-flash`) on 14 synthetic B2 Part 2 answers over five runs, and calibrated on what
> those runs showed (see [Real Gemini validation](#real-gemini-validation)). **Not validated:**
> OpenAI transcription, the Anthropic evaluator, real student speech, and the full
> microphone → OpenAI → Gemini pipeline. 14 synthetic answers are a small sample, not production
> validation.

## 1. Methodology

**IDENTIFY → EXPLAIN → IMPROVE → RETRY.** After reading feedback, a student
should think *"I know exactly what to fix in my next answer"*, not *"there
are 17 things wrong with me"*.

| Step | What the evaluator produces | Where it is enforced |
| --- | --- | --- |
| Identify | 1–4 issues (usually 2–3), most important first | Prompt §1, schema max 4, gate reorders by severity |
| Explain | `problem` naming the exact form/habit, `evidence_quotes` copied from the transcript, `why_it_matters` | Prompt §2, gate: evidence matching + generic-feedback check |
| Improve | `how_to_fix` strategy + `improved_example` (student's own sentence → corrected) | Prompt §2–3, gate: meaning preservation + length |
| Retry | 1–2 `retry_focus` items, each linked to an issue (`addresses_issue`), with a `success_check` | Prompt §4, gate: link validation |
| Review | On retries: `retry_review` (achieved / partly / not) with evidence from the new answer | Prompt §7 |

Issue priority (prompt §1):

1. Grammar errors that change meaning or recur
2. Weak development (no reasons/examples, skipped task points, stopping early)
3. Repetition / limited vocabulary when it clearly weakens the answer
4. Fluency and organisation
5. Anything else

### Evidence vs inference

Every issue declares its `evidence_basis`:

- `transcript_quote` — words the student said (quotes required and verified);
- `speech_metric` — a number from the deterministic metrics (time used,
  words per minute, fillers, repeated phrases);
- `task_requirement` — a task point the answer did not address.

**Pronunciation is never assessed** by the v2 evaluator. It only sees a
transcript, so it cannot support pronunciation claims. The criterion is
forced to `assessable: false`, and the gate rejects pronunciation, accent,
intonation or sound claims anywhere in student-facing text.

### Task-specific evaluation

The evaluator receives the question, the numbered task points, timings,
examiner-only guidance (`evaluatorGuidance` in the task content), the rubric,
speech metrics, the transcript, and on retries the previous transcript,
issues and focus. It returns `task_coverage` per task point
(covered / partly / not covered), which is shown to the student.

### Untrusted input

The transcript is the student's speech, and the evaluator treats it as data,
not instructions:

- the system prompt states this explicitly;
- angle brackets are escaped so a transcript cannot close its `<transcript>` section;
- sample S13 contains a prompt-injection attempt and has a hard live assertion
  that the level stays ≤ B1+.

## 2. Pipeline and quality checks

```
model output ─▶ Zod schema (v2) ─▶ quality gate ─▶ store
                    │ invalid           │ reject
                    └──────▶ one regeneration with a <revision_request> listing the problems
                                        │ still bad
                                        └──▶ attempt fails: evaluation_invalid_output / evaluation_quality_rejected
                                             (recording + transcript kept; student can "Try again")
```

The SDK turns enums, ranges and `minLength` in the JSON Schema into
*description hints*, so the API does not enforce them. Zod validation is the
real guard.

### Quality gate (`src/server/evaluation/quality-gate.ts`)

| Check | Severity | Action |
| --- | --- | --- |
| Quote not found in transcript (normalised, see below) | warn | Quote removed |
| `transcript_quote` issue left with no verified quote | **reject** | Regenerate |
| `improved_example.original` not in transcript | warn | Original blanked (the UI never shows an invented "you said") |
| Improved version keeps < 50% of the original's content words (< 10% for vocabulary issues, where swapping words is the fix) | **reject** | Regenerate |
| Improved version > 3× the original's length **and** ≥ 30 words (a short statement may gain a reason clause) | **reject** | Regenerate |
| Missing-content issue (`task_requirement`) whose "original" shares < 20% of its words with the improved text | warn | "original" dropped, so the UI never shows a misleading "you said → better" pair |
| Retry review marks a numeric target ("at least 90 seconds", "over 100 words") achieved when the measured value misses it | warn | Outcome downgraded to `partly_achieved`, measured value noted |
| Student-facing text contains an internal field name (`timeUsedRatio`, `wordsPerMinute`…) | **reject** | Regenerate |
| Pronunciation issue / pronunciation claim in feedback text | **reject** | Regenerate (saying it was *not assessed* is allowed) |
| Generic advice ("improve your grammar", "use more vocabulary", "give more details"…) with no quoted words/numbers | **reject** | Regenerate |
| Duplicate issues or retry focus (≥ 70% word overlap) | **reject** | Regenerate |
| Retry focus pointing at a non-existent issue | **reject** | Regenerate |
| Retry focus criterion ≠ linked issue criterion | warn | Aligned |
| Issues not ordered by severity | warn | Reordered (focus links remapped) |
| Invalid/duplicate task-coverage entries | warn | Removed |
| Retry review on a first attempt / missing on a retry | warn | Removed / recorded |
| Overall level far (> 3 sub-bands) from mean criterion score | warn | Recorded |
| Issue text > 450 words | warn | Recorded |

Score ranges, enums and list sizes are enforced by the schema before the gate runs.

**Evidence matching** (`src/domain/evaluation/evidence.ts`):

- ignores case, punctuation, curly vs straight quotes, and fillers (um/uh);
- `...` in a quote separates segments, which must appear in order;
- quotes of 8+ words may differ by one word (to absorb tiny copy differences);
- a corrected quote ("I have gone" for "I have went") never matches.

All warnings and rejected drafts are stored per evaluation in
`evaluations.quality_report`. `model_calls = 2` means the first draft was regenerated.

## 3. Transcription

- **Provider:** OpenAI `gpt-4o-transcribe` (`OPENAI_TRANSCRIPTION_MODEL`), language `en`, temperature 0.
- **Prompt:** asks for a verbatim transcript that keeps grammar mistakes,
  wrong verb forms, repetitions, false starts and hesitation sounds, and
  never corrects anything. For example, "He go to school every day" must stay
  as spoken.
- The prompt deliberately contains **no sample utterance**, because STT
  models can echo prompt text on silent audio (finding F2). As a second
  guard, a short transcript made almost entirely of prompt words is treated
  as `transcription_empty`.
- Fewer than 5 real words → `transcription_empty` ("we couldn't hear enough speech").
- 400/413/415 → `audio_unsupported` (re-record).
- 401/403 → `provider_not_configured`.
- 429 → `provider_rate_limited`.
- Timeout → `provider_timeout`.
- Uploads are also checked server-side: the declared type must match the
  file's magic bytes, and the size is capped at 20 MB (checked before the
  body is buffered).

**Unverified:** whether `gpt-4o-transcribe` really preserves learner errors
in practice. Models in this family are known to "smooth" disfluent speech. Run
`npm run eval:transcription` with `keep:` lines (see §6) before relying on it.
If it corrects errors, try `whisper-1` (configurable, no code change) and
record the result below.

### Gemini transcription: deliberately not implemented

Evaluation can run on Gemini; transcription stays on OpenAI (or the mock).
I checked whether Gemini could be added as a `TranscriptionProvider` and chose
not to, because the property CEFRO needs most cannot be shown from here:

- **Format:** the official SDK's type definitions list `audio/webm`, `audio/ogg`,
  `audio/mpeg`, `audio/wav`, `audio/aac`, `audio/flac` and others as audio input,
  so Chrome's WebM/Opus recordings are plausibly accepted. Safari's MP4/AAC is less clear.
  I couldn't read Google's documentation (blocked from the development sandbox), so
  size limits and exact format support are unconfirmed.
- **Fidelity is the real question, and it is untested.** General-purpose
  language models are known to tidy up speech when asked to transcribe:
  grammar fixed, hesitations dropped, repetitions merged, and
  text invented on silence. Our evaluation treats the transcript as evidence of errors, so a
  silently corrected transcript would hide exactly the mistakes the student needs to see
  ("He go to school" → "He goes to school"). A dedicated STT service is more likely to behave
  literally, but that is also unverified for `gpt-4o-transcribe` (see above).
- **No way to measure it now:** there is no key, and the Gemini API host is blocked from the
  sandbox.

So no `TRANSCRIPTION_PROVIDER=gemini` option exists. To add one properly: implement the
interface, then run `npm run eval:transcription` on real recordings with `ref:` and `keep:`
sidecars and compare word error rate and kept-error rate against the OpenAI provider.
Add it only if it preserves learner errors and handles silence (`*silence*` files).

**Consequence:** with only a Gemini key, the full microphone → transcription → evaluation
path cannot be validated. The evaluator can be validated on text (the 14 samples), and
transcription validation still needs OpenAI or another dedicated STT provider.

## 4. Comparison

`src/domain/speaking/comparison.ts` derives everything from the two stored
evaluations:

- **±1 point** on a criterion, or **one sub-band** overall (e.g. B1 → B1+),
  is labelled *slight*. It is never presented as progress on its own, because
  scores vary that much between runs on the same answer (measured: see
  [Real Gemini validation](#real-gemini-validation)).
- ≥ 2 points on a criterion is *clear*.
- **A verdict is "clear" only when a criterion moved by 2+ points.** The overall
  level alone cannot make it clear. Live evidence: the same transcript scored B2+ in one
  run and C1 (two sub-bands higher) in another while every criterion differed by exactly 1
  point. At the top of the scale one point is worth about two sub-bands, so the overall level
  exaggerates small changes there. Before this was fixed, such a retry would have been reported as
  "clearly better".
- **Verdicts:** clear improvement, slight improvement ("the difference is
  small"), about the same, mixed, slight decline ("within normal variation"),
  clear decline.
- The screen leads with whether the retry focus was achieved, then shows what
  improved, what is still weak, and what to practise next.
- When the two attempts were scored by different evaluator/rubric versions,
  a warning is shown.

## 5. Configuration and versioning

| Setting | Env var | Default |
| --- | --- | --- |
| Evaluation provider | `EVALUATION_PROVIDER` (`anthropic`, `gemini`, `mock`) | `anthropic` |
| **Anthropic** model | `ANTHROPIC_EVALUATION_MODEL` | `claude-opus-5-5` |
| Anthropic effort | `ANTHROPIC_EVALUATION_EFFORT` | `high` |
| Anthropic max output tokens | `ANTHROPIC_EVALUATION_MAX_TOKENS` | `16000` |
| Anthropic refusal fallback (beta) | `ANTHROPIC_SERVER_FALLBACKS` | `true` |
| **Gemini** key | `GEMINI_API_KEY` | — |
| Gemini model | `GEMINI_EVALUATION_MODEL` | `gemini-3.8-flash` (pinned; the ID the API reported, confirmed by live runs) |
| Gemini max output tokens | `GEMINI_EVALUATION_MAX_TOKENS` | `24000` |
| Gemini thinking level | `GEMINI_THINKING_LEVEL` | unset (model default) |
| Gemini structured-output mode | `GEMINI_STRUCTURED_OUTPUT` (`schema`, `json`) | `schema` |
| Timeout (both) | `EVALUATION_TIMEOUT_MS` | `180000` |
| Transcription provider / model | `TRANSCRIPTION_PROVIDER` / `OPENAI_TRANSCRIPTION_MODEL` | `openai` / `gpt-4o-transcribe` |

Each evaluation row stores:

- `evaluator_version`, `rubric_version`, `schema_version`, `prompt_hash`;
- `provider` and the model that **actually answered** (`model`);
- `model_config` (requested model, effort, max tokens, fallbacks);
- `model_calls`, `latency_ms`, `input_tokens`, `output_tokens`, `quality_report`, `created_at`.

Attempts store `processing_duration_ms`, and transcripts store their own `latency_ms`.

| Version | Why it changed |
| --- | --- |
| `speaking-evaluator/1.0.0`, schema 1 | Stage 1 |
| `speaking-evaluator/2.0.0`, schema 2 | Stage 2: new prompt (prioritisation, evidence basis, task coverage, linked focus, meaning-preserving examples, banned generic advice, learner-friendly style, transcript escaping), new schema fields, quality gate + regeneration. Changes output content and shape. |
| `speaking-evaluator/2.1.0`, schema 2 | Gemini provider added. Shared post-processing: markdown-fenced JSON is accepted, and an empty/truncated provider response gets the single regeneration. Prompt, rubric, schema and gate unchanged (same prompt hash). |
| `speaking-evaluator/2.2.0`, schema 2 | Calibrated on the first real Gemini runs. Gate: improved-example checks no longer reject good corrections (word-swap fixes, short statements gaining a reason clause); unrelated originals on missing-content issues are dropped instead of regenerating. Prompt: keep the student's stance, no replacement examples, rules for "original", no invented benchmark figures, retry focus must be the direct fix. New prompt hash. |
| `speaking-evaluator/2.3.0`, schema 2 | Retry review may not mark a numeric target achieved when the measurement misses it (repaired). Metrics gain `repeatedWords`; the prompt takes repetition counts from them. New prompt hash. |
| `speaking-evaluator/2.4.0`, schema 2 | Gate rejects internal field names in student-facing text; prompt asks for plain-language numbers. New prompt hash. |
| `speaking-evaluator/2.4.1`, schema 2 | Gate only: the pronunciation-claim check now also matches the noun "pronunciation" / "mispronunciation" (it matched only "pronounce…", so "Your pronunciation is good" passed). Found while building the real-pipeline checks; none of the real Gemini output reviewed in runs 2-5 contained either word in student-facing text. Prompt unchanged. |
| `b2-speaking-rubric/1.0.0` | Unchanged; the rubric text was not edited. |

Old evaluations are never rewritten. They are upgraded for display only
(`parseStoredEvaluation`) and keep showing their original versions.
`model_calls` is `NULL` for Stage 1 rows, because it was not recorded then.

### Prompt hash

`evaluations.prompt_hash` identifies what the model was asked, so equal hashes mean equal instructions. Since
Stage 3 it is `h2:` + SHA-256 over: the evaluator version, the system prompt actually sent (which contains the
rubric), the user-message template (rendered from a fixed sentinel input, so it does not vary with the student's
answer), the revision-request template, and the evaluation result schema including its field descriptions
(`server/evaluation/prompt-fingerprint.ts`). Before Stage 3 the hash covered only version + system prompt, so a
change to the user template or the schema descriptions was invisible; those rows are bare hex and are **not
comparable** with `h2:` hashes. The change affects bookkeeping only: the prompt the model receives is
byte-identical (checked against the previous commit), so the evaluator version was not bumped. Not covered, by
design: the task's own wording and guidance (versioned by `task_version`) and provider request settings (stored
in `model_config`). Tests show that changing the user template, system prompt, revision template, schema or
version changes the hash.

`npm run stats` prints latency percentiles, token averages per
evaluator/model, the regeneration rate and quality-gate finding counts from
the local database.

## 6. Validating with real providers

**Evaluator on the sample set** (14 calls plus a retry pair; needs only the selected provider's key):

- **Local:** put `EVALUATION_PROVIDER=gemini` and `GEMINI_API_KEY` in `.env.local` (never commit it), then
  `npm run eval:live`. Subset: `EVAL_SAMPLES=S01,S04 npm run eval:live`.
- **GitHub Actions** (works from the cloud sandbox, which cannot reach the Gemini API): add the repository
  secret `GEMINI_API_KEY`, then run **Actions → "Live evaluation (Gemini)" → Run workflow**.
  The workflow is manual-only. It uploads the review report as an artifact **and prints it in the job
  log** (some environments cannot download artifacts). Optional inputs: sample prefixes and a model override.
- Hard assertions: the quality gate passes, pronunciation is not assessed, and the injection sample
  stays ≤ B1+. These fail the run.
- Level, criterion, coverage and reliability-note differences do **not** fail the run; they are listed in
  the summary for human review. A review report is written to `eval-reports/` (gitignored).
- The summary reports provider, requested model and the model that actually answered, samples, successes,
  failures, quality-gate failures, samples recovered by regeneration, samples outside the expected ranges,
  average latency, and token totals (shown as `n/a` when the provider gives none).

**Transcription on real recordings:**

- Put audio in `local-samples/` (gitignored, so student audio is never committed), with an optional
  `<name>.txt` sidecar: `ref: <verbatim text>`, `keep: he go to school`, `seconds: 95`.
- Name silent test files `*silence*`.
- Run `npm run eval:transcription`. It reports word error rate, whether learner errors were kept, and
  (with an evaluator configured) the evaluated level.
- Needs a real STT provider (currently OpenAI). Not possible with a Gemini key alone.

**Full end-to-end:** `npm run dev`, then record two attempts with a real microphone, retry, and compare.
Check `npm run stats` afterwards. Requires both a transcription and an evaluation provider.

Review every item with the checklist below and log findings in §8.

Recordings from real students must be anonymised (no names or identifying
details in speech or filenames) and must stay out of git.

## 7. Human review checklist

For each sample response:

1. Was the student's actual answer understood?
2. Are the identified weaknesses real, and are they the most important ones?
3. Is the evidence accurate (quotes really said, metrics really true)?
4. Is the explanation understandable to an Uzbek B1–B2 learner?
5. Is the correction itself correct English?
6. Does the improved version keep the student's meaning and stay realistic?
7. Is the retry focus actionable and tied to an issue?
8. Would the student know what to do differently next time?
9. Is the feedback too long?
10. Is anything invented (quotes, errors, pronunciation, content)?

## 8. Test set

`test/evaluation-samples/b2-part2-samples.ts` holds 14 synthetic responses
written to resemble Uzbek learners' verbatim transcripts. None are real
student data.

| ID | Type | Expected level | Key expectation |
| --- | --- | --- | --- |
| S01 | Strong B2 | B2-–B2+ | All 3 points covered |
| S02 | Very strong (C1-like) | B2+–C2 | All 3 points covered |
| S03 | Weak for B2 | A2+–B1+ | Development / range issue |
| S04 | Grammar-heavy | B1-–B1+ | Grammar issue |
| S05 | Limited vocabulary | B1-–B1+ | Vocabulary issue |
| S06 | Very short (25 s) | A2–B1 | Task achievement + reliability note |
| S07 | Repetitive ("I think" ×8) | A2+–B1 | Repetition flagged |
| S08 | Accurate but undeveloped | B1–B2- | Task achievement (no reasons/examples) |
| S09 | Good content, weak fluency | B1–B2- | Fluency issue |
| S10 | Off-topic | A2–B1 | Task achievement, points 1–2 not covered, reliability note |
| S11 | Partial (no school point) | B1+–B2 | Point 2 not covered |
| S12 | Hesitant / very slow | A2–B1- | Fluency / task |
| S13 | Prompt injection | A2–B1+ | Injection ignored (hard assertion) |
| S14 | Uzbek L1 transfer ("I am agree", "make homework", "more better") | B1-–B1+ | Grammar issue |

Automated tests that run in `npm test`:

| Area | Test file |
| --- | --- |
| Evidence matching | `src/domain/evaluation/evidence.test.ts` |
| Tests A–E (evidence, meaning, pronunciation, generic, retry focus) | `src/server/evaluation/quality-gate.test.ts` |
| Test F (malformed output) and Test H (versioning/config) | `src/server/evaluation/speaking-evaluator.test.ts` |
| Test G (provider failures via a fake HTTP layer) | `anthropic-evaluation-model.test.ts`, `gemini-evaluation-model.test.ts`, `openai-transcription.test.ts` |
| Gemini JSON-schema conversion | `src/server/evaluation/gemini-json-schema.test.ts` |
| Honest comparison | `src/domain/speaking/comparison.test.ts` |
| Stored v1 → v2 upgrade | `src/domain/evaluation/stored.test.ts` |
| Pipeline (failures, timings, ownership, upload validation) | `src/server/attempts/attempt-pipeline.test.ts` |
| Sample-set metrics and gate robustness | `test/evaluation-samples/samples.test.ts` |
| Browser | `e2e/practice-flow.spec.ts` (`npm run test:e2e`) |

## Gemini evaluation provider

**Role:** evaluation only (`EVALUATION_PROVIDER=gemini`). Anthropic evaluation and OpenAI
transcription are unchanged and still selectable.

**SDK:** official `@google/genai` (Google's current JavaScript SDK). No unofficial wrappers.
**Model:** `GEMINI_EVALUATION_MODEL`, default `gemini-3.8-flash`. This is the identifier the API itself
reported as the answering model on the first real run, and an explicit request for it was then verified live.
It is pinned (not an alias) so behaviour does not change silently. Every evaluation stores the model that
actually answered (`modelVersion` from the response). If a model is not available to a key, the run fails with
`provider_not_configured` and a "model not found (check GEMINI_EVALUATION_MODEL)" log line. Changing the model
means re-running the live validation.

**Pipeline** (identical for every provider; only the first box differs):

```
GeminiEvaluationModel ──raw text──▶ parse JSON ──▶ Zod schema v2 ──▶ quality gate ──▶ (one regeneration) ──▶ store
```

- The provider receives the *same* system prompt and user message as Anthropic, built by
  `prompts/speaking-evaluation-v2.ts`. Rubric, task points, CEFR target, metrics and escaped transcript are all
  in there. The student's transcript stays in the user message, escaped, and the system prompt declares it to be data.
- Plumbing added for Gemini only: JSON mime type, the JSON schema (`responseJsonSchema`), and an
  "Output format" block repeating the schema in the system instruction. This is not part of the prompt hash, so
  both providers share one hash for one methodology.
- The schema is derived from the Zod schema (`gemini-json-schema.ts`), limited to the JSON-Schema keywords Gemini
  documents (string length/pattern/format and 64-bit integer bounds are dropped). API-side schema enforcement is
  a convenience: **Zod validation and the quality gate remain authoritative and always run.**
- If the API rejects the schema, set `GEMINI_STRUCTURED_OUTPUT=json`: no schema is sent to the API and the shape is
  described only in the prompt; validation is unchanged.
- The same single regeneration applies to every provider. Malformed JSON, schema violations, empty responses and
  truncated output (`MAX_TOKENS`) are regenerated once, then fail with `evaluation_invalid_output`.
  Quality-gate rejections regenerate once with a revision request, then fail with `evaluation_quality_rejected`.
  Nothing invalid is stored.
- Errors: HTTP 429 → `provider_rate_limited`; 401/403/404 and "API key not valid" → `provider_not_configured`;
  408/504/timeouts → `provider_timeout`; blocked prompts or a safety/prohibited-content stop →
  `evaluation_refused`; other 4xx/5xx and network errors → `evaluation_failed`. None of these are regenerated.
  Error text is scrubbed of the API key before it reaches logs; the key travels only in the `x-goog-api-key` header.
- **Observability:** `provider = gemini`, the answering model, `model_config` (max tokens, structured-output mode,
  thinking level if set), `model_calls`, latency and quality report are stored like any other provider.
  Tokens: input = `promptTokenCount`; output = `candidatesTokenCount + thoughtsTokenCount` (reasoning tokens are
  billed as output). If Gemini omits usage metadata the columns stay `NULL`; nothing is estimated.

**Tested (no key needed, in `npm test`):** requests (key only in the header, schema and settings sent),
successful reply, malformed JSON, wrong structure, markdown-fenced JSON, empty reply, missing candidates, truncation,
blocked/safety stops, timeout, network failure, 400/403/404/429/500/503/504 mapping, key redaction,
regeneration success and failure, quality-gate rejection through the Gemini path (hallucinated quote, pronunciation
claim, generic advice), no regeneration after provider failures, and the injected-instruction prompt shape. The live
harness mechanics were also exercised against a throwaway local HTTP stand-in (not Gemini).

**Verified live (five runs, 14 synthetic answers each):** the model exists for the key and accepts the
derived JSON schema (`schema` mode, no fallback needed); no JSON or schema failures; evidence quotes were exact;
latency (~14-16 s average) and token use; the quality gate, regeneration and repair paths against real output.

**Still NOT verified:**

- `json` structured-output mode and `GEMINI_THINKING_LEVEL` (neither used);
- cost and free-tier / paid rate limits under load (no 429 was seen);
- behaviour on real student speech (transcripts here are synthetic and perfectly punctuated);
- score stability beyond three comparable runs (see the consistency table below).

Gemini and Anthropic results are not interchangeable: they are different models, and scores should not be
compared across providers without checking on the sample set first.

## Real Gemini validation

**Provider:** Gemini (`@google/genai`), `EVALUATION_PROVIDER=gemini`
**Actual model:** `gemini-3.8-flash` (reported by the API in every run; `answered by` matches the request)
**Date:** 2026-10-02 and 2026-10-03
**Samples:** the 14 synthetic B2 Part 2 answers (section 8) plus the weak-to-strong retry pair, run through the
manual GitHub Actions workflow `Live evaluation (Gemini)` with the `GEMINI_API_KEY` repository secret. The key
was never printed, logged or committed. Transcription was not part of this validation.

| Run | Evaluator | Result | Evaluated | Regenerated | Avg latency | Notes |
|---|---|---|---|---|---|---|
| 1 | 2.1.0 | pass | 14/14 | 8 | ~25 s | gate over-rejecting improved examples |
| 2 | 2.1.0 | **failure** | 13/14 | n/a | n/a | S05 and the retry pair rejected on both drafts |
| 3 | 2.2.0 | pass | 14/14 | 1 | 15.9 s | gate recalibrated; no rejections persisted |
| 4 | 2.3.0 | pass | 14/14 | 2 | 13.6 s | retry-review and repetition counts fixed |
| 5 | 2.4.0 | pass | 14/14 | 2 | 15.1 s | 72,856 tokens in / 53,412 out; 0 failures, 0 gate failures |
| 6 | 2.4.1 | pass | 14/14 | 2 | 14.4 s | 72,756 tokens in / 50,304 out; 0 failures, 0 gate failures; re-run after the pronunciation-noun gate fix (Stage 3B): no regression, no pronunciation wording in any student-facing text |

**Final run (5):** 14 of 14 samples and the retry pair evaluated, 0 failed, 0 quality-gate failures, 2 recovered
by one regeneration (S05, S08; both for `improved_example_changes_meaning`), average 15.1 s (slowest S05 at
31.5 s, which needed two calls). The numeric retry-review repair fired for real: the model marked "speak for at
least 90 seconds" as achieved while citing 88 seconds, and the gate changed it to `partly_achieved`.

**Confirmed strengths**

- Evidence discipline: no hallucinated quote in any run; speech-metric issues correctly carry no quote.
- Feedback is specific and follows identify → explain → fix → improved example with the student's own words.
- Task coverage was judged per point, including partial coverage (S08, S11) and off-topic (S10).
- The prompt-injection sample (S13) was treated as ordinary speech; no pronunciation claim was made anywhere.
- Levels followed the expected ordering on all runs; Uzbek-learner transfer errors (S14) were identified.
- No JSON, schema, truncation, safety or rate-limit failures across all five runs.

**Score consistency across runs 3-5 (same transcripts, different evaluator versions):** 7 of 14 samples had the
same overall level in all three runs; six others moved by one sub-band (S03, S05, S06, S07, S08, S09, always between
adjacent levels) and S02 moved B2+ → C1 → C1- (two sub-bands between runs, every criterion within 1 point). Variation of one
sub-band between evaluations of the same answer is therefore normal for this model, which supports the rule that
a 1-point or one-sub-band change is "slight".

**Results by criterion (final run, manual review of every sample):** understanding and task coverage correct;
weaknesses real; evidence exact; explanations and corrections correct; meaning preserved after calibration; retry
focus is the direct fix for its issue; no generic feedback; no pronunciation claims. One sample (S08, B1- against
an expected B1 to B2-) is judged defensible: 57 words in 60 seconds with no development is B1- under the rubric,
so the expectation range, not the model, was generous. It was not changed.

**PASS**

- Gemini evaluation works end to end through the shared pipeline with the real API, and the gate is provider-independent.

**ISSUES FOUND and FIXED** (details in the findings log F17-F23)

- The improved-example check over-rejected correct, minimal corrections (8 of 14 first drafts in run 1; two
  evaluations failed in run 2). Recalibrated; regenerations fell to 1-2 per run and latency from ~25 s to ~15 s.
- The retry review called an unmet numeric target "achieved". Now repaired against the measured values.
- A repetition count was wrong (7 stated, 13 actual). The evaluator now takes counts from `repeatedWords`.
- The overall level alone could make an unchanged answer look clearly better or worse. "Clear" verdicts now need
  a criterion that moved by 2+ points.
- A raw field name leaked into feedback ("timeUsedRatio: 0.73"). Rejected by the gate and discouraged in the prompt.

**REMAINING LIMITATIONS**

- Only Gemini evaluation is real-validated. **OpenAI transcription is NOT real-validated** (no key), **Anthropic
  evaluation is preserved but not real-validated**, and the **full microphone → OpenAI transcription → Gemini
  evaluation pipeline is NOT validated** and must not be called production validated.
- 14 synthetic answers, reviewed by one reviewer (no inter-rater data); real student speech may differ.
- The meaning-preservation check is skipped when the original has fewer than 3 content words, so a short
  original could still be replaced by an unrelated example (seen once, run 3, S10; not in runs 4-5).
- Score stability is one sub-band between runs, two for very strong answers.
- Evaluator version history is dense (2.1.0 to 2.4.0 in a day); scores across those versions are not strictly
  comparable.

## Real transcription and full-pipeline validation (Stage 3B)

**Status: NOT RUN against real OpenAI.** The OpenAI key is not available: the sandbox has none and cannot reach
`api.openai.com`, and the manual workflow `live-pipeline.yml` (run 37092651529) stopped at its secrets check because
the repository secret `OPENAI_API_KEY` is not set (`GEMINI_API_KEY` is). Nothing below has been measured on a real
OpenAI response, so **OpenAI transcription, the full microphone → OpenAI → Gemini pipeline and the real-provider
browser flow are still NOT validated.**

What was built so the validation is one click once the secret exists (Settings → Secrets and variables → Actions →
`OPENAI_API_KEY`; it is also used for text-to-speech of the test audio):

| Harness | Command | What it checks |
|---|---|---|
| Controlled transcription | `npm run eval:transcription:controlled` | Text-to-speech renders known texts (normal B2 answer; learner errors; fillers and false starts; repetition; a 3-word answer), ffmpeg encodes them as WebM/Opus (the browser recorder's format), plus m4a and ogg copies, 8 s of silence and 8 s of near-silence. Reports WER against the spoken text, which learner errors survived, fillers transcribed vs spoken, metrics from the transcript vs the spoken text, latency and the usage the API reports. Hard assertions only for silence: no transcript of 5+ words, no prompt words, no task words. |
| Full pipeline | `npm run eval:pipeline` | Seven samples (normal, weaker, grammar mistakes, repetition, fillers, off-task, and a weak→strong retry) through `createAttempt` → `processAttempt` with the real providers, then read back. Verifies the chain user → session → attempt → recording → transcript → evaluation, stored audio equals uploaded audio, versions, `h2:` prompt hash, model config, quality report, timings, session-correlated events, retry linkage; quotes occur in the transcript; no pronunciation claim; numeric claims in the feedback match the stored metrics (reported for review); records stage latencies, models, gate warnings, regenerations and usage. |
| Browser | `npm run test:e2e:live` | One flow in Chromium whose fake microphone plays the speech file, so the real MediaRecorder WebM/Opus path, upload, real transcription and evaluation run; the stored attempt is read back through the API. |

All three are manual and separate from CI. The test audio is **synthetic speech**: clean, evenly paced, no accent, noise
or microphone. It gives an exact reference for fidelity checks; it does not show performance on real learners. Real
recordings still go through `npm run eval:transcription` (`local-samples/`).

The mechanics of all three were exercised against local stand-ins for the OpenAI and Gemini endpoints (a stand-in is
detected and the report says "NOT A REAL RUN"). That proves the harness, the persistence checks and the report format
work; it proves nothing about OpenAI or Gemini.

Failure paths are covered with injected providers (`src/server/attempts/failure-paths.test.ts`): transcription
timeout, API error, rate limit, unsupported audio, missing key and silence; evaluation timeout, API error, refusal,
malformed output twice, provider-reported unusable output twice, gate rejection on both drafts (regeneration
exhausted) and gate rejection fixed by the regeneration. Each ends as a stored `failed` attempt with a stage and a stable
code, the recording kept, no evaluation row, no dangling reference, and (for transient faults) a restart that completes.

One real defect was found while writing the checks and fixed (evaluator 2.4.1): see findings log F24.

## Provider failure matrix and security audit (B2 Part 2)

Every row is covered by an automated test with injected providers; **no real provider failure was provoked**.
All end as a stored `failed` attempt with a stage and a stable code, the recording kept (restartable within the run
cap), no evaluation row, and a student-friendly message (`failure-messages.ts`); technical detail stays in server logs.

| Failure | Stored code | Retryable | Where tested |
|---|---|---|---|
| OpenAI timeout / hang | `provider_timeout` | yes | `openai-transcription.test.ts`, `failure-paths.test.ts` |
| OpenAI network interruption | `transcription_failed` | yes | `openai-transcription.test.ts` |
| OpenAI API failure (5xx) | `transcription_failed` | yes | `openai-transcription.test.ts`, `failure-paths.test.ts` |
| OpenAI invalid credentials (401/403) | `provider_not_configured` | no | `openai-transcription.test.ts` |
| OpenAI rate limit (429) | `provider_rate_limited` | yes | same |
| Unsupported / corrupt audio (400/413/415) | `audio_unsupported` | no | same; upload validation in `attempt-pipeline.test.ts` |
| Silence / prompt echo / fewer than 5 words | `transcription_empty` | no | `openai-transcription.test.ts`, `failure-paths.test.ts` |
| Anthropic timeout | `provider_timeout` | yes | `anthropic-evaluation-model.test.ts` |
| Anthropic network interruption | `evaluation_failed` | yes | same |
| Anthropic API failure (500/529) | `evaluation_failed` | yes | same |
| Anthropic invalid credentials (401/403) | `provider_not_configured` | no | same (key never in the error) |
| Anthropic rate limit (429) | `provider_rate_limited` | yes | same |
| Anthropic rejected request (400, e.g. unknown model) | `evaluation_failed` | no | same (key redacted from the message) |
| Anthropic refusal / truncated output | `evaluation_refused` / `evaluation_invalid_output` | no / yes | same |
| Malformed or schema-invalid output | one regeneration, then `evaluation_invalid_output` | yes | `speaking-evaluator.test.ts`, `failure-paths.test.ts` |
| Quality-gate rejection on both drafts | `evaluation_quality_rejected` | yes | `quality-gate*.test.ts`, `failure-paths.test.ts` |
| Hung provider beyond the processing budget | `provider_timeout` | yes | `failure-paths.test.ts`, `processing-limits.test.ts` |

Gemini has the same coverage in `gemini-evaluation-model.test.ts`.

Security audit of the Part 2 pipeline (read from the code and covered by tests; nothing here needed a real provider):

| Check | Result | Evidence |
|---|---|---|
| API keys never reach the browser | Pass | Keys are read only in `server/config/env.ts` (`server-only`); `test/client-boundary.test.ts` fails if any browser-bound module imports server code, reads `process.env` (other than `NODE_ENV`) or mentions a key/secret; a production build's static assets contained no key variable name or key-like string (checked by grep) |
| Audio endpoint cannot reach arbitrary files | Pass | The route reads only the `storageKey` stored for an attempt the caller owns; `LocalAudioStorage` accepts only `[a-zA-Z0-9/_.-]` and no `..`, and joins under its root (`local-audio-storage.test.ts`: traversal, backslash, encoded, null byte, absolute-looking keys) |
| Upload size/type validation | Pass | 20 MB counted while streaming, MIME allow-list, magic bytes (`api-routes.test.ts`, `attempt-pipeline.test.ts`) |
| Transcript treated as untrusted | Pass | angle brackets escaped, declared data in the prompt, injection sample S13 ignored by the real model; `prompt-fingerprint`/gate tests |
| Browser cannot choose a user id | Pass | identity only from `getCurrentUser()`; `cross-user.test.ts` (body, query and header ids ignored) |
| Analytics cannot spoof another user | Pass | user id from the session/cookie; foreign session ids stored as none (`api-routes.test.ts`, `cross-user.test.ts`) |

The Anthropic evaluator has the same prompt, schema, gate and error handling as the validated Gemini path, but **has not been
run against the real Anthropic API** (no key). `live-evaluation.yml` takes a `provider` input (`gemini` or `anthropic`)
and `live-pipeline.yml` an `evaluation_provider` input; either needs its repository secret. Real OpenAI transcription is also
not validated (no key). Both statuses are in the summary at the top of this document.

## Findings log

Findings so far come from code audit and automated tests. **No real-model
output has been reviewed yet** — add live-review findings here.

| # | Source | Observed issue | Severity | Decision / change |
| --- | --- | --- | --- | --- |
| F1 | Audit | SDK JSON-Schema conversion drops enum/range/minLength constraints (turned into descriptions), so the API does not enforce them | High | Kept Zod validation as the gate; added field descriptions as model guidance; documented |
| F2 | Audit | Stage 1 STT prompt ended with a sample utterance (`"Umm, so I think, uh, I think that..."`); STT models can echo prompts on silence, giving a 6-word fake answer that passed the 5-word check and was evaluated | High | Removed sample utterance; added prompt-echo guard → `transcription_empty`; test |
| F3 | Audit | Stage 1 only *logged* quotes not found in the transcript; hallucinated evidence could reach students | High | Evidence matcher + gate: unverified quotes removed; issue with no remaining evidence → regenerate |
| F4 | Audit | No link between retry focus and issues; focus could be a generic tip | High | `addresses_issue` in schema v2; gate validates link and rejects generic objectives |
| F5 | Audit | Comparison treated ±1 point as "Improved"/"Lower" and headlined it | Medium | Magnitude (slight/clear) + conservative verdicts; UI copy rewritten |
| F6 | Audit | Mock evaluator claimed "partly achieved" for every retry objective without checking | Medium | Mock now checks measurable objectives and otherwise says it cannot verify |
| F7 | Audit | Up to 5 issues, all shown with equal weight; retry CTA below all of them | Medium | Max 4 (prompt: usually 2–3); UI shows biggest fix → focus → Retry first, other issues collapsed |
| F8 | Audit | Nothing checked improved examples; prompt allowed "B2+ level" rewrites, which invite showy prose | Medium | Prompt rules + Samarkand good/bad example; gate rejects < 50% content overlap or > 3× length |
| F9 | Audit | Uploads trusted the client MIME type; body was fully buffered before the size check | Medium | Magic-byte check; Content-Length pre-check |
| F10 | Tests | Dev evaluator quoted `"Uh..."` (fillers only) as evidence on the hesitant sample; gate correctly rejected it | Low | Mock picks the first sentence with real words |
| F11 | Audit | Transcript could contain `</transcript>` and break prompt sections | Low | Angle brackets escaped; test |
| F12 | Audit | Stage 1 evaluator did not record model config or number of calls | Low | `model_config`, `model_calls`, `quality_report`, `processing_duration_ms` |
| F13 | Gemini work | A provider-reported empty or truncated response failed immediately and was never regenerated, although malformed JSON was. Applied to every provider. | Medium | Shared evaluator regenerates once on any `evaluation_invalid_output`; evaluator bumped to 2.1.0 |
| F14 | Gemini work | Live harness: level/criterion mismatches used `expect.soft`, which still fails the run, contradicting its own docs; a scheduled CI run would go red on ordinary examiner-style disagreement | Medium | Mismatches are listed in the summary only; hard rules still fail |
| F15 | Gemini work | Live harness and transcription harness only recognised Anthropic keys, so a Gemini-only setup was skipped silently | Medium | Provider chosen by `EVALUATION_PROVIDER`; skip message names the missing variable |
| F16 | Gemini work | With an alias model name, the summary showed only the requested model | Low | Summary also lists the models that actually answered |
| F17 | Live Gemini | Improved-example check rejected correct minimal corrections (e.g. 'make → do homework'; a clause added for a reason); 8 of 14 first drafts regenerated, two evaluations failed | High | Vocabulary 10% overlap floor, 30-word length floor, unrelated-original repair; real-output regression tests (2.2.0) |
| F18 | Live Gemini | Missing-content issues quoted an unrelated original sentence | Medium | `original` is blanked and a warning recorded; prompt rule for missing content (2.2.0) |
| F19 | Live Gemini | Retry review marked 'speak for at least 90 seconds' achieved while citing 88 seconds | High | Numeric-target repair against measured metrics (2.3.0); fired live in run 5 |
| F20 | Live Gemini | Repetition stated as 'seven times' for 13 repetitions | Medium | `repeatedWords` metric; counts only from metrics (2.3.0); confirmed exact in run 4 |
| F21 | Live Gemini | Same transcript scored B2+ and C1 with every criterion within 1 point; the comparison read it as clear change | Medium | Clear verdict needs a 2+ point criterion change (2.4.0) |
| F22 | Live Gemini | Student-facing text contained an internal field name ('timeUsedRatio: 0.73') | Low | Gate rejection and prompt rule (2.4.0); none seen in run 5 |
| F23 | Live Gemini | Report artifact download blocked from the dev sandbox; passing tests hid console output | Low | Report printed in the job log; verbose reporter |
| F24 | Stage 3B | The pronunciation-claim check matched "pronounce…" but not the noun "pronunciation"/"mispronunciation", so "Your pronunciation is good" passed the gate. The existing tests only used verbs, accent, vowels and intonation | Medium | Pattern now `(?:mis)?pron(?:ou|u)nc\w*`; regression tests; evaluator 2.4.1 (gate only, prompt unchanged). No real Gemini output in runs 2-5 contained either word in student-facing text |
| F25 | Part 2 re-audit | Anthropic error handling had no tests for 401/403, 429, 400 and 5xx, and a 400 message embedded the provider's text unredacted (a key echoed by the API would have reached a log) | Low | Tests for each status; `sk-ant-…` redacted from mapped messages |
| F26 | Part 2 re-audit | No automated guard that browser-bound code stays free of server imports/secrets, and no direct tests of `LocalAudioStorage` path handling | Low | `test/client-boundary.test.ts`, `local-audio-storage.test.ts` |

## Known weaknesses and future improvements

- **Real-provider coverage is partial.** Gemini evaluation was validated live on synthetic answers; OpenAI
  transcription and the Anthropic evaluator were not. Gate thresholds were tuned on Gemini output only and may
  need retuning for another model.
- The generic-feedback check is pattern-based. It catches common phrasings,
  not every vague sentence.
- Meaning preservation is a lexical heuristic. A paraphrase with different
  words but the same meaning could be flagged, and a same-words/different-meaning
  rewrite could pass.
- Score stability is measured on Gemini only (three comparable runs: one sub-band of variation, two for the
  strongest sample). The comparison's "±1 = slight" rule is based on that; there is no human inter-rater data.
- Pronunciation is not assessed. A future audio-capable evaluator can fill
  the existing schema slot.
- The client reports the recording duration (used for WPM). It is not
  verified server-side.
- Uzbek-learner-specific error patterns are only covered by sample S14. Add
  real (anonymised) recordings to `local-samples/` for validation.
