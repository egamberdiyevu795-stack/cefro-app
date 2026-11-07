# Feedback review: evaluator issues for the next live run

**Status of every item below: to test live before changing the prompt.** Nothing here has been changed in the code
or the prompt yet. No model was called to write this review.

- **Source:** the saved outputs in `test/fixtures/live-3.6-flash/` (evaluator 3.5.0, commit `4edee53`, 2026-11-06).
- **Model caveat:** those runs used `gemini-3.6-flash`, **not** the production model (`gemini-3.8-flash`), and were
  transcript-only (no audio step). Each issue has to be confirmed on `gemini-3.8-flash` before the prompt changes.
- **Quotes** below are copied exactly from the fixtures (anchor and run given, e.g. `A2 r1` = `A2-b1-all-three`,
  run 1). Prompt lines refer to `src/server/evaluation/prompts/multilevel-evaluation.ts` at this commit.
- **What students see:** these fields reach the result page directly. The goal is the first `retry_focus`, the one
  "Retry with this goal" carries; "Try instead" is the error's `correction`.

## Plan for the next live run

1. Run the Part 2 anchor set on `gemini-3.8-flash` with the **current** prompt, 3 runs per anchor, and save the full
   outputs, including the quality report this time.
2. Count each issue below in those outputs, using the "How to check" line of each issue.
3. Change the prompt only for issues that still show up on `gemini-3.8-flash`. One rule per change, bump the evaluator
   version, rerun the anchor set and compare bands. A rule must not move any anchor off its expected band.

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

**Status:** to test live before changing the prompt, and retest on `gemini-3.8-flash` before touching the scorer.

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

Browser tests that have failed once and then passed on rerun with no code change. Not fixed yet; listed so a single
red run is not mistaken for a regression. Rerun the one test before investigating; if it fails twice in a row, treat
it as a real failure.

| Test | Seen | What happened | Reruns |
| --- | --- | --- | --- |
| `e2e/history.spec.ts` › "History: empty state, then the student's attempts newest first, retries, the part filter, the chart from 3 scored attempts, and the dashboard's Recent attempts" | 2026-11-06, branch `claude/cefro-part-2-tasks-yfr6x5`, in a full run of the four specs | Timed out (90 s) on the retry's `recordAnswer`: clicking "Start speaking now" kept retrying with "element is not stable" / "element was detached from the DOM". The preparation screen seems to re-render under the click (likely the retry page still loading its goal or earlier attempts). | Passed 2 of 2 alone on the same branch, passed on the base branch, and passed in the next full run (27 of 27). |

Likely fix, for later: in `recordAnswer`, wait for the preparation countdown to be visible (or for the retry goal card)
before clicking "Start speaking now", instead of clicking as soon as the button exists.
