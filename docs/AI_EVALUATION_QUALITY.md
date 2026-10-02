# AI evaluation quality (B2 Part 2)

This document describes how CEFRO evaluates spoken answers, how evaluation
quality is checked, and what we know about its weaknesses. It is a working
document: add a row to the [findings log](#findings-log) whenever a review
changes the prompt, schema, gate or rubric.

> **Status:** all code-level and automated quality work is done, for
> both evaluation providers (Anthropic and Gemini). **Real-provider
> validation has NOT been run for anything**: no Gemini, Anthropic or OpenAI
> call has ever been made with a real key. Real-model output quality, the
> chosen Gemini model default, Gemini's acceptance of our JSON schema, and
> real-speech transcription are all unverified. See
> [§6](#6-validating-with-real-providers) for how to run the checks and
> [Gemini evaluation provider](#gemini-evaluation-provider) for what is unverified there.

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
| Improved version keeps < 50% of the original's content words | **reject** | Regenerate |
| Improved version > 3× the original's length | **reject** | Regenerate |
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
  scores vary that much between similar answers.
- ≥ 2 points is *clear*.
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
| Gemini model | `GEMINI_EVALUATION_MODEL` | `gemini-flash-latest` (unverified alias) |
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
| `b2-speaking-rubric/1.0.0` | Unchanged; the rubric text was not edited. |

Old evaluations are never rewritten. They are upgraded for display only
(`parseStoredEvaluation`) and keep showing their original versions.
`model_calls` is `NULL` for Stage 1 rows, because it was not recorded then.

`npm run stats` prints latency percentiles, token averages per
evaluator/model, the regeneration rate and quality-gate finding counts from
the local database.

## 6. Validating with real providers

**Evaluator on the sample set** (14 calls plus a retry pair; needs only the selected provider's key):

- **Local:** put `EVALUATION_PROVIDER=gemini` and `GEMINI_API_KEY` in `.env.local` (never commit it), then
  `npm run eval:live`. Subset: `EVAL_SAMPLES=S01,S04 npm run eval:live`.
- **GitHub Actions** (works from the cloud sandbox, which cannot reach the Gemini API): add the repository
  secret `GEMINI_API_KEY`, then run **Actions → "Live evaluation (Gemini)" → Run workflow**.
  The workflow is manual-only and uploads the review report as an artifact.
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
**Model:** `GEMINI_EVALUATION_MODEL`, default `gemini-flash-latest`. This default is a judgement call that
could **not** be checked: Google's model list was unreachable, and the SDK's type definitions only show example
names. A moving alias is less likely to be retired than a pinned name, but it can change behaviour silently.
Every evaluation stores the model that actually answered (`modelVersion` from the response). Once you
have chosen a model, pin it and re-run the live validation. If the default is not available to your key,
the run fails with `provider_not_configured` and a "model not found (check GEMINI_EVALUATION_MODEL)" log line.

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

**NOT verified (needs the real key):**

- that the default model exists for your key and behaves as expected;
- that the API accepts our schema (the `json` mode exists as a fallback);
- how well Gemini applies the CEFRO methodology: evidence discipline, meaning-preserving corrections,
  level accuracy, and how often the quality gate has to reject or regenerate;
- thinking behaviour. `GEMINI_THINKING_LEVEL` is unset by default because the accepted values differ between
  model generations, and an unsupported value would be rejected;
- latency, cost and free-tier rate limits.

Gemini and Anthropic results are not interchangeable: they are different models, and scores should not be
compared across providers without checking on the sample set first.

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

## Known weaknesses and future improvements

- **Real-provider output is unverified** (see status above). The gate's
  thresholds (50% overlap, 3× length, 70% duplicate overlap) are first
  estimates and need tuning against real output.
- The generic-feedback check is pattern-based. It catches common phrasings,
  not every vague sentence.
- Meaning preservation is a lexical heuristic. A paraphrase with different
  words but the same meaning could be flagged, and a same-words/different-meaning
  rewrite could pass.
- No inter-rater reliability data yet: we don't know how stable scores are
  across repeated evaluations of the same transcript. The comparison's
  "±1 = slight" rule assumes that variation; measure it by running
  `eval:live` twice.
- Pronunciation is not assessed. A future audio-capable evaluator can fill
  the existing schema slot.
- The client reports the recording duration (used for WPM). It is not
  verified server-side.
- Uzbek-learner-specific error patterns are only covered by sample S14. Add
  real (anonymised) recordings to `local-samples/` for validation.
