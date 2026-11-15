# Feedback review: evaluator issues for the next live run

**Status of issues 1–5 below: to test live before changing the prompt.** Nothing there has been changed in the code
or the prompt yet. No model was called to write this review.

**One prompt change is already in, not live-tested:** the "Sentences to improve" list ([below](#sentences-to-improve-prompt-changed-not-live-tested)),
evaluator `speaking-evaluator/3.6.0` and `argument-evaluator/0.2.0` (v1-plan step 5).

- **Source:** the saved outputs in `test/fixtures/live-3.6-flash/` (evaluator 3.5.0, commit `4edee53`, 2026-11-06).
- **Model caveat:** those runs used `gemini-3.6-flash`, **not** the production model (`gemini-3.8-flash`), and were
  transcript-only (no audio step). Each issue has to be confirmed on `gemini-3.8-flash` before the prompt changes.
- **Quotes** below are copied exactly from the fixtures (anchor and run given, e.g. `A2 r1` = `A2-b1-all-three`,
  run 1). Prompt lines refer to `src/server/evaluation/prompts/multilevel-evaluation.ts` at this commit.
- **What students see:** these fields reach the result page directly. The goal is the first `retry_focus`, the one
  "Retry with this goal" carries; "Try instead" is the error's `correction`.

## Live run on gemini-3.8-flash (15 Nov 2026)

**Result:** the Part 2 anchors hold on the production model, issue 5 is fixed by one prompt rule (evaluator 3.7.0), and
issues 1–4 still show up. Saved outputs: `test/fixtures/live-3.8-flash/` (report JSON + markdown per run; read them with
`node scripts/check-feedback-review.mjs <report.json>`). High thinking, transcript only, `EVAL_STREAM=1` (see below).

| Anchor (expected band) | Bands, evaluator 3.6.0 | Bands, evaluator 3.7.0 |
| --- | --- | --- |
| A0-below-b1 (0) | 0, 0, 0, 0, **2** | 0, 0, 0, 0, 0 |
| A1-b1-only-q3 (1) | 1, 1, 1 | not rerun (rule cannot apply) |
| A2-b1-all-three (2) | 2, 2, 2 | not rerun |
| A3-b2-q3-missing (3) | 3, 3, 3 | not rerun |
| A4-b2-all-three (4) | 4, 4, 4 | not rerun |
| A5-above-b2 (5) | 5, 5, 5 | not rerun |
| A0-memorized-off-topic (0) | 0, 0, 0 | not rerun |
| A0-picture-only (0) | 0, 0, 0 | not rerun |

- **Issue 5 (fixed, prompt only):** the band-2 run rated grammar below_B1 but vocabulary B1, quoting "know many thing",
  "work in market" as B1 evidence. New rule: when grammar is below_B1, vocabulary B1 needs evidence quotes that are
  themselves correct. It only applies when grammar is already below_B1, and no other anchor has a below_B1 grammar run,
  so the other anchors were not rerun. No scorer change (option b not needed).
- **Issues 1–4 on 3.8-flash** (24 runs of evaluator 3.6.0): issue 1 goal joins two issues 4 runs; issue 2 fluency claim
  without audio 19 runs; issue 3 on-topic example 15 runs; issue 4 set phrase in a check 3 runs. Same picture as on
  3.6-flash, so the proposed rules below are still needed (not applied in this run).
- **Part 1.2 warning:** one live call on the 1.2-middle anchor (expected band 2) gave **band 0**, with 23.7k output tokens
  and 162 s. Part 1 has had no live anchor run; run the six Part 1 anchors before Part 1 scores are shown to students.

**Cost per scoring, measured** (gemini-3.8-flash, $0.75 / $3.75 per M tokens, introductory price until 31 Dec 2026, unverified):

| Part | Runs | Cost per scoring | Time |
| --- | --- | --- | --- |
| 1.1 | 1 | $0.022 | 38 s |
| 1.2 | 1 | $0.093 (23.7k output tokens, see warning above) | 162 s |
| 2 | 29 | $0.034 average, $0.016–0.078 (weak answers cost the most) | 24–136 s |
| 3 | 1 | $0.032 | 54 s |

Transcript scoring of a full mock: about $0.12–0.18; with speech-to-text (~$0.04) and the audio step (not measured)
plan on **about $0.20–0.25 per full mock**, double after 31 Dec. Thinking is 75–90 % of output tokens.

**Sandbox note:** the Claude Code cloud sandbox's network proxy cuts a request that sends nothing for 30 s (HTTP 502
"upstream request failed"), and a high-thinking scoring takes 25–160 s. Live runs from the sandbox therefore need
`NODE_USE_ENV_PROXY=1 EVAL_STREAM=1 EVAL_SDK_RETRIES=0` (test/live/stream-fetch.ts streams the call, live tests only).
The app itself on Vercel is not affected; but a 1.2 scoring of 162 s is close to the `EVALUATION_TIMEOUT_MS` default
(180 s) and, with speech-to-text and the audio step in the same request, to the 300 s `maxDuration` of the process route.

## Plan for the next live run

1. Run the Part 2 anchor set on `gemini-3.8-flash` with the **current** prompt, 3 runs per anchor, and save the full
   outputs, including the quality report this time.
2. Count each issue below in those outputs, using the "How to check" line of each issue.
3. Change the prompt only for issues that still show up on `gemini-3.8-flash`. One rule per change, bump the evaluator
   version, rerun the anchor set and compare bands. A rule must not move any anchor off its expected band.

---

## Sentences to improve (prompt changed, not live-tested)

**Status: the prompt of all four parts (1.1, 1.2, 2, 3) was changed on `claude/better-versions` and has never been sent to a model.**
No Gemini call was made: the mock evaluators fill the list from the demo answers, and the tests run the real quality gate on it.
This was built for `docs/v1-plan.md` section 3.3 (step 5): the result page's "Your answer" card underlines the student's mistakes
and opens You said / Better / Why under a tapped sentence.

**What the model is now asked** (one shared text, `src/server/evaluation/prompts/sentence-fixes.ts`, used by the Part 1, Part 2 and
Part 3 prompts): up to 8 items, most important first, each with
`you_said` (the student's exact words, one clause or sentence, at most 25 words), `better` (the same words with only that one
mistake fixed; no new idea, no reason, no example, not more advanced, at most 3 words longer; never a rewritten or model answer) and
`why` (one short line, at most 20 words, about grammar or word choice). One mistake per item (this is issue 1's rule, applied to each
item); items must not overlap; no clear mistake means an empty list; never about pauses, fillers, speed or pronunciation (issue 2's
rule: the model only has the transcript).

**What code checks, not the AI** (`src/domain/evaluation/sentence-fixes.ts`, run inside both quality gates; an item that fails is
dropped whole, never repaired; a drop is a `warn` in the quality report, `sentence_fix_dropped`, and never rejects the draft):

| Check | Drops an item when |
| --- | --- |
| Word for word | `you_said` is not one contiguous run of the transcript's words (case, punctuation and "um/uh" ignored), has an ellipsis, is one word, or is over 25 words |
| Pauses, pronunciation | its `why` says pause, hesitation, filler, silence, speed, pace, slow, fast, fluency, smooth, accent, stress, pronunciation, sound, vowel... (transcript-only; see "Decision" below) |
| No new idea | `better` is more than 3 words longer or shorter, keeps less than half of the student's words, or adds more than 2 new content words (a form of a student's word, like gave for give, is not new) |
| Something was fixed | `better` has the same words as `you_said` (this also drops "remove the um") |
| One mistake | the word-level difference is more than one change (neighbouring changed words count as one; a word moved to another place counts as one) |
| One short line | `why` is more than 20 words, or two sentences, or contains `;` |
| No internal words | `better` or `why` contains an internal field name (Parts 1 and 2) |
| Not twice | its words overlap an item already kept; more than 8 kept |

**Decision for the owner (one):** the spec says to drop pause and pronunciation items "from a transcript-only run". The sentence list
is always produced by the transcript evaluator, which never hears the recording (the audio step runs separately and writes only
pronunciation and fluency levels), so the code applies this check on every run, also when the audio step ran. If you want items about
pauses allowed when audio was assessed, the audio step would first have to feed the list; that is a separate change.

**To check on the next live run** (needs credit; `gemini-3.8-flash`; use the Part 2 anchors, 3 runs each, plus one Part 1.1, one
Part 1.2 and one Part 3 anchor):

1. In the saved quality report count `sentence_fix_dropped` warnings per run and group them by reason. A model that is following the
   prompt should lose few items; many `changes_too_much` or `adds_idea` means the "better" rule needs a stronger sentence.
2. Read every kept `better`. Does it keep the student's idea? Does it fix a different mistake from the one in `why`? Does it ever
   read like a model answer? Any of these means the rule is not holding even with the code checks.
3. Does an anchor with no clear mistake (A5, written text) get an empty list, or invented mistakes?
4. Do the items agree with `errors` (issue 1 again)? The same mistake is allowed in both lists; they must say the same thing.
5. Does the list change a band? It must not: scoring does not read it.

---

## 1. Quote, correction and goal must be about the same issue (one issue per goal)

**Status:** to test live before changing the prompt.

**Seen:** the Biggest fix card shows an error and its correction, then a goal about something else.

- `A2 r1`: error `"decide themselves"` → `"decide for themselves"` (a missing preposition). Goal: *"Try using a
  conditional sentence such as 'If I had not followed her advice, I would not have passed the exam'."* Check:
  *"Review your response and confirm it contains at least one sentence with 'if' or 'which'."* The student's mistake
  isn't conditionals, and the check adds a second structure ("which").
- `A2 r2`: same error. Goal: *"Use complex structures such as conditionals with 'if' or relative clauses with 'who' or
  'which'."* That's two structures in one goal, and neither is the error shown.
- `A0 r1`: error `"my father give me advice"` → `"my father gave me advice"`. Goal: *"Practise using past tense verbs
  (such as 'gave', 'wanted', and 'listened') when telling a past story, and add 'to' after 'want' and 'listen'."*
  This one matches the error but adds a second issue ("to" after want / listen).

**Why:** the card reads as one fix (you said → try instead → goal). When the goal is about another issue, the student
can't tell which one to work on, and the retry check measures something the card never showed them.

**Cause (current prompt):** the error list (line 100) and each skill's `how_to_improve` (line 75) are written
separately. The goal is the biggest-fix skill's `how_to_improve` (`deriveRetryFocus` in
`src/domain/evaluation/multilevel/result.ts`), so nothing ties it to the first error of that skill.

**Proposed rule:**

> For each feature, "how_to_improve" and "how_to_check" are about ONE issue. If you list errors of this feature
> (grammar or vocabulary), they are about the issue of the FIRST of those errors: the same rule the correction fixes.
> Never combine two issues with "and" or "or" in one instruction.

**How to check:** for each run whose biggest fix is a grammar/vocabulary feature with an error, does the goal name the
same rule as the first error's correction? Also count goals and checks that join two structures with "and"/"or".

## 2. Transcript-only scoring must never claim pauses, fillers, speed or "smoothly"

**Status:** to test live before changing the prompt.

**Seen:** without audio, fluency notes describe how the student *sounded*. All quotes are from transcript-only runs.

- `A4 r1`: *"You spoke smoothly and continuously for 110 seconds without noticeable pauses or fillers."*
- `A5 r1`: *"You spoke smoothly for 118 of the 120 seconds without any hesitations or filler words."*
- `A4 r3`: *"You spoke smoothly without fillers and maintained a consistent pace."*
- `A2 r1`: *"You spoke smoothly without fillers, but your speech was built from short, simple sentences."*
- `A1 r1`: *"You spoke smoothly without noticeable hesitations, but your answer was short and finished early."*
- `A0 r3`: *"You spoke for only 60 seconds at a slow pace with short phrases."* (a speed claim, used to rate fluency
  below B1)
- Advice built on the same claims: `A4 r1` how_to_improve *"…without pausing for breath"*; `A5 r3` how_to_check
  *"…without introducing pauses or fillers"*.

**Why:** a transcript can't show pauses, pace or smoothness. Silent pauses never reach the text, and the anchors are
written text with no fillers at all. Students read these notes as a judgement of their voice, and on `A0 r3` the claim
lowered the level.

**Cause (current prompt):** the prompt asks for this. Line 78: *"Fluency: from the transcript, judge pausing, false
starts and reformulations…"*. Line 123: *"Fluency feedback is about pauses, fillers, restarts and speaking time
only"*. Line 87 already says a clean transcript shows no fluency problem, but nothing stops the model praising
smoothness.

**Proposed rule** (replacing the fluency parts of lines 78 and 123 when there is no audio):

> Without audio you cannot hear the answer. Never say the student spoke smoothly, fluently, without pauses, without
> hesitation, at a good / slow / consistent pace, or anything about speed. Fluency notes may only describe what the
> text shows: written fillers ("um", "uh"), repeated words, restarted or unfinished sentences, sentence length, and
> how long they spoke (from <speech_metrics>, in seconds). If the text shows none of these, say only what it does show
> (e.g. "Your sentences are short and simple") and do not praise or criticise the flow.

**Open point for the owner:** speaking time is measured (`speakingSeconds` in `<speech_metrics>`), so "you spoke for
60 of the 120 seconds" stays allowed. Words per minute is also in the metrics; under this rule it counts as speed and
is not mentioned.

**How to check (can be automated):** in runs where `audio.status` is `not_assessed`, flag fluency `note`,
`how_to_improve` and `how_to_check` that match
`/smooth|fluent|without (any |noticeable |visible )?(pauses?|hesitations?|fillers?)|pace|slow|fast|speed/i`.
In this fixture set, 15 of the 19 runs have such a fluency text.

## 3. No ready-made sentences on the task's own topic: examples use a different topic

**Status:** to test live before changing the prompt.

**Seen:** advice the student can copy straight into the same task. The task is "advice from someone (an older person)".

- `A2 r1` (goal): *"…such as 'If I had not followed her advice, I would not have passed the exam'."*
- `A4 r1` (goal): *"…for example: 'Not only did I follow his advice, but I also created a study schedule.'"*
- `A3 r2`: *"…such as 'Not only did he give me advice, but he also...'."*
- `A1 r1`: *"…such as 'If young people always followed advice, they might not learn from experience'."*
- `A2 r3`: *"…for example: 'My English teacher, who had a lot of experience, gave me great advice.'"*
- `A3 r3` (cohesion): *"Use transition phrases like 'When it comes to whether young people should...' to signpost
  the start of Question 3."*
- Error-pattern rules: `A0 r1` *"…e.g., 'Older people are helpful.'"*; `A0 r3` *"…for example, 'older people are not
  right'."*

**Why:** the next attempt is the same task. A ready-made on-topic sentence gets recited, not learned: the retry
looks better while the skill hasn't moved. A recited text can also look memorised, which scores band 0.

**Proposed rule:**

> Examples you write inside "how_to_improve", "how_to_check", error-pattern "rule" and "how_to_fix" must use a
> DIFFERENT topic from the task (e.g. school, sport, travel, food), never the task's people, situation or question.
> Show the structure, not a sentence the student could copy into this answer.
> This does not apply to "correction" (it corrects the student's own words) or to "model_answer".

**Open point for the owner:** `model_answer` (the "Try instead" for a missed question) is on-topic by design (prompt
lines 69–72, added in PR #3). This rule leaves it as it is. If on-topic sentences should go everywhere, that's a
separate decision about `model_answer`, not part of this rule.

**How to check:** for each run, extract quoted sentences in the fields above and flag ones containing task words
(`advice`, `advise`, `older`, `young people`, plus the task's prompts). In these fixtures, 8 of the 15 runs of A1–A5 have one.

## 4. Goals describe a skill, never a required phrase

**Status:** to test live before changing the prompt.

**Seen:** the success check asks for specific words, so the student can "pass" by adding them anywhere.

- `A4 r1` (check shown on the card): *"Check your next attempt to ensure you include a structure starting with 'Not
  only...' followed by an inverted auxiliary verb."*
- `A1 r1`: *"Check that your text contains at least one sentence starting with 'If' followed by a past simple verb
  and 'would' or 'might'."*
- `A2 r1` / `A2 r2`: *"…confirm it contains at least one sentence with 'if' or 'which'."*
- `A1 r2` (cohesion): *"Verify that your attempt contains at least one linking phrase like 'on the other hand'."*

**Why:** a phrase check rewards inserting the phrase, not using the skill where it fits. It also feeds the retry
comparison: the next run's `retry_review` would mark it "achieved" for any sentence that starts with "Not only".

**Proposed rule:**

> "how_to_improve" and "how_to_check" describe a skill and where to use it, e.g. "Use one conditional to talk about
> how things could have turned out differently". Never require a set phrase or opening ("start with 'Not only'",
> "include 'on the other hand'"). A phrase may appear only as one example, marked "for example", on another topic
> (rule 3).

**How to check (can be automated):** flag `how_to_check` / `success_check` matching
`/(start(s|ing)? with|contains? (at least one|the)|include (a|the) (structure|phrase|sentence))\s.*'[^']+'/i`.

## 5. A0-below-b1 run 1: grammar "Below B1 in almost every sentence", yet Band 2

**Status:** fixed on 15 Nov 2026 by option a (prompt), evaluator 3.7.0: 5 of 5 runs band 0 on `gemini-3.8-flash`
(was 4 of 5 on 3.6.0). See "Live run on gemini-3.8-flash" above.

**Seen:** the same answer got band 2 twice and band 0 once.

| Run | Grammar | Vocabulary | Fluency | Cohesion | Mean | Language level | Band |
| --- | --- | --- | --- | --- | --- | --- | --- |
| r1 | Below B1 | B1 | B1 | B1 | 0.75 | B1 | **2** |
| r2 | Below B1 | B1 | B1 | B1 | 0.75 | B1 | **2** |
| r3 | Below B1 | Below B1 | Below B1 | B1 | 0.25 | Below B1 | **0** (expected) |

- `A0 r1` grammar note: *"Basic grammar errors in past tenses, prepositions, and subject-verb agreement occur in
  almost every sentence."* That is the official Below B1 grammar descriptor (*"…basic mistakes systematically
  occur"*).
- Its other notes rate the same text B1: vocabulary *"You used basic everyday vocabulary to answer all three
  questions, but repeated words like 'old people'."*; fluency *"You spoke in simple sentences without major hesitation…"*
  (also issue 2); cohesion *"You connected your ideas using simple linkers like 'because' and 'but'."*
- The transcript is *"my father give me advice. I am 16 year. I want stop school…"*.

**Why the band is 2:** the scorer averages the four judged features: (0 + 1 + 1 + 1) / 4 = 0.75, which rounds to B1,
and the B1 language cap is band 2. So one feature at Below B1 never pulls the band down while the other three are B1.
The answer reads as B1 on the result page ("Higher B1") although its grammar note describes Below B1.

**Options (owner decision; keep both open until the 3.8-flash retest):**

- **a. Prompt (descriptor weight):** tell the model that systematic basic grammar errors also limit vocabulary,
  fluency and cohesion. For example: *"If grammar is below_B1 because basic mistakes occur in most sentences, rate
  vocabulary, fluency and cohesion against the below_B1 descriptors first, and give B1 only with a quote that shows B1
  control."* Run 3 already did this on 3.6-flash. Risk: it double-counts grammar.
- **b. Scorer (rubric config, not the prompt):** let a below_B1 grammar level cap the language level, e.g. "grammar
  below_B1 ⇒ language level below_B1", or a lower language cap. This is deterministic, but it is a change to the
  official-scale logic in `band-scoring.ts` / `multilevel_q7.json`. It must be checked against every anchor (no run of A1–A5 has a below-B1 feature, so they would not move).

**How to check on 3.8-flash:** run `A0-below-b1` at least 5 times with the current prompt. Record the four levels and
the band for each run. If it is band 0 every time, close the issue. If it splits like 3.6-flash, try option a first
(prompt only); consider option b only if a doesn't settle it.

## Known flaky tests

Browser tests that failed once and then passed on rerun with no code change. List one here when it is seen, so a single
red run is not mistaken for a regression; remove it (or mark it fixed) once its cause is fixed.

**None open.**

### Fixed

| Test | Seen | Cause | Fix |
| --- | --- | --- | --- |
| `e2e/history.spec.ts` › "History: empty state, then the student's attempts newest first, retries, the part filter, the chart from 3 scored attempts, and the dashboard's Recent attempts" | 2026-11-06 and 2026-11-07 (2 of 4 full runs, 1 of 3 runs alone). It timed out on the retry's "Start speaking now" ("element is not stable", then "detached from the DOM"). | **An app race, not only a test race.** A retry opened by its link (`?retry=<id>`) showed the plain brief, with "Start preparation", before the attempt being retried had loaded. Clicking early started preparation; when the attempt arrived, `retryRequested` reset the screen to the retry brief, throwing the student out of preparation. The test clicked as soon as the button existed; `practice-flow.spec.ts` did not fail because it waits for "Your goal:" first. Proven with a probe that delays that request by 3 s: preparation was lost on the old code, kept on the new. | 2026-11-07. The brief shows "Loading your goal…" (no button) until the retried attempt has loaded; the reducer ignores a late `retryRequested` outside a brief. The test now waits for "Your goal:" and for preparation to start, as the student sees them (no retries, no longer timeouts). New regression test in `practice-flow.spec.ts` (delays the load by 3 s). Result: **10 of 10** runs of the History test alone (`--repeat-each=10`). |
