# Part 1 plan: Part 1.1 (Questions 1–3) and Part 1.2 (Questions 4–6)

Status: **plan only, nothing built.** Nothing here changes code. The Part 2 evaluator, scoring and result files are
being changed in another session, so every code change below waits until that work is merged (see §5).

The approach is the same as Part 2 (official Question 7, `multilevel-q7`): **the model judges, code scores.** The
model judges each question (on_topic / partial / missing / off_topic) and each feature (grammar, vocabulary, fluency,
cohesion; pronunciation from the audio step) against the official descriptors, quoting the transcript exactly. The
0–5 band is computed in `band-scoring.ts` from a per-part rubric JSON. No model ever outputs a band.

| | Part 1.1 | Part 1.2 |
|---|---|---|
| Official questions | 1–3 | 4–6 |
| Target level | A2 | B1 |
| Band | 0–5 | 0–5 |
| Rubric id (proposed) | `multilevel-q1-3` | `multilevel-q4-6` |
| Rubric file (proposed) | `server/evaluation/rubrics/multilevel_q1_3.json` | `server/evaluation/rubrics/multilevel_q4_6.json` |

---

## 1. Task format

> Timings are my understanding of the current UZBMB format. **Please confirm them** (open question Q1).

### Part 1.1 — Questions 1–3 (personal questions)

- The student sees and hears three short questions about themselves (home, family, free time, study, food …),
  **one at a time**. Example task: *"What do you usually do at the weekend?"*, *"What is your favourite food? Why?"*,
  *"Who do you spend the most time with in your family?"*
- No preparation time (a short "get ready" of ~5 s per question).
- **30 s per question**, ~1 min 30 s of speech in total. The next question appears when the time is up (or when the
  student taps "Next").
- What the student sees: the question number and text, a countdown ring per question, a "1 of 3" progress row.

### Part 1.2 — Questions 4–6 (two pictures + two questions)

- The student sees **two pictures** on one theme (e.g. *A: a family cooking at home*, *B: friends eating at a
  fast-food restaurant*).
- **Question 4:** describe the two pictures and say how they are different / similar — **45 s**.
- **Questions 5 and 6:** two questions on the same theme, answered from the student's own experience and opinion —
  **30 s each** (e.g. *"Do you prefer eating at home or eating out? Why?"*, *"How have people's eating habits changed
  in your country?"*).
- ~10 s preparation looking at the pictures before Question 4; ~5 s before Questions 5 and 6.
- The pictures stay on screen for all three questions.

### Recording model (decision needed, Q2)

Part 1 is three short answers, while today an attempt has exactly **one** recording (`recordings_attempt_uq`).

- **Recommended for v1 — one continuous recording per part.** The app advances the questions on screen with timers
  while one recording runs; the client sends the time at which each question started (`question_offsets_ms`). The
  evaluator receives the whole transcript plus the question order, exactly like Part 2, and finds each question's
  answer itself (it already does this for the three Q7 questions). No DB migration; the existing upload, speech
  guard, transcription, audio step, retry and history flows are reused unchanged.
- *Later, if needed — one recording per question.* Needs a `responses` table (attempt → question → recording →
  transcript), i.e. a migration, and per-question transcription calls. Better question boundaries; more cost and
  more failure modes. Only worth it if v1 shows the model misplaces answers.

---

## 2. Band tables

The Part 2 rubric shows the shape of the official scale (5 = above target, 4 = higher target, 3 = lower target,
2 = higher level-below, 1 = lower level-below, 0 = below that / no meaningful language / all off-topic). I have
assumed Parts 1.1 and 1.2 follow the same shape, one level lower and two levels lower. **The labels and the
descriptor text below are placeholders until you paste the official text** (open question Q3); I have not written
any official wording from memory. The only official text already in the repo is the Q4–6 "Higher A2" descriptor,
which `multilevel_q7.json` uses as its below-B1 reference.

### Part 1.1 (target A2) — proposed table

| Band | Label (to confirm) | Rule (to confirm against official text) |
|---|---|---|
| 5 | Above A2 | Language above the A2 descriptors, all three questions answered |
| 4 | Higher A2 | A2 descriptors; all three questions answered |
| 3 | Lower A2 | A2 descriptors; two questions answered |
| 2 | Higher A1 | A1 descriptors; at least two questions answered |
| 1 | Lower A1 | A1 descriptors; one question answered |
| 0 | Below A1 | Below A1, no meaningful language, or all answers off-topic / memorised |

Descriptors needed verbatim, per feature (grammar, vocabulary, pronunciation, fluency, cohesion):
**A2** (bands 4/3), **A1** (bands 2/1), and whatever the scale says for band 0. `[PASTE]`

### Part 1.2 (target B1) — proposed table

| Band | Label (to confirm) | Rule (to confirm against official text) |
|---|---|---|
| 5 | Above B1 | Language above the B1 descriptors, all three questions answered |
| 4 | Higher B1 | B1 descriptors; all three questions answered |
| 3 | Lower B1 | B1 descriptors; two questions answered |
| 2 | Higher A2 | A2 descriptors; at least two questions answered |
| 1 | Lower A2 | A2 descriptors; one question answered |
| 0 | Below A2 | Below A2, no meaningful language, or all answers off-topic / memorised |

Descriptors needed verbatim: **B1** (bands 4/3), **A2** (bands 2/1; the Higher A2 text is already in
`multilevel_q7.json` → `descriptors.below_B1`), and band 0. `[PASTE]`

### Proposed scoring caps (same numbers as Q7, to confirm)

Both parts, with the four-step language ladder `below_lower < lower < target < above_target`:

```json
"topic_cap":      { "0": 0, "1": 1, "2": 3, "3": 4 },
"above_target_full_coverage_cap": 5,
"language_cap":   { "below_lower": 0, "lower": 2, "target": 4, "above_target": 5 }
```

`band = 0` if memorised/irrelevant, nothing on topic, or language at `below_lower`; else
`min(topic_cap, language_cap)`. Language level = mean of assessed features, nearest level, exact .5 rounds down.
`meets_target_band = 3`.

---

## 3. Reuse vs new

### Reused as is (no change)

| Piece | File |
|---|---|
| Band algorithm: on-topic count, best-fit mean with .5 down, zero rules, `min(topic cap, language cap)`, biggest fix | `domain/evaluation/multilevel/band-scoring.ts` (logic) |
| Question statuses, `partial` counts as on topic | `levels.ts` (`QUESTION_STATUSES`, `isOnTopic`) |
| Retry focus derivation | `result.ts` (`deriveRetryFocus`, `questionFocus`) |
| Rubric loading/validation pattern, task ↔ rubric checks | `rubrics/index.ts`, `rubric-config.ts` (pattern) |
| Strict exact-quote evidence checks, regeneration-once, internal-name filter | `quality-gate.ts` |
| Audio step for pronunciation + pausing, `provisional` when not assessed | `audio-assessment.ts`, `gemini-audio-assessor.ts` |
| Upload, speech guard, transcription with fallback, attempt pipeline, polling, history, retries | `server/attempts/*`, `server/transcription/*`, `server/audio/*` |
| Error patterns, model answers for missed questions, strengths | `model-output.ts` (shape) |
| Speech metrics | `domain/speaking/metrics.ts` |

### Needs generalising (touches Part 2 files → only after the other session merges)

1. **Level ladder per rubric.** `FEATURE_LEVELS` is hard-wired to `below_B1 / B1 / B2 / above_B2`. Proposal: the
   rubric JSON declares its own four level names (`"levels": ["below_A1","A1","A2","above_A2"]`); the scorer only
   uses the index 0–3, and the model-output Zod schema is built from the rubric's names. Part 2 keeps its exact
   strings, so **stored Part 2 results need no migration**.
2. **`rubric-config.ts`:** `target_level` enum gains `A2`; `descriptors` keyed by the rubric's levels instead of
   fixed `B2/B1/below_B1`; optional per-question speaking seconds.
3. **Prompt (`prompts/multilevel-evaluation.ts`):** remove literal "B2" wording (level list, "realistic B2 level" in
   model answers, "strengths only for B2 or above", the B1–B2 style line); take everything from the rubric. Add a
   Part 1 paragraph: short answers, judge each question's answer separately, do not punish shortness that the 30 s
   limit causes.
4. **Quality gate:** `strength_below_b2` → "strength below the rubric's target level".
5. **Mock model** (`mock-evaluation-model.ts`): level names from the rubric.
6. **UI labels** currently say "B2 target": read the target and labels from the result's rubric.

### New

| New piece | Notes |
|---|---|
| Two rubric JSON files + `RubricId` entries | Official text verbatim, own `version` (`multilevel-q1-3/1.0.0`, `multilevel-q4-6/1.0.0`) |
| `SpeakingTaskType`: `"short_answers"` (1.1) and `"picture_questions"` (1.2) | Closed union, as today |
| `SpeakingTask` fields: per-question `speakingSeconds[]` / `prepSeconds[]`; `images` (1.2) with alt text | Picture *content* described in `evaluatorGuidance`, because the evaluator reads text only |
| Content: at least one task per part (`content/speaking/a2/…`, `content/speaking/b1/…`) | Pictures we have rights to, stored in `public/` |
| Practice UI: question stepper (one question at a time, per-question timer, auto-advance) inside one recording; picture panel for 1.2 | Extract the generic recording session from `PracticeExperience.tsx` first |
| `question_offsets_ms` sent with the upload and passed to the evaluator as context | Small: stored on the attempt; no new table in v1 |
| Per-question time used in metrics (from offsets) | So "you used 12 of 30 s for Question 2" is real |
| Speech guard thresholds per part | Today tuned for one 2-min answer; 30 s answers are shorter |
| Anchor/fixture tests (§4) as unit tests on the scorer + live calibration cases | `band-scoring.test.ts` style, one config per part |
| `EVALUATOR_VERSION` bump (prompt change) | Required by `versions.ts` rules |

---

## 4. Anchor answers

Synthetic answers written for this plan (no real student data). Each lists the judgements we expect from the model
and the band the code must compute from them under §2's proposed caps. Pronunciation is assumed `not_assessed`
(transcript only), so every result is also **provisional**. These become: (a) unit tests feeding the judgements to
`scoreBand`, (b) live calibration cases checking the model produces those judgements (±1 level per feature allowed,
question statuses must match).

### Part 1.1 (target A2)

Questions: **Q1** *What do you usually do at the weekend?* · **Q2** *What is your favourite food? Why?* ·
**Q3** *Who do you spend the most time with in your family?*

**Low — expected band 1 (Lower A1)**

> Q1: "Weekend… um… I sleep. I sleep and… television. Yes."
> Q2: "Um… food… I don't… um… sorry."
> Q3: "Family is… um… my city is Samarkand. Is big city."

- Questions: Q1 on_topic (it answers, minimally); Q2 missing; Q3 off_topic (talks about the city).
- Features: grammar A1 ("Is big city", no verbs in most phrases), vocabulary A1, fluency A1 (constant pausing),
  cohesion A1 (only "and") → mean 1.0 → **A1**.
- Caps: topic 1 (one on topic), language 2 → **band 1**. Biggest fix: answer Question 2 (coverage limits the band).
- Why: real but very basic language on one question only. Not band 0: there is meaningful language and one
  question is answered.

**Middle — expected band 3 (Lower A2)**

> Q1: "At the weekend I usually go to the bazaar with my mother. Then we cook plov. In the evening I watch films."
> Q2: "My favourite food is manti. I like it because it is very tasty and my grandmother make it every Sunday."
> Q3: "Um… I like football. I play football with my friends in the school. It is very interesting."

- Questions: Q1 on_topic, Q2 on_topic, Q3 off_topic (talks about football, never names a family member).
- Features: grammar A2 (present simple mostly right, "my grandmother make"), vocabulary A2, fluency A2,
  cohesion A2 ("then", "because", "and") → **A2**.
- Caps: topic 3 (two on topic), language 4 → **band 3**. Biggest fix: answer Question 3. Meets target (3).
- Why: A2 language, but one of three questions not answered, so it cannot reach Higher A2.

**High — expected band 5 (Above A2)**

> Q1: "Usually I spend Saturday with my friends. We go to the park or, if the weather is bad, we play games at my friend's house. On Sunday I help my parents at home."
> Q2: "I really love lagman, especially the one my father makes. It's spicy and filling, and I've eaten it since I was a child, so it reminds me of home."
> Q3: "Probably my younger sister. We share a room, so we talk a lot, and I help her with her English homework, although sometimes she's lazy."

- Questions: all on_topic.
- Features: grammar above_A2 (conditional "if the weather is bad", present perfect "I've eaten it since…",
  "although"), vocabulary above_A2 ("filling", "reminds me of home"), fluency above_A2, cohesion above_A2
  ("so", "although", "especially") → **above_A2**.
- Caps: topic 5 (above target + full coverage), language 5 → **band 5**.
- Why: B1-like language throughout and every question answered.

### Part 1.2 (target B1)

Pictures: **A** a family cooking dinner together at home · **B** teenagers eating burgers in a fast-food restaurant.
**Q4** *Describe the two pictures and say how they are different.* · **Q5** *Do you prefer eating at home or eating
out? Why?* · **Q6** *How have people's eating habits changed in your country?*

**Low — expected band 1 (Lower A2)**

> Q4: "In first picture is a family. They cooking in kitchen. Second picture, young people, they eat burger. First is home, second is café."
> Q5: "Um… sorry, I don't understand. Um…"
> Q6: "Um… I don't know… food is… um… good."

- Questions: Q4 on_topic (describes both pictures and states a difference); Q5 missing; Q6 missing ("food is good"
  says nothing about change).
- Features: grammar A2 ("They cooking", "In first picture is a family"), vocabulary A2, fluency A2, cohesion A2
  ("second", no linkers) → **A2**.
- Caps: topic 1, language 2 → **band 1**. Biggest fix: answer Question 5.

**Middle — expected band 2 (Higher A2) — tests the .5 rounding rule**

> Q4: "In the first picture there is a family who are cooking together at home. In the second picture some teenagers are eating burgers in a café. The first one looks more healthy and calm, but the second is more fun."
> Q5: "I prefer eat at home because my mother cook very good and is cheaper. But sometimes I go to café with friends."
> Q6: "Now people eat more fast food. Before, people eat at home every day. Now many fast food is in Tashkent."

- Questions: all on_topic.
- Features: grammar B1 (relative clause "who are cooking", comparatives; errors in "prefer eat", "people eat" for
  past), vocabulary A2 ("many fast food", "cook very good"), fluency A2, cohesion B1 ("because", "but", "before",
  "now") → values 2, 1, 1, 2 → mean 1.5 → **rounds down to A2**.
- Caps: topic 4, language 2 → **band 2**. Biggest fix: vocabulary (lowest feature, first in fix priority after
  grammar). Does not meet target.
- Why: full coverage but language sits on the A2/B1 border; the rule is that an exact tie rounds down.

**High — expected band 5 (Above B1)**

> Q4: "Both pictures are about eating, but they show very different situations. In the first one, a family is preparing dinner together, which looks relaxed and quite healthy. The second shows teenagers grabbing burgers in a fast-food place, so it's quicker but probably less healthy."
> Q5: "Honestly, I'd rather eat at home. Home-cooked food is fresher, and it's a chance to talk to my family, although I don't mind eating out on special occasions."
> Q6: "I think they've changed a lot. Ten years ago fast food was rare, whereas now there are chains everywhere, so young people eat out much more and families cook together less."

- Questions: all on_topic.
- Features: grammar above_B1 ("I'd rather", "which looks…", present perfect, "whereas"), vocabulary above_B1
  ("home-cooked", "on special occasions", "chains"), fluency above_B1, cohesion above_B1 ("whereas", "although",
  "so", "both … but") → **above_B1**.
- Caps: topic 5, language 5 → **band 5**.

### Extra edge cases for the tests (not anchors)

- Silence / noise only → speech guard rejects before evaluation (no band).
- A memorised paragraph about "my hobby" given for all three Part 1.1 questions → `memorized_or_irrelevant` → band 0.
- Above-target language but one question missing → topic cap 3 → band 3 (shows coverage beats language).

---

## 5. Order of work (after this plan is approved)

1. Wait for the Part 2 evaluator/scoring/results session to merge; branch from the new `main`.
2. PR A — generalise (no behaviour change for Part 2): level ladder per rubric, rubric-config, prompt/gate wording
   from the rubric. Part 2 tests must pass unchanged; prompt hash changes → evaluator version bump.
3. PR B — Part 1.1: rubric file (official text), task type + content, question stepper UI, offsets, anchor unit tests.
4. PR C — Part 1.2: rubric file, picture content + panel, anchor tests.
5. Live calibration run on the anchors (both providers), recorded in `AI_EVALUATION_QUALITY.md`.

---

## 6. Open questions for you

1. **Timings.** Confirm: 1.1 = 3 × 30 s, no prep; 1.2 = Q4 45 s, Q5/Q6 30 s each, ~10 s to look at the pictures.
   Are questions read aloud as well as shown (do we need TTS / audio prompts)?
2. **Recording.** OK to start with one continuous recording per part (no DB migration), and move to one recording
   per question only if needed?
3. **Official text.** Please paste the official rating scale for Questions 1–3 and 4–6: band labels, the per-band
   coverage rule, and the per-feature descriptors (grammar, vocabulary, pronunciation, fluency, cohesion) for every
   level. Is the Q1–3 lower level really **A1**?
4. **Caps.** Do Parts 1.1/1.2 use the same coverage logic as Q7 (4 = all answered, 3 = two answered, 2 = at least
   two, 1 = one)? Or does the official scale score coverage differently for short answers?
5. **One band per part, or per question?** I assumed one 0–5 band for each of Part 1.1 and Part 1.2. If the exam
   rates each question separately, the scorer still works but the caps and UI change.
6. **Very short answers.** Is a two-word answer ("Home. Yes, home.") `partial` (counts as answered) or `missing`?
   This decides several low-band results; I'd like a written rule for the guidance.
7. **Q4 "describe and compare".** If the student describes only one picture, or both without comparing, is that
   `partial`?
8. **Practice mode.** Should students be able to practise a single question (e.g. only Q4) or always the full part?
9. **Pictures.** Do you have pictures we may use, or should we source licensed/stock ones?
10. **Ladder generalisation.** OK to change `levels.ts` / `model-output.ts` / the prompt so each rubric declares its own
    four level names (Part 2 strings unchanged, no stored-data migration)? These are Part 2 files, so this happens
    only after the other session merges.
