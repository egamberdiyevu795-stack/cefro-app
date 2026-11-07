# Teaching plan: which lesson each evaluator problem leads to

Status: **plan approved** (owner, 2026-11-05). No code, no content written yet. All open questions are decided in
[section 7](#7-decisions).

Sources this plan follows (so the lessons match what the evaluator really reports):

- **Part 2** (official Question 7, target B2): PR #5, evaluator 3.5.0, rubric `multilevel-q7/2.1.0`
  (`band-scoring.ts`, `result.ts`, `model-output.ts` on `claude/compassionate-johnson-odu08r`).
- **Part 1.1 / 1.2** (Questions 1–3 target A2, Questions 4–6 target B1): `docs/part1-plan.md` on `claude/part1-plan`.
- **Part 3** (official Question 8, target C1, band 0–6): `docs/part3-plan.md` on `claude/lucid-euler-460531`.

The principle stays the same as in scoring: **the model judges, code decides.** The evaluator already gives one
`biggest_fix` and up to two `retry_focus` items, computed by code. The lesson is chosen by code from those, not by the
model. The student sees **one lesson at a time**.

---

## 1. Problem list (everything the evaluator can report)

Each problem gets a stable code (`P-…`) so the lesson map, the content files and tests can refer to it.

### 1a. Feature levels

The evaluator judges each feature on the part's own 4- or 5-step ladder. A feature is a "problem" when it is the one
the scoring picks as the biggest fix or as the second retry focus.

| Part | Ladder | Features |
| --- | --- | --- |
| 1.1 | below_A1 · A1 · A2 · above_A2 | grammar, vocabulary, fluency, pronunciation (**no cohesion**) |
| 1.2 | below_A2 · A2 · B1 · above_B1 | grammar, vocabulary, fluency, cohesion, pronunciation |
| 2 | below_B1 · B1 · B2 · above_B2 | grammar, vocabulary, fluency, cohesion, pronunciation |
| 3 | below_B1 · B1 · B2 · C1 · above_C1 | grammar, vocabulary, fluency, cohesion, pronunciation (up to C1 only) |

Feature problems are grouped by **the student's level on that feature**, not by part, because the same official
level text comes back across parts (e.g. "basic mistakes systematically occur" is A2 in Part 1.1 and Part 1.2, and the
"below B1" reference in Part 2):

| Code | Feature | Student's level | What the evaluator says (official descriptor, short) |
| --- | --- | --- | --- |
| P-GR-A1 | grammar | A1 / below_A1 | Limited to words and phrases; errors in basic patterns impede understanding |
| P-GR-A2 | grammar | A2 | Some simple structures correct, basic mistakes systematically occur |
| P-GR-B1 | grammar | B1 | Simple structures correct; errors when attempting complex structures |
| P-GR-B2 | grammar | B2 | Some complex structures, with errors / limited range (Q7 B2) |
| P-GR-C1 | grammar | C1 | Range of complex structures, minor errors (Q8 band 5) |
| P-VO-A1 | vocabulary | A1 / below_A1 | Very basic words related to personal information |
| P-VO-A2 | vocabulary | A2 | Enough to respond; inappropriate word choices noticeable |
| P-VO-B1 | vocabulary | B1 | Enough range for the task; errors with complex thoughts |
| P-VO-B2 | vocabulary | B2 | Range for the topic, some imprecise or repeated words (Q7 B2) |
| P-VO-C1 | vocabulary | C1 | Range for the topic; some awkward usage or slightly inappropriate choices |
| P-FL-A1 | fluency | A1 / below_A1 | Pausing, false starts and reformulations impede understanding |
| P-FL-A2 | fluency | A2 | Frequent pausing, false starts, reformulations |
| P-FL-B1 | fluency | B1 | Some pausing, false starts, reformulations |
| P-FL-B2 | fluency | B2 | Mostly fluent, hesitation when searching for language (Q7 B2) |
| P-FL-C1 | fluency | C1 | Backtracking and reformulation do not fully interrupt the flow |
| P-CO-A2 | cohesion | A2 / below_A2 | Cohesion limited; responses tend to be a list of points |
| P-CO-B1 | cohesion | B1 | Only simple devices; links not always clearly indicated |
| P-CO-B2 | cohesion | B2 | Range of devices, some links unclear or overused (Q7 B2) |
| P-CO-C1 | cohesion | C1 | Range of devices clearly indicating links (target for above-C1 polish) |
| P-PR-A1 | pronunciation | A1 / below_A1 | Mostly unintelligible except isolated words |
| P-PR-A2 | pronunciation | A2 | Mispronunciations noticeable, frequent strain |
| P-PR-B1 | pronunciation | B1 | Generally intelligible, occasional strain |
| P-PR-B2 | pronunciation | B2 | Clear, some L1 features (Q7 B2) |

Notes:

- The exact B2 texts above are short paraphrases for this plan; the lesson files will quote the rubric JSON, not
  these lines.
- **Pronunciation problems exist only when the audio step assessed pronunciation.** From a transcript alone the
  quality gate blocks pronunciation judgements, so no pronunciation lesson is ever chosen from text.
- The evaluator also reports **error patterns** (`error_patterns`: name, rule, how_to_fix, up to 4) and single
  **errors** with corrections. Today the pattern name is free text. Section 4 explains how a lesson uses them.

### 1b. Question / answer status

| Code | Problem | Where the evaluator reports it | Parts |
| --- | --- | --- | --- |
| P-Q-MISSING | Question not answered | status `missing` | 1.1, 1.2, 2 |
| P-Q-OFFTOPIC | Off-topic answer (talks about something else) | status `off_topic` | 1.1, 1.2, 2 |
| P-Q-STORY-OPINION | Retells own story instead of giving an opinion (Q7 Question 3 trap) | status `off_topic` on an opinion question, note names the trap | 2 |
| P-Q-PARTIAL | Touched on but not fully answered (counts in 1.2) | status `partial` | 1.2, 2 |
| P-Q-COMPARE | Question 4: one picture only, or both without comparing | status `partial` on Q4 (`partialHint` "compare the two pictures") | 1.2 |
| P-Q-MINIMAL | One bare sentence, no reason / detail / example (does not count) | status `minimal` | 2 |
| P-Q-MEMORISED | Prepared text that ignores the questions | `memorized_or_irrelevant` → band 0, fix `own_words` | all |
| P-Q-SHORT | Under 30 spoken words | zero reason `too_short` | 2 |
| P-Q-NOSAMPLE | Fewer than 5 relevant words in the whole part | zero reason (Part 1.2 safety floor) | 1.2 |
| P-Q-PICTURE | Describes only the picture ("the man is giving advice to the girl") | all questions `off_topic` (anchor `A0-picture-only`) → `no_question_on_topic` | 2 |

### 1c. Part 3 (balanced argument)

| Code | Problem | Where the evaluator reports it |
| --- | --- | --- |
| P-3-ONESIDE | Points from one list only | coverage `one_side`, fix `section_coverage` |
| P-3-TWOEACH | Fewer than two listed points on a side | `covered(side) < 2`, "Choose two points from each list." |
| P-3-RESTATED | Point mentioned, nothing of the student's own added | point status `restated`, fix `point_development` |
| P-3-REBUTTAL | Opposing point only stated then rebutted ("some people say X, but…"), never supported | `restated` on that side, fix `point_development` (decision 8) |
| P-3-READS | Reads the points out | dependence `reads_prompts` → band 1 |
| P-3-DEPENDENT | Leans heavily on the prompt wording | dependence `heavily_dependent` → band 2 |
| P-3-MISREAD | Point put on the wrong side or misunderstood | point status `misread` |
| P-3-NOPOINT | No listed point addressed | coverage `none` → `no_point_addressed` |
| P-3-NOCONCLUSION | No weighed conclusion | `conclusion` = `one_sided` / `none` (feedback only, no band effect) |

`own_points` (the student's own extra arguments) are never a problem: feedback praises them.

---

## 2. Lesson map

Lesson ids are `L-…`. "Target" is the level the lesson moves the student **to**: one step above where the
evaluator placed them on that feature (decision 4). A student already above the part's target gets the lesson that
aims at the band-5 / band-6 condition: grammar and vocabulary each above target.

### 2a. Task lessons (question status and Part 3)

These come first in the biggest-fix order wherever coverage caps the band, so they are the most-used lessons.

| Lesson | Title | Target | One-line goal | Covers |
| --- | --- | --- | --- | --- |
| L-T1 | Answer every question | all | Give each question at least one sentence that answers it directly, then move on. | P-Q-MISSING, P-3-NOPOINT (variant) |
| L-T2 | Hear the question word | A2–B1 | Catch *who / what / why / how / do you think* and answer that, not the general topic. | P-Q-OFFTOPIC |
| L-T3 | Story question or opinion question? | B1–B2 | Tell "describe a time when…" from "do you think…", and answer an opinion with a view + reason. | P-Q-STORY-OPINION |
| L-T4 | Answer, reason, example | B1 / B2 / C1 (3 variants) | Build every answer as: direct answer → because… → for example… | P-Q-PARTIAL, P-Q-MINIMAL, P-3-RESTATED |
| L-T5 | Compare two pictures | B1 | Say what each picture shows, then one similarity and one difference (*both…, but…, whereas…*). | P-Q-COMPARE |
| L-T6 | Your own answer, not a prepared text | all | Use what you know, but start by answering the question you are actually asked. | P-Q-MEMORISED |
| L-T7 | Fill the time | A2–B2 | Keep talking for the whole time by asking yourself who / when / where / why / what happened next. | P-Q-SHORT, P-Q-NOSAMPLE |
| L-T8 | The picture is not the question | B1–B2 | Use the picture only as a hint; talk about your own experience and view. | P-Q-PICTURE |
| L-T9 | Two points from each list | C1 | Pick two FOR and two AGAINST points before you speak, and say which side each is on. | P-3-ONESIDE, P-3-TWOEACH, P-3-MISREAD |
| L-T10 | Support before you rebut | C1 | Give one real reason for the other side's point before you answer it. | P-3-REBUTTAL |
| L-T11 | Say it in your own words | B2–C1 | Name a point in a few words, then explain it with your own reason or example — never read the list. | P-3-READS, P-3-DEPENDENT |
| L-T12 | Weigh it up | C1 | End with a short conclusion that weighs both sides. | P-3-NOCONCLUSION (only offered as the second item, never as the biggest fix) |

Where one lesson covers several problems:

- **L-T4** covers `partial` (1.2), `minimal` (Part 2) and `restated` (Part 3). It is the same skill at three levels,
  so it has three variants (B1, B2, C1) with different examples and the same drill shape.
- **L-T7** covers both "under 30 words" (Part 2) and "no ratable sample" (Part 1.2).
- **L-T9** covers one side only, too few points per side, and misread points (all are "choose and place the points
  correctly").
- **L-T11** covers reading out and heavy dependence; the band-1 headline "Say the ideas in your own words." and the
  band-2 headline stay as written in the Part 3 plan.
- **L-T1** has a Part 3 variant for `no_point_addressed` ("address at least one point from each list").

### 2b. Language lessons (features)

One lesson per feature per step. Grammar and vocabulary steps list **sub-lessons** for common error patterns. In v1
only the general lesson for each step is used (chosen by feature + level, decision 1); the sub-lessons come with the
later mistake codes (section 4).

| Lesson | Title | Target | One-line goal | Covers |
| --- | --- | --- | --- | --- |
| **Grammar** | | | | |
| L-G1 | From words to sentences | A2 | Turn single words into short sentences: *I + verb + thing* (*I like plov. I live with my parents.*). | P-GR-A1 |
| L-G2 | Fix the basics | B1 | Stop one repeated basic mistake. Sub-lessons: G2a *he/she/it + -s*, G2b *be + -ing*, G2c past simple, G2d *a / the*, G2e *in / on / at*, G2f questions and negatives. | P-GR-A2 |
| L-G3 | Longer sentences that work | B2 | Use 2–3 complex structures accurately. Sub-lessons: G3a present perfect vs past, G3b *who / which / that* clauses, G3c *if* sentences, G3d *used to / would*. | P-GR-B1 |
| L-G4 | More range, fewer slips | C1 | Add range: G4a passive, G4b mixed / unreal conditionals, G4c *-ing* and participle clauses, G4d modals of deduction and advice in the past. | P-GR-B2 |
| L-G5 | Precision at C1 | above C1 | Remove the remaining minor errors and add inversion / cleft sentences for emphasis. | P-GR-C1 |
| **Vocabulary** | | | | |
| L-V1 | Words for me and my day | A2 | Enough words for family, home, food, free time, school and work to answer Part 1.1. | P-VO-A1 |
| L-V2 | The right word | B1 | Fix noticeable word choices: V2a *make / do / have / take*, V2b *say / tell / speak / talk*, V2c false friends from Uzbek / Russian, V2d *go to / visit / come*. | P-VO-A2 |
| L-V3 | Topic words and paraphrase | B2 | Learn 8–10 topic words per task and say a word you don't know another way. | P-VO-B1 |
| L-V4 | Precise, not repeated | C1 | Replace *good / bad / thing / very* with exact words; use natural collocations. | P-VO-B2 |
| L-V5 | Natural and idiomatic | above C1 | Fix awkward usage; use a few idiomatic phrases accurately. | P-VO-C1 |
| **Fluency** | | | | |
| L-F1 | Keep going | A2 | Use short fillers (*well, let me think*) instead of long silence; finish the sentence instead of restarting. | P-FL-A1, P-FL-A2 |
| L-F2 | Think in chunks | B1–B2 | Speak in ready-made chunks (*the main reason is…, what I mean is…*) to cut pauses. | P-FL-A2 (Part 1.2), P-FL-B1 |
| L-F3 | Longer turns | B2–C1 | Plan the shape (point → reason → example) during preparation so speech flows for 2 minutes. | P-FL-B1 (Part 2/3), P-FL-B2 |
| L-F4 | Repair without stopping | above C1 | Reformulate mid-sentence smoothly (*or rather…, I mean…*). | P-FL-C1 |
| **Cohesion** | | | | |
| L-C1 | Join your ideas | B1 | Join points with *and, but, because, so, then* instead of a list. | P-CO-A2 |
| L-C2 | Show the link | B2 | Use *however, for example, as a result, although, on the other hand*. | P-CO-B1 |
| L-C3 | Signpost the argument | C1 | Use a range: *whereas, which means that, that's why, firstly… finally, to sum up*. | P-CO-B2 |
| L-C4 | Cohesion that sounds natural | above C1 | Avoid over-using linkers; use reference (*this, such a…*) and ellipsis. | P-CO-C1 |
| **Pronunciation** (audio only; tips only until the audio check is on, decision 8) | | | | |
| L-P1 | Clear words | A2 | Clear vowels and word endings (*-s, -ed, -t*), stress on the right syllable in common words. | P-PR-A1, P-PR-A2 |
| L-P2 | Stress and chunks | B1–B2 | Stress the key word in a sentence; pause between chunks, not inside them. | P-PR-B1 |
| L-P3 | Intonation | C1 | Rising / falling tone for lists, questions and contrast. | P-PR-B2 |

Notes:

- Part 1.1 has no cohesion feature, so no cohesion lesson is chosen from Part 1.1.
- Part 3 pronunciation stops at C1 (decision 7), so there is no "above C1" pronunciation lesson.
- The fluency lessons depend on the part: an A2 fluency problem in Part 1.1 (30-second answers) gets L-F1; the same
  level in Part 1.2 (B1 target) gets L-F2. The rule is "the lesson whose target is the next step on this part's
  ladder".

---

## 3. Lesson format

One lesson = one skill, one screen flow, **about 8–12 minutes** including the retry.

| Step | Content | Time |
| --- | --- | --- |
| 1. Why this lesson | One line linking to the result: "Your answer to Question 3 was a story, but the question asks for your opinion." Uses the evaluator's own note / quote. | 10 s |
| 2. Short explanation | At most ~120 words, plain English at the lesson's level. One rule or one habit, never a list of rules. A1–A2 lessons add a short Uzbek explanation under the English one (decision 3). | 1 min |
| 3. Examples | 3–4 short pairs *weaker → better*, written by us and marked as made up. When the result has a matching error (with its correction) or a `model_answer`, it is shown first, marked "from your answer". | 1–2 min |
| 4. Speaking drill | 3–5 short spoken prompts, 15–30 s each, that practise only this skill (e.g. "Answer in one sentence, then add *because…*"). Recorded; the student listens back and ticks a 2–3 item checklist. **Self-check only, no AI scoring** (decision 2). Pronunciation lessons have no drill until the audio check is on (decision 8). | 3–4 min |
| 5. Retry the same task | The same task as the original attempt, with the lesson's goal shown as the retry focus. The existing retry flow and `retry_review` judge it (achieved / partly / not). This is the only AI-scored step. | 1.5–3 min speaking + prep (task timings) |

Shape of one lesson file (proposal, for the build stage):

```ts
interface Lesson {
  id: "L-T4";               // stable
  variant?: "B1" | "B2" | "C1";
  version: number;          // bumped on any content change, like tasks
  title: string;
  targetLevel: "A2" | "B1" | "B2" | "C1" | "above_C1";
  problems: ProblemCode[];  // the P-… codes from section 1
  parts: (1.1 | 1.2 | 2 | 3)[];
  explanation: string;      // ≤ 120 words, English
  explanationUz?: string;   // short Uzbek explanation, required for A1–A2 lessons (decision 3)
  examples: { weaker: string; better: string; note?: string; madeUp: true }[]; // 3–4, always made up (decision 7)
  drill: { prompt: string; seconds: number }[];                  // 3–5; [] for pronunciation until audio is on
  checklist: string[];      // 2–3 self-check items
  retryObjective: string;   // matches the retry_focus wording style
  draftedBy: "ai" | "human"; writtenAt: string;
  reviewedBy?: string; reviewedAt?: string; // must be set before the lesson is used (decision 7)
}
```

**Lesson examples never use the retry task's topic.** The weaker → better examples use a different topic of the
same kind (e.g. Part 2 "Describe a time when someone helped you" for lessons retried on the advice task), so students
cannot copy lesson sentences into the retry. The drills and the retry stay on the retry task.

Examples and drill prompts get TTS audio with the same voice as the Part 1 question audio.

---

## 4. How a lesson is chosen (one at a time)

The lesson follows the **first retry focus item**, which is already the biggest fix. Nothing new is decided by the
model. The second retry focus item stays as text on the result screen ("Also try…"), not as a second lesson.

| `biggest_fix` (from code) | Extra input | Lesson |
| --- | --- | --- |
| `own_words` | — | L-T6 |
| `question_coverage` (Q*n*) | status of Q*n* = `missing` | L-T1 |
| | `off_topic`, opinion question answered with a story (Part 2 Q3) | L-T3 |
| | `off_topic`, all questions off-topic and picture words in the evidence | L-T8 |
| | `off_topic` (other) | L-T2 |
| | `partial` on Part 1.2 Question 4 | L-T5 |
| | `partial` / `minimal` | L-T4 (variant = part's target) |
| zero reason `too_short` / no ratable sample | — | L-T7 (the code may still pick fluency first when fluency is lowest alone; then the fluency lesson) |
| `prompt_dependence` (Part 3) | — | L-T11 |
| `section_coverage` (Part 3) | — | L-T9 |
| `point_development` (Part 3) | fewer than 2 points on a side | L-T9 |
| | that side was only rebutted | L-T10 |
| | otherwise | L-T4 (C1 variant) |
| `feature` | feature + the student's level on it + the part | section 2b, one step up |

**Feature lessons in v1 (decision 1): feature + level only.** The lesson is the one for that feature whose target
is one step above the student's level on it (decision 4). If the student is already above the part's target on that
feature, the lesson aims at the band-5 condition (Part 3: band 6): grammar and vocabulary each above target, so the
lesson is the grammar or vocabulary one, whichever is not yet above target (grammar first, as in `FIX_PRIORITY`).
The evaluator's free-text `error_patterns` and errors are still shown inside the lesson as "from your answer"
examples, but they do not choose the lesson.

**Later: mistake codes.** A closed `pattern_code` field on `errorPatternSchema` (G2a…G4d, V2a…V2d, `other`) will pick
the sub-lesson (e.g. "Missing -s after he/she/it" → L-G2a). It changes the prompt, so it comes in a later evaluator
version, **after Part 2 is merged and live-tested**, with its own live check. Until then, no sub-lesson is chosen.

**After the retry** (`retry_review` on the lesson's objective):

| Outcome | Next |
| --- | --- |
| achieved | The new result's biggest fix picks the next lesson. |
| partly_achieved | Same lesson once more with the second example set (each lesson has two). |
| not_achieved twice | Step down: the same skill one level lower if it exists (e.g. L-T4 B2 → B1), else move to the next biggest fix and mark the skill "come back later". |

A student never sees the same lesson more than twice in a row. v1 shows only the lesson chosen from the biggest fix; a lesson
library (browse all lessons) comes later (decision 5).

---

## 5. Levels and build order

### Lessons by level

| Level | Task lessons | Language lessons |
| --- | --- | --- |
| **A1–A2** (Part 1.1) | L-T1, L-T2, L-T6 | L-G1, L-G2 (a–f), L-V1, L-V2 (a–d), L-F1, L-P1 |
| **B1** (Part 1.2, low Part 2) | L-T4 (B1), L-T5, L-T7 | L-G3 (a–d), L-V3, L-F2, L-C1, L-C2, L-P2 |
| **B2** (Part 2, low Part 3) | L-T3, L-T4 (B2), L-T8, L-T11 | L-G4 (a–d), L-V4, L-F3, L-C3, L-P3 |
| **C1** (Part 3) | L-T4 (C1), L-T9, L-T10, L-T12 | L-G5, L-V5, L-F4, L-C4 |

(Rows show where lessons are mostly used; a lesson's target is one step up, so e.g. L-G2 "Fix the basics" is used
by A2 students and targets B1.)

### Build order

Same order as the parts ship: Part 2 is the first live part, then Part 1, then Part 3.

1. **Wave 1 — Part 2 task lessons** (cap the band most often, cheap to write): L-T1, L-T3, L-T4 (B2), L-T6, L-T7,
   L-T8. Plus the lesson screen flow and the "biggest fix → lesson" mapping.
2. **Wave 2 — Part 2 language lessons** (B1 → B2 is the common gap): L-G3, L-V3, L-F2, L-F3, L-C2, L-C3, then L-G4,
   L-V4, as general lessons (decision 1). Sub-lessons (L-G3a–d etc.) are written once mistake codes exist.
3. **Wave 3 — Part 1** (after Part 1 ships): L-T2, L-T5, L-T4 (B1), L-G1, L-G2, L-V1, L-V2, L-F1, L-C1, each with
   the Uzbek explanation where it is an A1–A2 lesson.
4. **Wave 4 — Part 3** (after Part 3 ships): L-T9, L-T10, L-T11, L-T4 (C1), L-T12, L-G5, L-V5, L-F4, L-C4.
5. **Pronunciation** (L-P1–L-P3): **tips only** (explanation + examples, no drill) until the audio check is on
   (decision 8); drills and a checked retry are added once it is on by default.

Within a wave, write the lessons for the most frequent biggest fixes first, measured from stored results once there
are real attempts.

---

## 6. Content sources

- **Drafting (decision 7):** an AI writes the first draft of each lesson; the owner reviews **every** lesson before it
  is used. Each draft marks every example as made up and lists the problem codes (section 1) it covers. A lesson with
  no `reviewedBy` is never shown to students.
- **All lesson text, examples and drills are our own writing.** No copied or lightly reworded textbook material
  (no exercises, example sentences or explanations taken from published course books or grammar books), no
  official exam questions or pictures, no content from other exam-prep apps or websites.
- **Official UZBMB descriptors** may be quoted only where the rubric files already quote them (as the reason a
  lesson was chosen), never as lesson content.
- **General grammar facts** (e.g. "he/she/it takes -s in the present simple") are common knowledge; the wording and
  every example are written fresh.
- **Examples are synthetic.** No real student answers in lesson files. A student's own quote appears only at run
  time, from their own result.
- Topics follow the same allowed list as Part 3 (decision 9): no weapons, religion, party politics, crime, personal
  tragedy.
- Each lesson file records who drafted it, the date and the reviewer (section 3 shape), like the picture licence
  fields.
- Audio: generated with our TTS voice. Any sound or image from outside must be original or CC0 / freely licensed,
  with the source recorded, as for task pictures.

---

## 7. Decisions

All decided by the owner, 2026-11-05.

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Mistake codes | Yes, but not now. **v1 chooses the lesson by feature + level only.** Fixed mistake codes (`pattern_code`) come in a later evaluator version, after Part 2 is merged and live-tested, because they change the prompt and need their own live check. |
| 2 | Drill checking | **Self-check in v1** (no extra Gemini cost). Only the full-task retry is AI-scored. |
| 3 | Explanation language | **English for all lessons.** A1–A2 lessons also get a short Uzbek explanation. Russian later, if users ask for it. |
| 4 | Lesson level | **One level above the student's current level for that feature.** If the student is already above the part's target, the lesson aims at the band-5 condition (grammar and vocabulary above target; band 6 in Part 3). |
| 5 | Lesson library | Later, not v1. **v1 = only the lesson chosen from the biggest fix.** |
| 6 | Repeat rule | Yes: **at most twice in a row**, then an easier version or the next fix. |
| 7 | Writing | **AI writes first drafts; the owner reviews every lesson before it is used.** Each draft marks its examples as made up and lists the problem codes it covers. |
| 8 | Pronunciation | **Tips only until the audio check is on.** No pronunciation drills before then. |
| 9 | "Weigh it up" (L-T12) | Second suggestion only, never the biggest fix. Approved. |
