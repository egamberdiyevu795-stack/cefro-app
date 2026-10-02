# AI evaluation quality (B2 Part 2)

This document describes how CEFRO evaluates spoken answers, how evaluation
quality is checked, and what we know about its weaknesses. It is a working
document: add a row to the [findings log](#findings-log) whenever a review
changes the prompt, schema, gate or rubric.

> **Status (Stage 2):** all code-level and automated quality work is done.
> **Real-provider validation has NOT been run yet** — no OpenAI/Anthropic
> credentials were available in the development environment. Until the
> live runs in [§6](#6-validating-with-real-providers) are done and reviewed,
> treat real-model output quality as unverified.

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
| Evaluation provider | `EVALUATION_PROVIDER` | `anthropic` |
| Model | `ANTHROPIC_EVALUATION_MODEL` | `claude-opus-5-5` |
| Effort | `ANTHROPIC_EVALUATION_EFFORT` | `high` |
| Max output tokens | `ANTHROPIC_EVALUATION_MAX_TOKENS` | `16000` |
| Refusal fallback (beta) | `ANTHROPIC_SERVER_FALLBACKS` | `true` |
| Timeout | `EVALUATION_TIMEOUT_MS` | `180000` |
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
| `b2-speaking-rubric/1.0.0` | Unchanged; the rubric text was not edited. |

Old evaluations are never rewritten. They are upgraded for display only
(`parseStoredEvaluation`) and keep showing their original versions.
`model_calls` is `NULL` for Stage 1 rows, because it was not recorded then.

`npm run stats` prints latency percentiles, token averages per
evaluator/model, the regeneration rate and quality-gate finding counts from
the local database.

## 6. Validating with real providers

1. Put keys in `.env.local` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, real providers selected).
2. **Evaluator on the sample set** (~14 calls, plus a retry pair):
   `npm run eval:live`, or a subset with `EVAL_SAMPLES=S01,S04 npm run eval:live`.
   - Hard assertions: the gate passes, pronunciation is not assessed, and the injection sample stays ≤ B1+.
   - Soft expectations: level range, issue criterion, task coverage, reliability note.
   - A full review report is written to `eval-reports/` (gitignored).
3. **Transcription on real recordings:**
   - Put audio in `local-samples/` (gitignored — never commit student audio),
     with an optional `<name>.txt` sidecar:
     `ref: <verbatim text>`, `keep: he go to school`, `seconds: 95`.
   - Name silent test files `*silence*`.
   - Run `npm run eval:transcription`. It reports word error rate, whether
     learner errors were kept, and (with an evaluator configured) the
     evaluated level.
4. **Full end-to-end:** `npm run dev`, then record two attempts with a real
   microphone, retry, and compare. Check `npm run stats` afterwards.
5. Review every item with the checklist below and log findings in §8.

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
| Test G (provider failures via a fake HTTP layer) | `anthropic-evaluation-model.test.ts`, `openai-transcription.test.ts` |
| Honest comparison | `src/domain/speaking/comparison.test.ts` |
| Stored v1 → v2 upgrade | `src/domain/evaluation/stored.test.ts` |
| Pipeline (failures, timings, ownership, upload validation) | `src/server/attempts/attempt-pipeline.test.ts` |
| Sample-set metrics and gate robustness | `test/evaluation-samples/samples.test.ts` |
| Browser | `e2e/practice-flow.spec.ts` (`npm run test:e2e`) |

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
