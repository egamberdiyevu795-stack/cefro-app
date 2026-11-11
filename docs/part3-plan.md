# Part 3 plan: official Question 8 (balanced argument, target C1, band 0–6)

Status: **plan closed; built in mock mode on `claude/part3` ([section 10](#10-built-on-claudepart3)); the real
recording and scoring flow is built on `claude/p3-real` ([section 11](#11-the-real-flow-built-on-claudep3-real)).** All
decisions are recorded in [section 5](#5-decisions). Part 3 stays off (`PART_LIVE["3"] = false`) until the live
anchor run: the real pages exist but answer 404 while the switch is off.

Part 3 reuses the Part 2 design ([`ARCHITECTURE.md` › AI evaluation](ARCHITECTURE.md#ai-evaluation)): **the model
judges, with exact quotes; code computes the band.** What changes is *what* is judged. Part 2 counts answered
questions. Part 3 has no question count. Its band depends on three things:

| Axis | Values | Who decides |
| --- | --- | --- |
| (a) Sections covered | none / one side / both sides / both sides in full | Model judges each listed point; **code** derives coverage |
| (b) Dependence on the prompt text | own development / heavily dependent / reads the prompts | Model judges **and** code measures text overlap; code combines |
| (c) Language level | below B1 / B1 / B2 / C1 / above C1 | Model judges each feature; **code** takes the best fit |

---

## 1. Task format

Official Question 8:

- A **topic statement** (one sentence).
- A **FOR** list of 3 points and an **AGAINST** list of 3 points (short phrases, not sentences).
- The student chooses **two points from each list** and gives a **balanced argument**.
- **1 minute preparation, 2 minutes speaking.**
- Official sample (format reference only, not used as content): *"Citizens should be allowed to carry personal guns."*
  We author our own topics.

### Content shape (proposal)

A new task type next to `long_turn` in `src/domain/speaking/task.ts`:

```ts
export type SpeakingTaskType = "long_turn" | "balanced_argument";
export type RubricId = "multilevel-q7" | "multilevel-q8";

interface ArgumentPoint {
  /** "F1".."F3" for FOR, "A1".."A3" for AGAINST. Stable: used in the prompt, the model output and stored results. */
  id: `F${1 | 2 | 3}` | `A${1 | 2 | 3}`;
  side: "for" | "against";
  text: string;
}

interface BalancedArgumentTask extends Omit<SpeakingTask, "prompts" | "taskType"> {
  taskType: "balanced_argument";
  /** The topic statement, e.g. "Cities should ban private cars from their centres." */
  statement: string;
  points: ArgumentPoint[]; // exactly 3 FOR + 3 AGAINST, validated at load
}
```

`SpeakingTask` becomes a discriminated union on `taskType`, so Part 2 code keeps `prompts` and Part 3 code gets
`statement` + `points` without optional fields leaking into either. `evaluatorGuidance` stays (private, never sent
to the browser), and describes what "addressing" each point looks like.

Student instructions (draft):

1. You have 1 minute to prepare. You may make notes.
2. Choose **two points from FOR and two from AGAINST**.
3. Speak for up to 2 minutes. Explain each point **in your own words** with a reason or an example.
4. Don't read the points out: the list is a prompt, not your answer.

UI: the statement on top, two columns (FOR / AGAINST) with the points labelled F1–F3 and A1–A3. Same timer
components as Part 2 (`preparationSeconds: 60`, `speakingSeconds: 120`).

---

## 2. Official bands (verbatim)

- **6:** Performance is likely to be above the C1 level.
- **5 (C1):** The presentation is clear, highlighting points from each section. Gives reasons in support of and
  against particular points of view.
  - A range of complex grammar constructions are used accurately. Some minor errors occur but do not impede understanding.
  - A range of vocabulary is used to discuss the topic required by the task. There is some awkward usage or slightly inappropriate word choices.
  - Pronunciation is intelligible.
  - Backtracking and reformulations do not fully interrupt the flow of speech.
  - A range of cohesive devices are used to clearly indicate the links between ideas.
- **4 (Higher B2):** The response addresses the points from each section + Question 7 B2 features.
- **3 (Lower B2):** The response addresses the points from only one of the sections + Question 7 B2 features.
- **2 (Higher B1):** The candidate is unable to construct a coherent and sustained response and is heavily dependent
  on the input prompts. + Question 7 B1 features.
- **1 (Lower B1):** The candidate is unable to construct a coherent and sustained response and reads directly from
  the input prompts. + Question 7 B1 features.
- **0:** Performance is below B1, or there is no meaningful language, or all responses are completely off-topic.

### Feature descriptors the model judges against

| Level | Source | Text |
| --- | --- | --- |
| above C1 | Q8 band 6 | No feature text: "likely above C1". Judged only when the evidence clearly exceeds every C1 descriptor (no awkward usage, natural idiomatic range, flow never interrupted). Same rule as Q7's `above_B2`. |
| C1 | Q8 band 5 (verbatim, the five bullets above) | grammar, vocabulary, pronunciation, fluency, cohesion |
| B2 | Q7 B2 (already verbatim in `multilevel_q7.json`) | reused as-is, because Q8 bands 3–4 say "+ Question 7 B2 features" |
| B1 | Q7 B1 (already verbatim) | reused as-is, because Q8 bands 1–2 say "+ Question 7 B1 features" |
| below B1 | Q4–6 "Higher A2" reference (already in Q7 file) | reused as a recognition aid only, same note as in Q7 |

The C1 band text also has two task-level sentences ("highlighting points from each section", "gives reasons in
support of and against"). These are **not** a language feature: they feed axis (a) as the "both sides in full"
coverage level (section 4).

---

## 3. Judgement schema (model output)

Same rules as Part 2's `multilevel-model-output.ts`: judgements and exact quotes only; **no band, no score, no
overall level**. Zod is the guard.

```ts
const POINT_STATUSES = ["developed", "restated", "not_addressed", "misread"] as const;
const DEPENDENCE = ["own_development", "heavily_dependent", "reads_prompts"] as const;
const Q8_LEVELS = ["below_B1", "B1", "B2", "C1", "above_C1"] as const;

const pointAssessment = z.object({
  id: z.enum(["F1", "F2", "F3", "A1", "A2", "A3"]),
  status: z.enum(POINT_STATUSES).describe(
    "developed: the student explains the point with at least one reason, example or consequence of their own. " +
    "restated: the point is mentioned (read, paraphrased or named) but nothing is added. " +
    "not_addressed: not mentioned. " +
    "misread: presented on the wrong side or with a meaning the point does not have."),
  evidence: z.string().describe("Exact substring of the transcript where the point is made, or ''."),
  development_evidence: z.string().describe("Exact substring with the student's own reason/example for this point, or '' unless developed."),
  note: z.string(),
  model_answer: z.string().describe("For restated / not_addressed points the student should have chosen: 1–2 sentences (≤ 40 words) developing it at C1. '' otherwise."),
});

const ownPoint = z.object({
  side: z.enum(["for", "against"]),
  evidence: z.string().min(1).describe("Exact substring: an argument of the student's own that is not on the list."),
  note: z.string(),
});

export const q8ModelOutputSchema = z.object({
  points: z.array(pointAssessment).length(6),                // exactly F1..F3, A1..A3 (quality gate)
  own_points: z.array(ownPoint).max(4),
  prompt_dependence: z.object({
    level: z.enum(DEPENDENCE),
    evidence: z.array(z.string()).max(4).describe("Exact substrings that show reading or leaning on the prompt text; [] for own_development."),
    note: z.string(),
  }),
  coherent_and_sustained: z.boolean().describe("false when the answer is a list of fragments rather than a connected argument."),
  conclusion: z.enum(["weighed", "one_sided", "none"]).describe("Feedback only; no band effect."),
  features: { grammar, vocabulary, fluency, cohesion, pronunciation },   // levels on Q8_LEVELS; same fields as Part 2
  memorized_or_irrelevant: z.boolean(),
  errors, error_patterns, strengths, retry_review,                       // unchanged from Part 2
});
```

Notes:

- `restated` vs `developed` is the core judgement. Reading "safer streets for pedestrians and cyclists" counts as
  **restated**; adding "because children walk to school across busy roads" makes it **developed**.
- **Naming a point is not reading it.** "Safer streets for pedestrians and cyclists. My brother cycles to school and
  was nearly hit twice…" is `developed`. The point text is only "reading" when nothing of the student's own follows it
  (decision 5, measured in section 6).
- **Rebuttals** (decision 8): "some people say the metro isn't good enough, but…" **addresses** A3 (`restated`), so
  the AGAINST side counts as covered. It is `developed` only if the student first gives at least one real reason or
  example *supporting* A3. The rebuttal itself develops the student's own side, not A3's, and is never A3's
  `development_evidence`. A counter-argument that never states the opposing point ("the metro is cheap, so people
  would adapt") argues FOR and does not cover A3 at all (see anchor 3 and fixture R1).
- `own_points` **never count towards coverage** and never raise the band (decision 2). They are recorded so the
  feedback can say "good extra argument" with the quote.
- Pronunciation is judged on the ladder up to **C1 only**, never `above_C1`, and is not part of the band-6 gate
  (decision 7).
- Strengths: allowed only for features judged **C1 or above** (Part 2 uses B2+; the threshold moves to the target).

### Code-side derived values

```ts
covered(side)    = points on that side with status developed | restated            (count)
developed(side)  = points on that side with status developed                       (count)

coverage =
  "none"             if covered(for) == 0 && covered(against) == 0
  "one_side"         if exactly one side has covered ≥ 1
  "both_sides_full"  if covered(for) ≥ 2 && covered(against) ≥ 2 && developed(for) ≥ 1 && developed(against) ≥ 1
  "both_sides"       otherwise (both sides have covered ≥ 1)
```

Only the six listed points are counted; `own_points` are ignored here. `misread` counts as not covered and is
surfaced as feedback. Whenever `covered(side) < 2` on either side, the feedback adds **"Choose two points from each
list."**, whatever the band.

---

## 4. Band logic

Same structure as `band-scoring.ts`: zero rules first, then `band = min(coverage_cap, dependence_cap, language_cap)`.
All numbers live in the rubric JSON (`multilevel_q8.json`), not in code.

### Zero rules (checked in this order)

| zero_reason | Condition |
| --- | --- |
| `memorized_or_irrelevant` | model flag |
| `no_point_addressed` | coverage = none |
| `below_B1` | language level = below_B1 |

### Caps

| Coverage | cap | | Dependence (final, §6) | cap | | Language level | cap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | 0 | | reads_prompts | 1 | | below_B1 | 0 |
| one_side | 3 | | heavily_dependent | 2 | | B1 | 2 |
| both_sides | 4 | | own_development | 6 | | B2 | 4 |
| both_sides_full | 6 | | | | | C1 | 5 |
| | | | | | | above_C1 | 6 * |

Language level = mean of assessed features on the 5-step ladder (below_B1 = 0 … above_C1 = 4), nearest step,
exact .5 rounds **down** (Part 2's `bestFitLevel`, generalised to a ladder from config).

\* **Band-6 gate** (decision 7): the `above_C1` cap of 6 applies only when the language level is `above_C1` **and**
grammar and vocabulary are each judged `above_C1`. Otherwise an `above_C1` language level is capped at 5.
Pronunciation (judged up to C1 only) and fluency/cohesion are not part of the gate. Config: reuse the Part 2
mechanism from PR #5, `scoring.above_target_requires: ["grammar", "vocabulary"]` (`rubric-config.ts`,
`band-scoring.ts`); no new mechanism.

### Resulting band table

| Coverage | Dependence | Language | Band | Official reading |
| --- | --- | --- | --- | --- |
| any | any | below B1 | **0** | below B1 |
| none | any | any | **0** | completely off-topic |
| ≥ one side | reads_prompts | ≥ B1 | **1** | reads directly from the input prompts |
| ≥ one side | heavily_dependent | ≥ B1 | **2** | heavily dependent on the input prompts |
| ≥ one side | own_development | B1 | **2** | B1 features (highest B1 band) |
| one_side | own_development | ≥ B2 | **3** | points from only one section |
| both_sides | own_development | ≥ B2 | **4** | points from each section, B2 cap |
| both_sides_full | own_development | B2 | **4** | language caps at B2 |
| both_sides_full | own_development | C1 | **5** | C1: each section, reasons for and against |
| both_sides_full | own_development | above C1, grammar **and** vocabulary above C1 | **6** | likely above C1 |
| both_sides_full | own_development | above C1, grammar or vocabulary at C1 or below | **5** | band-6 gate not met |

Coverage counts **listed points only** (decision 2, decision 3): `one_side` = at least one listed point addressed on
only one side; `both_sides` = at least one on each side; `both_sides_full` = two listed points per side with at least
one developed per side, where "developed" means a real reason or example *supporting* that point (a rebuttal does
not develop the point it rebuts, decision 8). Once coverage is full, band 4 vs 5 vs 6 is decided by language alone
(B2 / C1 / above C1 with the band-6 gate).

Two consequences worth stating to students: one-sided answers stop at 3 whatever the language; reading the list
stops at 1 whatever the language (decision 5, the official text). A C1 speaker who uses only one point per side
stops at 4.

`coherent_and_sustained = false` is **not** a separate cap: the official text pairs it with dependence ("unable to
construct a coherent and sustained response **and** is heavily dependent / reads"). It is stored and used as a
consistency check (see the quality gate, §7).

### Target and labels

- `band_max: 6`, `meets_target_band: 5` (C1).
- Labels: 6 Above C1, 5 C1, 4 Higher B2, 3 Lower B2, 2 Higher B1, 1 Lower B1, 0 Below B1.
- `provisional` when pronunciation is not assessed (unchanged).

### Biggest fix (one thing to change next time)

Pick the cap that binds lowest; ties go in this order:

1. `own_words` — zero for memorised answers.
2. `prompt_dependence` — dependence cap is the binding one. Headline for band 1: **"Say the ideas in your own
   words."** For band 2: "Explain each point in your own words with a reason or an example." Both show the student
   which of their sentences matched the list (§6's `copied` spans).
3. `section_coverage` — coverage cap binds at `one_side`: name the missing side, say **"Choose two points from each
   list."**, and suggest one point from the missing side with its `model_answer`.
4. `point_development` — coverage is `both_sides` but not full: if fewer than two listed points on a side, **"Choose
   two points from each list."**; otherwise name the restated point to develop with a reason. When that side's points
   were only rebutted (decision 8): "Before you argue against a point, give one real reason that supports it."
5. `feature` — lowest language feature (same `FIX_PRIORITY` as Part 2).

---

## 5. Decisions

All ten decisions are approved by the reviewer (1–5 on the first draft, 6–10 on the second, with the
clarifications to 7, 8 and 9 below).

| # | Topic | Decision | Reason |
| --- | --- | --- | --- |
| 1 | Level scale | **Each rubric declares its own ladder.** Q7 keeps `below_B1 … above_B2`; Q8 declares `below_B1, B1, B2, C1, above_C1`. Part 2 code and its stored v3 results stay unchanged. | No migration of stored results; the scorer reads the ladder from config. |
| 2 | Own arguments | **Never count towards coverage and never raise the band.** Recorded in `own_points` and praised in feedback ("good extra argument", with the quote). | The official task says to choose points from the lists. |
| 3 | Coverage | `one_side` = ≥ 1 listed point addressed on only one side → cap 3. `both_sides` = ≥ 1 listed point on each side → cap 4. `both_sides_full` = 2 listed points per side, ≥ 1 developed per side → cap 6. Band 4 vs 5 is then decided by language (B2 vs C1). Feedback says **"Choose two points from each list."** whenever fewer than two listed points are used on a side. | Follows the official 3/4/5 wording; band 5 asks for points from each section *with* reasons for and against. |
| 4 | Model vs code (dependence) | **The model decides in v1.** Code overrides only in the clear case: `copied_ratio ≥ 0.50` **and** `points_read ≥ 4` → `reads_prompts`. Every other disagreement is logged and flagged, not applied. Thresholds are reviewed on real recordings before code gets more power. | The overlap measure is only calibrated on synthetic anchors. |
| 5 | Reading out | **Reading the list = band 1 whatever the language** (official text). Briefly naming a point and then explaining it in your own words is **not** reading: the overlap measure must not count a short point name followed by the student's own content (section 6, "named" runs). Band-1 feedback headline: **"Say the ideas in your own words."** | Official band 1; naming a point is normal exam technique. |
| 6 | Overlap thresholds | Ship with the thresholds in section 6 as **flag-only** (except the clear-case override in decision 4). Collect ~20 real recordings across bands and review false flags before any further change. | Follows from decision 4: with the model deciding, wrong thresholds only produce log entries. |
| 7 | Pronunciation and band 6 | The audio step judges pronunciation **up to C1 only, never `above_C1`**, and pronunciation **never blocks band 6**. Band 6 requires the language level `above_C1` **and** grammar and vocabulary each `above_C1` (band-6 gate, section 4); otherwise the cap is 5. | The C1 pronunciation text ("Pronunciation is intelligible") cannot separate C1 from above C1; grammar and vocabulary are where "above C1" is visible in a transcript. Mirrors Part 2's band-5 rule. **Implementation: reuse `scoring.above_target_requires` from PR #5** (Part 2: band 5 needs grammar and vocabulary above target; not yet on `main` when this plan was written). Part 3 sets it to `["grammar", "vocabulary"]` in `multilevel_q8.json`; do not write a second mechanism. Kept as written after review. |
| 8 | Rebuttals | "Some people say X, but…" = point X is **addressed** (`restated`), so X's side counts as covered (cap 4). X is **developed** only if the student gives at least one real reason or example *supporting* X before rebutting it; the rebuttal develops the student's own side, not X's. So `both_sides_full` (cap 6) needs a genuine supporting reason on each side. A counter-argument that never states X does not cover X's side (anchor 3). Test: fixture R1 (section 8). | Presenting the opposing view covers the section; a balanced argument also gives that view's reasons. |
| 9 | Topics | **Allowed:** education, technology, environment, health, work, cities, transport, media, sport, including policy-style statements ("X should be banned / required / taxed"), because the real exam uses public-debate topics. **Avoid:** weapons, religion, party politics, crime, personal tragedy. Ship **3 topics** in v1, each with its own anchor set: cars in city centres, T2 (smartphones under 14) and T3 (tax on sugary drinks and fast food). T1, T4 and T5 are kept for later (section 9). | Students need practice with policy statements like the official sample, without its sensitive subject. |
| 10 | Session flow | Part 3 runs **alone**, like Part 2: the UI shows the Part band (`Part 3: 4/6 · Higher B2`) and the C1 target, never an overall exam level. A full mock test with an overall level is a separate later plan. | Same contract as Part 2; an overall level needs all parts. |

---

## 6. Measuring prompt dependence in code

The model's dependence judgement is the one used for the band (decision 4). Text overlap between the transcript and
the task text is cheap, deterministic and testable, so code measures it too: to override the one clear case, to flag
disagreements, and to show the student which sentences came from the list.

### Metrics (pure function in `src/domain/evaluation/multilevel/prompt-overlap.ts`)

Normalise both texts: lowercase, unify apostrophes, strip punctuation, split into word tokens. Prompt text =
statement + the six points, each kept as a separate segment (n-grams never cross segments).

1. **Matched runs.** Find every maximal run of transcript tokens made of 4-grams that also appear in a prompt
   segment. Single shared words ("cars", "centre", "public transport") never match; that is why runs start at 4 tokens.
2. **Named vs copied** (decision 5). Look at the 20 tokens after each run. If they contain **≥ 5 distinct novel
   content words** (not stopwords, not in the prompt vocabulary), the run is **named**: the student used the point
   as a heading and went on in their own words. Otherwise it is **copied**.
3. Metrics, from **copied** runs only:

| Metric | Definition | What it catches |
| --- | --- | --- |
| `copied_ratio` | share of transcript tokens inside copied runs | reading the list aloud |
| `points_read` | points whose own 4-grams are ≥ 80 % inside copied runs | point-by-point reading |
| `novel_content_words` | distinct transcript words that are neither stopwords nor in the prompt vocabulary | how much the student added |
| `named_runs` | count of runs classed as named | reported only, never penalised |
| `copied_spans` | the transcript substrings of copied runs | shown to the student; used as evidence |

### Rules

```
override (applied):  copied_ratio ≥ 0.50 AND points_read ≥ 4         → final dependence = reads_prompts

flag (logged only):  code_dependence ≠ model dependence, where
  code_dependence =
    "reads_prompts"      if copied_ratio ≥ 0.50 or points_read ≥ 4
    "heavily_dependent"  if copied_ratio ≥ 0.20 or points_read ≥ 2 or novel_content_words < 25
    "own_development"    otherwise
```

Stored with each result: the model's level, the code level, the metrics, whether the override fired, and a
`dependence_disagreement` flag. Flags go into the evaluation quality report for the threshold review (decision 6).

### Measured on the anchors

Values from `src/domain/evaluation/multilevel/prompt-overlap.ts` (branch `claude/sleepy-hypatia-rp7db1`), which is
the reference for these numbers. The module defines the stopwords behind `novel_content_words`: the NLTK English
list plus function-word contractions ("that's", "can't", "I'd" …). The first draft of this table came from an
uncommitted scratch script with a different stopword list; its novel-word counts differed by a few words but were on
the same side of the threshold (25) everywhere, so no code level changed.

| Text | tokens | copied_ratio | points_read | novel words | named runs | code level | Model level | Applied |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anchor 0 | 49 | 0.00 | 0 | 15 | 0 | heavily_dependent | (band 0 by language) | flag only |
| Anchor 1 | 81 | **0.81** | **6** | 2 | 0 | reads_prompts | reads_prompts | override condition met; agrees |
| Anchor 2 | 100 | **0.29** | **3** | 15 | 0 | heavily_dependent | heavily_dependent | agrees |
| Anchor 3 | 156 | 0.00 | 0 | 62 | 0 | own_development | own_development | agrees |
| Anchor 4 | 171 | 0.00 | 0 | 63 | 0 | own_development | own_development | agrees |
| Anchor 5 | 223 | 0.00 | 0 | 85 | 1 | own_development | own_development | agrees (statement echo is named) |
| Fixture N1 | 72 | 0.00 | 0 | 31 | 2 | own_development | own_development | agrees |
| Fixture R1 | 158 | 0.00 | 0 | 56 | 2 | own_development | own_development | agrees |

**Fixture N1** (overlap unit test, not a band anchor): names two points verbatim, then develops each.

> I'd like to start with safer streets for pedestrians and cyclists. My younger brother cycles to school every
> morning, and twice last year he was nearly hit by a taxi driver who was speeding. Then, against the idea, shops and
> businesses in the centre may lose customers. My uncle runs a small bakery near Chorsu bazaar and most of his
> regular buyers stop their cars right outside the door for a minute.

Without the named/copied split this text scores `copied_ratio 0.21`, `points_read 2` (a false "heavily dependent"
flag); with it, 0.00 and 0. Anchors 1 and 2 are unchanged by the split, because nothing of the student's own follows
their copied runs.

ASR caveat: transcription normalises speech towards standard written forms, which can *raise* overlap for a student
who paraphrases closely. 4-gram matching keeps that small, but the thresholds must be checked on real recordings.

---

## 7. What is reused from Part 2

| Area | Part 2 file | Part 3 |
| --- | --- | --- |
| Pipeline | `speaking-evaluator.ts` | **Reused.** Chooses prompt, schema and scorer by `rubricId`. |
| Model providers, JSON-schema derivation | `anthropic-…`, `gemini-…`, `gemini-json-schema.ts`, mock | **Reused** unchanged; mock gains a Q8 output. |
| Audio step | `audio-assessment.ts`, `multilevel-audio-assessment.ts` | **Reused**; descriptors passed from the Q8 rubric so it can judge C1 / above C1. |
| Feature fields, errors, error patterns, strengths, retry review | `model-output.ts` | **Reused** as shared building blocks; level enum comes from the rubric's ladder. |
| `bestFitLevel`, `lowestFeature`, `FIX_PRIORITY`, provisional flag | `band-scoring.ts`, `levels.ts` | **Reused**, generalised from the fixed 4-step ladder to the rubric's ladder. |
| Band-6 gate | `scoring.above_target_requires` (PR #5) | **Reused** with `["grammar", "vocabulary"]` (decision 7). |
| Rubric file + Zod config validation | `multilevel_q7.json`, `rubric-config.ts` | **Same pattern**; new `multilevel_q8.json`. Config schema becomes a union: `question_count`/`topic_cap` for Q7, `coverage_cap`/`dependence_cap`/`overlap_thresholds` for Q8. |
| B2 / B1 / below-B1 descriptor text | `multilevel_q7.json` | **Reused verbatim** (Q8 refers to the Q7 features). |
| Quality gate | `quality-gate.ts` | **Reused** (strict quotes, concrete fixes, no pronunciation from text, no internal names). Q8 additions: point ids exactly F1–F3, A1–A3; `development_evidence` required for `developed`; `prompt_dependence.evidence` quotes checked; `coherent_and_sustained=false` with `own_development` triggers the one regeneration. |
| Prompt fingerprint, versions | `prompt-fingerprint.ts`, `versions.ts` | **Reused**; new fingerprint fixture for Q8. |
| Result storage, retry focus, UI cards | `result.ts`, `BiggestFixCard`, `ErrorPatterns`, `FeatureLevels`, `LevelMeter` | **Reused**; `bandScore` becomes part-specific (Q8: `coverage`, `dependence`, overlap metrics instead of `on_topic_count`). |
| New | — | Task type + content, `prompt-overlap.ts` (+ tests), `q8-band-scoring.ts` (+ tests), Q8 prompt, FOR/AGAINST coverage view with matched-span highlighting. |

The current `FEATURE_LEVELS` (`below_B1 … above_B2`) is shared and typed. Per decision 1 it becomes the Q7 rubric's
declared ladder and the shared code takes the ladder from config; Part 2 stored results are untouched. This is the main
refactor.

---

## 8. Anchor answers (one original topic)

**Statement:** Cities should ban private cars from their centres.

| FOR | AGAINST |
| --- | --- |
| F1. Cleaner air and less noise | A1. Difficult for elderly and disabled people |
| F2. Safer streets for pedestrians and cyclists | A2. Shops and businesses in the centre may lose customers |
| F3. More people would use public transport | A3. Public transport is not good enough in many cities |

Transcripts are written as an ASR would return them (no corrections). Each lists the expected judgements and how
code reaches the band. These become unit-test fixtures for the scorer and the overlap metric, and calibration items
for the live evaluation run. The full list of planned test cases is at the end of this section.

### Anchor 0 — Band 0 (below B1)

> Car... car is good. I have car, my father car. Chevrolet. In my city many car. I go to school with car, it is fast.
> Car is... expensive. I like car. Yes. Bus is bad, very... many people. I like my city, Tashkent is big city,
> beautiful. That's all.

- Points: all `not_addressed` ("bus is bad, many people" is too vague to be A3; a judge may also say `restated` A3,
  which changes nothing).
- Language: grammar, vocabulary, cohesion, fluency below_B1 ("I have car, my father car", list of fragments).
- Code: zero rule `no_point_addressed` (or `below_B1` if A3 is accepted) → **band 0**. Biggest fix: feature (grammar).

### Anchor 1 — Band 1 (reads from the prompts)

> Cities should ban private cars from their centres. For: cleaner air and less noise. Safer streets for pedestrians
> and cyclists. More people would use public transport. Against: difficult for elderly and disabled people. Shops and
> businesses in the centre may lose customers. Public transport is not good enough in many cities. So, I think,
> cleaner air and less noise is good. And safer streets for pedestrians and cyclists is good. But difficult for
> elderly and disabled people. It is my opinion.

- Points: all six `restated`, none developed.
- Dependence: model `reads_prompts`; code `copied_ratio 0.81`, `points_read 6` meets the override condition (≥ 0.50
  and ≥ 4), so the result is `reads_prompts` even if the model had said otherwise.
- Coherent and sustained: false. Language: B1 (simple structures, "cleaner air … is good", "But difficult for…").
- Code: coverage `both_sides` (cap 4), dependence cap 1, language cap 2 → **band 1**. Biggest fix: prompt_dependence,
  headline "Say the ideas in your own words.", with the copied sentences highlighted.

### Anchor 2 — Band 2 (heavily dependent)

> Today I will speak about cars in the city centre. Some people think cities should ban private cars from their
> centres. First, I think the air will be cleaner and there is less noise. It is good for people health. Second,
> safer streets for pedestrians and cyclists, because there is no many cars. But there are also against points. It
> is difficult for elderly and disabled people, because they can't walk long. And shops and businesses in the centre
> may lose customers. So there are good sides and bad sides. In my opinion it is good and bad. Thank you.

- Points: F1 `developed` (thin: "good for people health"), F2 `restated` (reason is a tautology), A1 `developed`
  ("they can't walk long"), A2 `restated`; F3, A3 `not_addressed`.
- Dependence: model `heavily_dependent` (decides). Code `copied_ratio 0.29`, `points_read 3` → `heavily_dependent`:
  agrees, no flag. The override does not apply (below 0.50 and 4).
- Language: B1 ("people health", "there is no many cars", simple linking: first / second / and / but).
- Code: coverage `both_sides_full` (cap 6), dependence cap 2, language cap 2 → **band 2**. Biggest fix:
  prompt_dependence (ties with language; dependence comes first in the order): "Explain each point in your own
  words with a reason or an example."

### Anchor 3 — Band 3 (one section only)

> Well, I strongly believe that private cars should be banned from city centres, and I have two main reasons. First
> of all, the air would be much cleaner. In Tashkent, for example, in summer the traffic jams on Amir Temur street
> are terrible, and you can actually smell the exhaust when you walk there. If cars were not allowed, people could
> breathe normally and it would be quieter as well. My second reason is safety. A lot of accidents happen because
> drivers are always in a hurry, and children who walk to school have to cross busy roads. Without private cars,
> parents wouldn't be so worried and more people would ride bicycles, which is also healthy. Also, the metro in our
> city is quite cheap and fast, so I think people would get used to it quickly. To sum up, banning cars has a lot of
> benefits and I think every big city should do it.

- Points: F1, F2 `developed`, F3 `developed` (metro); A1–A3 `not_addressed`. The metro sentence argues **against
  A3** without ever stating it, so it does not cover the AGAINST side (decision 8).
- Dependence: `own_development` (copied 0.00, 62 novel words).
- Language: B2 across features (second conditional, relative clause, "first of all / to sum up"; few errors).
- Code: coverage `one_side` (cap 3), language cap 4 → **band 3**. Biggest fix: section_coverage: "Choose two points
  from each list.", naming the AGAINST side and suggesting A1 with its model answer.

### Anchor 4 — Band 4 (both sections, B2 language)

> In my opinion, this is quite a difficult question, because there are strong arguments on both sides. On the one
> hand, banning cars would make the air cleaner. Nowadays in big cities like Tashkent the pollution is really
> serious, especially in winter, and many people have problems with breathing. Also, streets would be safer, because
> children and old people could walk without worrying about traffic. On the other hand, there are some
> disadvantages. For example, my grandmother can't walk very far, so for her it would be very difficult to visit the
> hospital in the centre if she can't go by car. Besides, small shops in the centre might lose their customers,
> because people prefer to go to shopping malls where there is a parking. If people stop coming, the owners will
> lose their money and maybe close the shop. So, I think the idea is good, but the government should first improve
> buses and give special permission for old and disabled people. That's why I partly agree with this statement.

- Points: F1, F2, A1, A2 `developed`; F3, A3 `not_addressed` (the buses remark is part of the conclusion).
- Dependence: `own_development`. Conclusion: `weighed`.
- Language: B2 (conditionals and reasons used correctly; "where there is a parking", "lose their money"; a limited
  set of linkers: on the one hand / on the other hand / besides / so).
- Code: coverage `both_sides_full` (cap 6), language cap 4 → **band 4**. Biggest fix: feature (vocabulary or
  cohesion, whichever is lower).

### Anchor 5 — Band 5 (C1)

> Whether cities should ban private cars from their centres is a question that divides opinion, and I think both
> sides have a point. Let me start with the arguments in favour. The most obvious benefit would be cleaner air.
> Exhaust fumes are one of the main causes of respiratory illness in cities, and if the centre were car-free,
> residents would notice the difference almost immediately, not to mention how much quieter it would be. Closely
> linked to this is safety: with fewer vehicles around, pedestrians and cyclists would no longer have to compete for
> space, which would encourage people to walk or cycle rather than drive short distances. That said, the
> counter-arguments shouldn't be dismissed. For elderly or disabled people, a car is often not a luxury but a
> necessity, and a blanket ban could effectively cut them off from hospitals and government offices which located
> in the centre. What's more, businesses could suffer. Small shops depend on passing trade, and if customers can't
> drive in, they may simply take their money to out-of-town shopping centres instead. Having weighed up both sides,
> I'd say a complete ban would be too drastic, at least until public transport is reliable enough. A more sensible
> approach might be to restrict cars gradually, while making exceptions for those who genuinely depend on them.

- Points: F1, F2, A1, A2 `developed`; A3 used in the conclusion (`restated` or `developed`, either is fine); F3
  `not_addressed`.
- Dependence: `own_development` (copied 0.00: the statement echoed in the opening is a named run, decision 5).
- Language: C1 (fronting "Closely linked to this is…", "not to mention", participle clause "Having weighed up";
  one minor error "which located"; wide range of cohesive devices). Not above C1 because of that slip and the
  fairly standard phrasing.
- Code: coverage `both_sides_full` (cap 6), language cap 5 → **band 5**. Biggest fix: feature (grammar, "which are
  located").

No band-6 anchor was requested. Band 6 needs the same structure as anchor 5 with grammar and vocabulary clearly
beyond the C1 descriptors and the mean level above C1 (band-6 gate, decision 7).

### Fixture R1 — mentioned then rebutted (decision 8), expected cap 4

Two listed points per side, but both FOR points are only stated and then argued against. Language is C1, so the
coverage cap is what limits the band.

> Personally, I'm against banning cars from the centre, although I can see why the idea is popular. Some people say
> the air would be cleaner and there would be less noise, but in my view the real problem is old buses and
> factories, not private cars. Others claim the streets would be safer for pedestrians and cyclists, yet most serious
> accidents in our city happen on the ring road rather than in the centre. On the other side, a ban would be very
> hard on elderly and disabled people. My grandfather, for instance, uses a walking stick and simply couldn't manage
> the distance from the nearest metro station to his clinic. What's more, shops in the centre would probably lose
> customers, since people who drive would rather go to a shopping mall with free parking than carry heavy bags to a
> bus stop. So, all things considered, I think a ban would cause more problems than it solves.

- Points: F1 `restated` and F2 `restated` (each stated, then rebutted; no reason given *for* it). A1 `developed`
  (grandfather, walking stick), A2 `developed` (free parking, heavy bags). F3, A3 `not_addressed`.
- The rebuttals ("the real problem is old buses and factories", "accidents happen on the ring road") are **not**
  `development_evidence` for F1/F2. They argue the AGAINST position but are not listed AGAINST points, so they add
  nothing to coverage either (decision 2).
- Derived: `covered(for) = 2`, `developed(for) = 0`, `covered(against) = 2`, `developed(against) = 2` →
  coverage **`both_sides`** (not full, because the FOR side has no supporting reason).
- Dependence: `own_development` (copied 0.00; the two point names are named runs).
- Language: C1 (concessive "although", "yet", "rather than", "would rather … than", "all things considered").
- Code: coverage cap **4**, dependence cap 6, language cap 5 → **band 4**. Biggest fix: point_development, "Before
  you argue against a point, give one real reason that supports it."
- What would make it band 5: one genuine supporting reason for F1 or F2 before the "but".

### Planned test cases

Pure unit tests, no model call. Each case fixes the model judgements as input and asserts the computed values.

| Case | Under test | Input (judgements / transcript) | Expected |
| --- | --- | --- | --- |
| Anchor 0 | scorer | no point addressed, language below B1 | band 0, `no_point_addressed` |
| Anchor 1 | scorer + overlap | all six restated; transcript anchor 1 | override fires (0.81, 6) → `reads_prompts`; band 1 |
| Anchor 2 | scorer + overlap | `heavily_dependent`, B1 | no override, no flag; band 2 |
| Anchor 3 | scorer | FOR only, B2 | `one_side`; band 3; "Choose two points from each list." |
| Anchor 4 | scorer | full coverage, B2 | band 4 (language cap) |
| Anchor 5 | scorer + overlap | full coverage, C1; transcript anchor 5 | statement echo is a named run; band 5 |
| Band-6 gate | scorer | full coverage, mean above C1, vocabulary at C1 | band 5 (gate not met) |
| Band-6 gate, pronunciation | scorer | full coverage, grammar/vocabulary/fluency/cohesion above C1, pronunciation C1 | band 6 |
| Fixture N1 | overlap | transcript N1 | 2 named runs; `copied_ratio` 0.00, `points_read` 0 |
| **Fixture R1** | scorer + overlap | F1, F2 restated (rebutted); A1, A2 developed; C1 | `both_sides`; **band 4**; point_development fix |

---

## 9. Topics

Policy-style statements in the allowed areas (decision 9).

### v1 (ship these three)

| # | Topic | Anchors |
| --- | --- | --- |
| 1 | Cities should ban private cars from their centres. (section 8) | **Done**: anchors 0–5, fixtures N1 and R1. |
| 2 | T2 — Children under 14 should not be allowed to own a smartphone. | **Still needed**: anchors 0–5 (one per band, same profiles as section 8: below B1; reads the list; heavily dependent B1; one side only, B2; both sides full, B2; both sides full, C1) and an R1-style rebuttal fixture (two points per side, one side only stated then rebutted → cap 4). |
| 3 | T3 — Governments should put a special tax on sugary drinks and fast food. | **Still needed**: the same set as T2 (anchors 0–5 and an R1-style fixture). |

The naming fixture N1 tests the overlap code, not the topic, so one copy (topic 1) is enough. Each new anchor set
needs its overlap numbers measured and recorded as in section 6 before it is used for calibration.

### Later topics (not in v1)

**T1. Education — "Homework should be banned in primary schools."**

| FOR | AGAINST |
| --- | --- |
| More time for play, sport and family | Practises what was learned in class |
| Less stress for young children | Builds good study habits early |
| The school day is already long enough | Parents can see what their child is learning |

**T2. Technology — "Children under 14 should not be allowed to own a smartphone."**

| FOR | AGAINST |
| --- | --- |
| Less screen time and better sleep | Parents can reach them in an emergency |
| Protection from harmful content online | Useful for learning and homework |
| More face-to-face time with friends | Children without one may feel left out |

**T3. Health — "Governments should put a special tax on sugary drinks and fast food."**

| FOR | AGAINST |
| --- | --- |
| Fewer people would become overweight or ill | Unfair to families on low incomes |
| The money could pay for health services | Adults should decide what they eat |
| Companies would make healthier products | Lack of exercise is a bigger problem than food |

**T4. Work — "Companies should be required to offer a four-day working week."**

| FOR | AGAINST |
| --- | --- |
| Better balance between work and family life | Impossible in hospitals, shops and transport |
| Rested staff work more productively | Higher costs for small businesses |
| Less commuting means less traffic and pollution | Customers may get slower service |

**T5. Sport — "Governments should spend money on local sports facilities rather than on hosting international sports events."**

| FOR | AGAINST |
| --- | --- |
| Everyone can use local facilities every day | Big events bring tourists and investment |
| International events are expensive and last only weeks | Success at home inspires young people to take up sport |
| Local clubs are where new talent is found | New stadiums, roads and hotels remain after the event |


---

## 10. Built on `claude/part3`

Part 3 exists in **mock mode only** (`?mock=1`); `PART_LIVE["3"]` is off and the home page and dashboard say "Coming
soon". See docs/design-system.md, "Part 3 (mock mode only)", and docs/merge-order.md.

### Overlap measured on the topic 2 and 3 anchors (section 9 asks for it)

From `prompt-overlap.ts` with the thresholds of section 6; anchors in `test/evaluation-samples/part3-anchors.ts`
(made up, test-only). Every code level agrees with the expected model level, so no anchor raises a flag; on every A1
the override condition holds (it agrees with the model).

| Text | tokens | copied_ratio | points_read | novel words | named runs | code level |
| --- | --- | --- | --- | --- | --- | --- |
| T2 A0 | 42 | 0.00 | 0 | 16 | 0 | heavily_dependent |
| T2 A1 | 81 | **0.81** | **6** | 3 | 0 | reads_prompts |
| T2 A2 | 88 | **0.20** | 1 | 19 | 3 | heavily_dependent |
| T2 A3 | 118 | 0.00 | 0 | 49 | 0 | own_development |
| T2 A4 | 120 | 0.00 | 0 | 50 | 0 | own_development |
| T2 A5 | 181 | 0.00 | 0 | 78 | 1 | own_development |
| T2 R1 | 127 | 0.00 | 0 | 50 | 2 | own_development |
| T3 A0 | 46 | 0.00 | 0 | 17 | 0 | heavily_dependent |
| T3 A1 | 87 | **0.83** | **6** | 3 | 0 | reads_prompts |
| T3 A2 | 95 | **0.38** | **3** | 15 | 1 | heavily_dependent |
| T3 A3 | 113 | 0.00 | 0 | 48 | 0 | own_development |
| T3 A4 | 132 | 0.00 | 0 | 49 | 0 | own_development |
| T3 A5 | 172 | 0.00 | 0 | 71 | 1 | own_development |
| T3 R1 | 125 | 0.00 | 0 | 41 | 2 | own_development |

T2 A2 sits exactly on the 0.20 threshold (and below 25 novel words), so it is a borderline case for the threshold
review (decision 6).

### Part 3: what the plan says and this branch does not do yet

1. ~~**`SpeakingTask` is not a union yet** (section 1).~~ **Done on `claude/p3-real`, as far as needed** (see section 11).
   `AnySpeakingTask = SpeakingTask | BalancedArgumentTask` (`src/domain/speaking/any-task.ts`, narrowed by `taskType`)
   is what the attempts API, the processing pipeline, the task snapshot and the result page work on.
   `SpeakingTask` and `BalancedArgumentTask` themselves did not change, so no Part 2 code, stored snapshot or API
   changed. Part 2 and Part 1 code keeps asking for the plain `SpeakingTask` (`getSpeakingTask`).
2. **The shared ladder refactor is not done** (decision 1, section 7). Part 3 has its own ladder and best-fit function
   (`domain/evaluation/q8/levels.ts`, the same arithmetic); Part 2's `FEATURE_LEVELS`, scorer and stored results are
   untouched. The Part 3 config is its own schema (`q8/rubric-config.ts`), not a union inside `rubric-config.ts`.
3. **Band-6 gate:** the same rule as Part 2's `above_target_requires`, configured in `multilevel_q8.json`, but
   applied by the Part 3 scorer (the Part 2 function is written for Part 2's caps).
4. **A `rebutted` flag was added to the point judgement** (section 3's schema has none). Without it the scorer cannot
   tell a side that was only rebutted from one that was only named, which section 4 (item 4) needs for "Before you
   argue against a point, give one real reason that supports it."
5. **Biggest fix for "no point addressed":** section 4 lists `section_coverage` before `feature` on ties, but anchor 0
   expects the feature fix. Applied as: `section_coverage` when coverage is one side, or none with language at B1 or
   above; below-B1 language with nothing addressed gets the feature fix (anchor 0).
6. **Real model wired, no audio step, not live-tested.** ~~The Gemini and Anthropic providers are hard-wired to Part 2's
   schema.~~ **Done on `claude/p3-real`:** both providers now ask for the Part 3 output schema (`q8ModelOutputSchema`)
   when the input's rubric is `multilevel-q8` (Part 2's schema and prompt hash are byte-for-byte unchanged), and
   `evaluateArgument` runs on their reply (tested with a fake HTTP client: no model is called). The Part 3 prompt has
   **still never been sent to a model** (no Gemini calls on this branch): the live anchor run is still required before
   Part 3 goes live. The audio step still judges on Part 2's ladder, so Part 3 results have pronunciation "not assessed"
   and are provisional. A Part 3 prompt fingerprint now exists (`q8-fingerprint.ts`, pinned by
   `q8-fingerprint.test.ts` and `test/fixtures/q8-model-output-schema.json`).
7. ~~**No real attempt flow.**~~ **Done on `claude/p3-real` (section 11):** attempts API, storage, History, dashboard,
   `/result/[attemptId]`, the consent lock and the 30-day audio deletion all cover Part 3, and a prompt fingerprint
   fixture exists. Still open: the teacher view for Part 3 (teacher plan, `docs/v1-plan.md` step 6) and a Part 3
   lesson link. The real pages answer 404 while `PART_LIVE["3"]` is off (their mock pages are unchanged).
8. **The student chooses points in the app** (not in the plan): during the minute of preparation they tick two per
   side. The choice is stored with the result (`chosen_points`) for feedback only; the evaluator judges what was said.
   **In the real flow** the ticked points are sent with the upload, kept with the attempt until transcription, and stored
   in the result as `chosen_points` (normalised to list order; unknown, repeated or more than two per side are dropped
   and the answer is still scored).

---

## 11. The real flow, built on `claude/p3-real`

Part 3 now works for real, the same way as Part 2, behind `PART_LIVE["3"]` (still **false**: every real Part 3 page
answers 404 and the upload route refuses with `task_not_found` until the owner turns it on). `?mock=1` is unchanged.

**What it does**

- **Attempts:** `POST /api/speaking/attempts` accepts a Part 3 task (`taskId`, the audio, `durationMs`,
  `chosenPoints` = a JSON list such as `["F1","F2","A1","A2"]`, `previousAttemptId` for a retry). Create attempt → store
  audio → process (transcribe → `evaluateArgument` → stored result). The result is stored with schema version **4**
  (`Q8_EVALUATION_SCHEMA_VERSION`; Part 1/2 stay on 3), `kind: "multilevel_q8"`, evaluator `argument-evaluator/0.1.0` and
  the Part 3 prompt hash. No migration: the task snapshot, attempt, recording, transcript and evaluation tables are
  unchanged (the ticked points wait in the attempt's `metrics` JSON, as Part 1's question offsets do).
- **Pages:** `/practice/part3/<task id>` (real when live: brief, spoken introduction, preparation with the ticks,
  recording, upload; `?retry=<attempt id>` reads the caller's own attempt on the server), the topics on `/practice`
  (real links), `/result/[attemptId]` (the Part 3 result with the recording player and the 30-day note, owner only,
  404 for everyone else), History (Part 3 rows and filter) and the dashboard (Recent attempts, the Part 3 tile's band,
  a Part 3 biggest fix with its real retry link). `/practice/part3` (topics) redirects to the task list when live.
- **Consent:** exactly Part 2's lock: `CONSENT_REQUIRED`, guests never record, `consent_status` must be `granted`, on the
  upload and on re-scoring a stored answer; the practice page shows the lock.
- **Audio:** deleted 30 days after scoring (or failure) by the same daily job; the transcript and result stay. "Delete my
  account" removes Part 3 attempts, results, transcripts, recordings and the audio files (no new table).
- **AI score not ready yet (Parts 1, 2 and 3):** when AI scoring can't run (no key, no credit, a provider error) after the
  transcript was saved, the attempt keeps its recording and transcript, and the result page says **"AI score not ready
  yet"** (transcript, recording player, black "Check again" that scores the saved recording, quiet "Record again"),
  not an error. A failure before the transcript exists (transcription) is still the usual error screen. The upload
  route and the page gate no longer require the scoring key (the health check and the boot log still do, so a deploy
  without it still fails its health check).

**Done differently from the plan, and why**

1. `SpeakingTask` is not changed into a union; a separate `AnySpeakingTask` union is used where the flow needs both
   (decision: smallest change, no Part 2 type, snapshot or test moves).
2. Part 3 results get **schema version 4**, not 3: a stored row says which Zod schema reads it, and Part 1/2 rows and
   `parseStoredEvaluation` for version 3 are untouched.
3. Part 3 has its own result component (`Part3AttemptResult`) instead of widening Part 2's `AttemptResult`, so Part 2's
   result page cannot change.
4. The History and dashboard types widened to `BandedResult = MultilevelResult | Q8Result`; the dashboard's level and
   skills still use Part 2 answers only (Part 3 is on the C1 ladder), and Part 3 shows only as its own tile band, rows and
   biggest fix. The teacher view still shows Part 2 only.
5. **Tests turn Part 3 on** with a mocked `PART_LIVE` in unit tests and, for the browser, a test-only environment switch
   (`CEFRO_TEST_PART3_LIVE=1`, ignored in production builds and on Vercel, `src/config/features.ts`) on a dedicated
   server (`playwright.part3.config.ts`, `npm run test:e2e:part3`).

**Tests:** `src/server/attempts/part3-pipeline.test.ts` (create/upload/process/store, chosen points, retry, the release
rule, "AI score not ready yet" for Parts 1.1, 1.2, 2 and 3, 30-day audio, delete account),
`src/app/api/part3-attempts.test.ts` (cross-user access on every route, consent lock, pages, History, dashboard, task
list), `src/server/evaluation/part3-providers.test.ts` and `q8-fingerprint.test.ts`, more in `from-attempt.test.ts`,
`provider-config.test.ts`, `api-routes.test.ts` and `src/config/features.test.ts`; `e2e/part3-real.spec.ts` at 390 px.

**Still open before Part 3 can go live:** the live anchor run on the real model (the prompt has never been sent), the
audio step on the C1 ladder, a decision on the teacher view for Part 3, and the owner's switch.
