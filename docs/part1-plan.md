# Part 1 plan: Part 1.1 (Questions 1–3) and Part 1.2 (Questions 4–6)

Status: **plan only, nothing built.** Revision 2 adds the owner's answers (2026-11-04): the official descriptors, the
scoring rules and the content decisions. Every code change below starts **after** the other session's Part 2
evaluator/scoring/results work is merged, on a fresh branch from `main` (§6).

The approach is the same as Part 2 (official Question 7, `multilevel-q7`): **the model judges, code scores.** The
model judges each question's status and each feature's level against the official descriptors, quoting the
transcript exactly. `band-scoring.ts` computes the 0–5 band from a per-part rubric JSON. No model outputs a band.

| | Part 1.1 | Part 1.2 |
|---|---|---|
| Official questions | 1–3 | 4–6 |
| Target level | A2 | B1 |
| Level ladder (index 0–3) | below_A1 · A1 · A2 · above_A2 | below_A2 · A2 · B1 · above_B1 |
| Features | grammar, vocabulary, pronunciation, fluency (**no cohesion**) | grammar, vocabulary, pronunciation, fluency, cohesion |
| Question statuses | on_topic · missing · off_topic | on_topic · partial · missing · off_topic |
| Band | one 0–5 band for Questions 1–3 together | one 0–5 band for Questions 4–6 together |
| Rubric id / file | `multilevel-q1-3` / `rubrics/multilevel_q1_3.json` | `multilevel-q4-6` / `rubrics/multilevel_q4_6.json` |

---

## 1. Task format

Source: official UZBMB `Speaking_format.pdf` (received 2026-11-04).

### Timings (official, stored as config)

| Part | Level | Questions | Preparation | Speaking time per question | Speaking total |
|---|---|---|---|---|---|
| 1.1 | A1–A2 | 1, 2, 3 | **none** | 30 s · 30 s · 30 s | 1 min 30 s |
| 1.2 | B1 | 4, 5, 6 | **none** | 45 s · 30 s · 30 s | 1 min 45 s |

The values live in each task's content file, never as literals in components or the evaluator:

```ts
questions: [{ text, audio, prepSeconds: 0, speakingSeconds: 30, partialHint? }, …]
```

`prepSeconds` stays in the shape (always 0 for Part 1) so the same stepper can serve other parts later. A content
test checks every Part 1.1 task is 3 × 30 s and every Part 1.2 task is 45 + 30 + 30 s, all with 0 preparation.

### How each question is delivered (as in the exam)

In the exam the examiner's voice reads each question and a chime signals "start speaking". The practice flow copies
this, one question after another, with no pause for preparation:

1. The question appears on screen ("Question 2 of 3" + text) **and** its audio plays.
2. A chime plays. The speaking countdown (30 s or 45 s) starts at the chime.
3. When the countdown ends, the next question starts automatically (back to step 1). After the last one the part
   ends and the upload starts.

Question audio:

- **Pre-generated audio files per question**, either recorded by a person or generated with text-to-speech when
  the content is written. They are stored with the content and versioned with the task, so every student hears the
  same audio and nothing depends on a speech API at practice time. Which source to use is still open (§7).
- One short chime sound file (original or freely licensed, source recorded like the pictures).
- Browsers block autoplay, so the part starts with a "Start" button. That tap unlocks audio for the whole part.
- If a question's audio fails to load or play, the question text is still on screen. The app plays the chime and
  starts the countdown anyway, and records the failure as an analytics event. The part never gets stuck.
- No replay button: the exam reads each question once. The text stays on screen while the student speaks.

The recorder must not record the question audio or the chime, or the transcript would contain the examiner's words
and the evaluator could quote them as the student's. So the recorder is **paused** while the question audio and the
chime play and **resumed** at the chime (`MediaRecorder.pause()` / `resume()`). It stays one recording file. Using
headphones is recommended on screen, and echo cancellation stays on.

### Part 1.1 — Questions 1–3 (familiar personal topics)

- Three questions about familiar personal topics (home, family, friends, interests), presented one after another.
  Example task (our own wording): *"What do you usually do at the weekend?"*, *"What is your favourite food? Why?"*,
  *"Who do you spend the most time with in your family?"*
- 30 s per question, no preparation. The screen shows the question number and text and a countdown ring.
- Only the full part can be practised (no single-question mode for now).

### Part 1.2 — Questions 4–6 (two pictures on one topic)

- Two pictures on one topic, on screen from the start of Question 4 to the end of Question 6.
- **Question 4 (45 s):** say what you see in the pictures and compare them. The official sample wording is *"Look at
  the photographs. What do you see in these pictures?"*
- **Questions 5 and 6 (30 s each):** questions on the same topic. Official sample: *"What are some advantages of
  walking over driving?"*, *"Why do some people prefer having a car of their own?"* (pictures: a man driving a car /
  people walking across a city street).
- No preparation: the pictures appear with Question 4's audio.
- Our tasks follow this pattern but use our own topics, questions and pictures. We do not reuse the official sample
  questions or pictures as practice content (decision 9). The sample is used only as a format reference, and its
  wording style is a guide for writing Question 4 prompts.
- Only the full part can be practised.

### Part 1.1 and 1.2 back to back

In the exam, Parts 1.1 and 1.2 run one after the other with one introduction. Each part still gets its own band
(decision 5), so in the data they stay **two attempts with one recording each**: the recording rule and the scoring
are unchanged. In the UI:

- v1: Part 1.1 and Part 1.2 can each be practised on their own (one short introduction screen each).
- A "Part 1 (exam order)" mode runs them back to back after one introduction, and shows both bands at the end.
  This needs only a small session wrapper in the UI that starts the second attempt when the first upload has
  started. Whether this mode is in v1 or comes later is open (§7).

### Recording (decided): one continuous recording per part

- One recording runs for the whole part while the app advances the questions. It is paused during each question's
  audio and chime (see above), so the file holds only the student's speech.
- The client records the start time of each question's speaking window in recording time (i.e. after pauses are
  removed), `question_offsets_ms: [0, t2, t3]`, and sends it with the upload.
- Stored on the attempt (a small JSON column or the existing attempt metadata, decided in the PR); no `responses`
  table, no change to the one-recording-per-attempt rule.
- The evaluator gets the whole transcript with the question order and the offsets as context, and quotes each
  question's answer itself, as it already does for the three Q7 questions. Per-question time used (from the
  offsets) goes into the metrics, so feedback such as "you used 12 seconds for Question 2" is measured, not guessed.
- One recording per question stays a later option, only if v1 shows answers being given to the wrong question.

### Pictures (Part 1.2)

- Only original or freely licensed images (Unsplash, Pexels or similar). Never copies or look-alikes of real exam
  pictures.
- Each image in the task content records: `src`, `alt`, `author`, `sourceUrl`, `licence`, `retrievedAt`.
  A unit test fails if any image lacks these fields.
- The evaluator reads text only, so each task's `evaluatorGuidance` describes what the pictures show and which
  differences count as a comparison.

---

## 2. Band tables (official UZBMB rating scale, verbatim)

### Part 1.1 — Questions 1–3, target A2

| Band | Label | Official rule |
|---|---|---|
| 5 | Above A2 | Performance is above A2 |
| 4 | Higher A2 | A2 descriptors; all three questions on topic |
| 3 | Lower A2 | A2 descriptors; two questions on topic |
| 2 | Higher A1 | A1 descriptors; at least two questions on topic |
| 1 | Lower A1 | A1 descriptors; one question on topic |
| 0 | — | No meaningful language, or all responses completely off-topic (e.g. memorized answers, guessing) |

**A2 descriptors**

| Feature | Official text |
|---|---|
| Grammar | Some simple grammatical structures are used correctly but basic mistakes systematically occur. |
| Vocabulary | Vocabulary is sufficient to respond to the questions, although inappropriate word choices are noticeable. |
| Pronunciation | Mispronunciations are noticeable and frequently place a strain on the listener. |
| Fluency | There is frequent pausing, false starts, and reformulations, but the meaning is still clear. |

**A1 descriptors**

| Feature | Official text |
|---|---|
| Grammar | Grammatical structure is limited to words and phrases. Errors in basic patterns and simple grammar structures impede understanding. |
| Vocabulary | Vocabulary is limited to very basic words related to personal information. |
| Pronunciation | Pronunciation is mostly unintelligible except for isolated words. |
| Fluency | Frequent pausing, false starts, and reformulations impede understanding. |

There is **no cohesion feature** in Part 1.1.

### Part 1.2 — Questions 4–6, target B1

| Band | Label | Official rule |
|---|---|---|
| 5 | Above B1 | Performance is above B1 |
| 4 | Higher B1 | B1 descriptors; all three questions on topic |
| 3 | Lower B1 | B1 descriptors; two questions on topic |
| 2 | Higher A2 | A2 descriptors; at least two questions on topic |
| 1 | Lower A2 | A2 descriptors; one question on topic |
| 0 | — | Below A2, or no meaningful language, or all responses completely off-topic |

**B1 descriptors**

| Feature | Official text |
|---|---|
| Grammar | Simple grammatical structures are used correctly. Errors occur when attempting complex structures. |
| Vocabulary | There is sufficient range and control of vocabulary for the task. Errors occur when expressing complex thoughts. |
| Pronunciation | Pronunciation is generally intelligible but mispronunciations put an occasional strain on the listener. |
| Fluency | There is some pausing, false starts, and reformulations. |
| Cohesion | Uses only simple cohesive devices. Links between ideas are not always clearly indicated. |

**A2 descriptors**

| Feature | Official text |
|---|---|
| Grammar | Some simple grammatical structures are used correctly but basic mistakes systematically occur. |
| Vocabulary | Vocabulary is sufficient to respond to the questions, although inappropriate word choices are noticeable. |
| Pronunciation | Mispronunciations are noticeable and frequently place a strain on the listener. |
| Fluency | There is frequent pausing, false starts, and reformulations. |
| Cohesion | Cohesion between ideas is limited. Responses tend to be a list of points. |

**Each rubric keeps its own text.** The same level name does not mean the same text:

- B1 vocabulary in Questions 4–6 is different from B1 vocabulary in Question 7.
- A2 fluency in Questions 1–3 adds ", but the meaning is still clear"; A2 fluency in Questions 4–6 does not.

Each rubric JSON holds its own copy, and a unit test checks every file against this section.

### Reference text for the levels outside each scale

The prompt has to tell the model what "below" and "above" look like. **Approved (owner, 2026-11-04)** as
background for the model only, never as band text: it is not shown to students, not used as a band label or band
descriptor, and each rubric marks it as reference in `descriptor_sources`, as `multilevel_q7.json` already does:

| Rubric | Level | Reference text |
|---|---|---|
| Q1–3 | above_A2 | Q4–6 B1 descriptors (same 4 features) |
| Q1–3 | below_A1 | **No text.** In Part 1.1 this level means only "no meaningful language"; band 0 there means no meaningful language or all responses off-topic, nothing else |
| Q4–6 | above_B1 | Q7 B2 descriptors |
| Q4–6 | below_A2 | Q1–3 A1 descriptors (grammar, vocabulary, pronunciation, fluency); for cohesion, the official Q4–6 A2 cohesion text is the lowest one, so it is "below A2" only when even that is not met |

### Scoring (same algorithm as Part 2, shifted down)

| | Part 1.1 | Part 1.2 |
|---|---|---|
| `topic_cap` | `{0:0, 1:1, 2:3, 3:4}` | `{0:0, 1:1, 2:3, 3:4}` |
| `above_target_full_coverage_cap` | 5 | 5 |
| `above_target_requires` | `["grammar", "vocabulary"]` | `["grammar", "vocabulary"]` |
| `language_cap` | below_A1 0 · A1 2 · A2 4 · above_A2 5 | below_A2 0 · A2 2 · B1 4 · above_B1 5 |
| `meets_target_band` | 3 | 3 |
| `min_relevant_words` (safety floor) | 0 = **no floor** | 5 |

1. `on_topic_count` = questions with a status that counts: `on_topic` in Part 1.1; `on_topic` or `partial` in
   Part 1.2.
2. `language_level` = mean of the assessed features' ladder indices, rounded to the nearest level, **exact .5 rounds
   down**. Part 1.1 averages 3–4 features (pronunciation only when the audio step assessed it); Part 1.2 averages 4–5.
3. Band 0 if:
   - the answer is memorised/irrelevant, or no question is on topic;
   - the language is at index 0: in Part 1.2 "below A2"; in Part 1.1 "below_A1", which means **only** no meaningful
     language (there is no below-A1 descriptor, so weak but meaningful A1 language is never band 0);
   - **Part 1.2 only:** fewer than `min_relevant_words` (5) relevant words in the whole part (no ratable sample).
     Relevant words = words inside the verified evidence quotes of questions that count as on topic, fillers
     (um, uh …) excluded, so the count comes from code, not from the model. This is a safety floor only; the real
     minimum is set later from real answers.
   - **Part 1.1 has no word floor** (`min_relevant_words: 0` switches the check off). The question statuses decide:
     any relevant answer counts, even one word, and the language level handles quality.
   - Part 2's own `min_words` is unchanged.
4. Otherwise `band = min(topic_cap, language_cap)`. **Band 5** needs all three questions on topic, an overall
   language level above the target, **and** grammar and vocabulary each above the target. This is the same as the
   Part 2 rule in the other session's branch (`above_target_requires`). If any of these fails, the band stays at 4
   or lower.
5. Pronunciation not assessed → result is `provisional`.

### Question status rules

- **Part 1.1:** any **relevant** answer is `on_topic`, even single words or phrases (that is what the A1 bands
  describe); the language level handles quality. Part 1.1 does not use `partial` or `minimal`. `missing` = nothing
  relevant said; `off_topic` = talks about something else.
- **Part 1.2:** a bare one-sentence answer is `partial`: it **counts** as on topic, and the feedback says to add a
  reason or detail. In Question 4, describing only one picture, or both without comparing, is `partial`, and the
  feedback must say **"compare the two pictures"** (stored as Question 4's `partialHint` in the task content, shown
  word for word).
- **`minimal`** (a bare one-sentence answer that does *not* count) is a **Part 2 rule only**.
- The model-output schema allows only the rubric's own statuses (built from `question_statuses` in the JSON), and
  the quality gate rejects any other status.

---

## 3. Reuse vs new

### Reused as is

| Piece | File |
|---|---|
| Band algorithm (counting, .5-down mean, zero rules, `min` of caps, `above_target_requires`, biggest fix) | `domain/evaluation/multilevel/band-scoring.ts` |
| Retry focus derivation, question focus text (`partial` → "answer fully") | `result.ts` |
| Rubric load + validation pattern, task ↔ rubric checks | `rubrics/index.ts`, `rubric-config.ts` |
| Exact-quote evidence checks, one regeneration, internal-name filter | `quality-gate.ts` |
| Audio step for pronunciation and pausing; `provisional` without it | `audio-assessment.ts`, `gemini-audio-assessor.ts` |
| Upload, speech guard, transcription + fallback, pipeline, polling, history, retries | `server/attempts/*`, `server/transcription/*`, `server/audio/*` |
| Errors, error patterns, model answers for missed questions, strengths | `model-output.ts` (shape) |
| Speech metrics | `domain/speaking/metrics.ts` |

### Generalise (Part 2 files → fresh branch from `main` after the other session merges)

1. **Level names per rubric.** The rubric declares `"levels": [4 names]`; the scorer works on the index 0–3 only,
   and the model-output Zod schema is built from the rubric's names. Part 2 keeps
   `below_B1/B1/B2/above_B2`, so **stored Part 2 results need no migration**.
2. **Features per rubric.** The rubric declares `"features"` (Q1–3 has no cohesion). Averaging, `lowestFeature`
   (filtered `FIX_PRIORITY`), strengths, the prompt's descriptor block and the UI feature list read from it.
3. **Question statuses per rubric** (`"question_statuses"`), as in §2.
4. **`rubric-config.ts`:** `target_level` accepts `A2`; descriptors keyed by the rubric's levels and features;
   `above_target_requires` checks "above target" by index, not the literal `above_B2`.
5. **Prompt:** remove literal B2 wording (level list, "realistic B2 level" model answers, "strengths only at B2+",
   the B1–B2 style line); everything comes from the rubric. A short Part 1 section: short timed answers; judge each
   question's answer at its offset; Part 1.1 relevance rule; Part 1.2 partial rules.
6. **Quality gate:** `strength_below_b2` → "strength below the rubric's target"; status allow-list per rubric.
7. **Mock model** and **UI labels** ("B2 target", feature list) read from the rubric.
8. `EVALUATOR_VERSION` bump (prompt changes); Part 2 rubric version unchanged unless its file changes.

### New

| Piece | Notes |
|---|---|
| `multilevel_q1_3.json`, `multilevel_q4_6.json` + `RubricId` entries | §2 text verbatim; versions `…/1.0.0` |
| `SpeakingTaskType`: `"short_answers"` (1.1), `"picture_questions"` (1.2) | Closed union, as today |
| Task content: per-question `{text, audio, prepSeconds, speakingSeconds, partialHint?}`; `images[]` with licence fields | Official timings (§1); a content test enforces them |
| Question audio files (recorded or TTS, made when the content is written) + one chime file | Stored and versioned with the content; chime source/licence recorded |
| Content: one A2 task (1.1) and one B1 task (1.2) | Pictures freely licensed, sources recorded |
| Practice UI: question stepper inside one recording (audio → chime → countdown → next), recorder paused during question audio; picture panel; "Start" tap to unlock audio | Extract the generic recording session from `PracticeExperience.tsx` first |
| `question_offsets_ms` on upload → attempt → evaluator; per-question time used in metrics | |
| Per-part speech-guard thresholds and `min_relevant_words` | Today tuned for one 2-minute answer |
| Tests: descriptor text vs §2; image licence fields; anchor judgements → `scoreBand` (§4); status allow-lists | Unit tests; anchors also as live calibration cases |

---

## 4. Anchor answers (re-checked against the official text)

Synthetic answers (no real student data). Each gives the judgements we expect from the model and the band the code
must compute from them with §2's config. Pronunciation is `not_assessed` (transcript only), so each result is also
**provisional** and the mean uses grammar, vocabulary, fluency (+ cohesion in 1.2).

**What changed in the re-check.** The real A2 descriptor says *"basic mistakes **systematically** occur"*. The first
Part 1.1 middle anchor was mostly accurate simple English, which fits B1 better ("simple structures are used
correctly"). Under this scale that would be **above_A2** and could reach band 5 instead of 3. The middle anchor has
been rewritten with systematic basic mistakes. The Part 1.2 middle anchor's grammar is now **A2** (errors in simple
past and third person are basic mistakes, not "errors when attempting complex structures"). Its band is still 2,
but the rounding case now comes from a different mix of features.

### Part 1.1 (target A2, ladder below_A1 0 · A1 1 · A2 2 · above_A2 3)

Questions: **Q1** *What do you usually do at the weekend?* · **Q2** *What is your favourite food? Why?* ·
**Q3** *Who do you spend the most time with in your family?*

**Low — expected band 1 (Lower A1)**

> Q1: "Weekend… um… I sleep. I sleep and… television. Yes."
> Q2: "Um… sorry. Um… next, please."
> Q3: "Family is… um… my city is Samarkand. Is big city."

| Judgement | Expected | Why (official text) |
|---|---|---|
| Q1 | on_topic | Relevant words and phrases count in Part 1.1 |
| Q2 | missing | Nothing about food |
| Q3 | off_topic | Talks about the city, not family |
| Grammar | A1 (1) | "limited to words and phrases" ("Is big city", "television. Yes") |
| Vocabulary | A1 (1) | "limited to very basic words related to personal information" |
| Fluency | A2 (2) | Frequent pausing, but "the meaning is still clear" for what is said |

Mean (1+1+2)/3 = 1.33 → **A1** → language cap 2; one on topic → topic cap 1 → **band 1**.
Biggest fix: answer Question 2 (coverage caps the band). Not band 0: there is meaningful language on one question.

**Middle — expected band 3 (Lower A2)**

> Q1: "At weekend I usually go bazaar with my mother. Then we cooking plov. In evening I watching film."
> Q2: "My favourite food is manti. I like because is very tasty and my grandmother make every Sunday."
> Q3: "Um… I like football. I play football with my friends in the school. Is very interesting."

| Judgement | Expected | Why (official text) |
|---|---|---|
| Q1 | on_topic | |
| Q2 | on_topic | Food and a reason |
| Q3 | off_topic | Football with friends, no family member |
| Grammar | A2 (2) | Simple structures partly right, "basic mistakes systematically occur" (missing articles/prepositions, "we cooking", "I watching", "grandmother make", missing "it") |
| Vocabulary | A2 (2) | Enough to respond; noticeable choices ("go bazaar", "watching film") |
| Fluency | A2 (2) | Some hesitation, meaning clear |

Mean 2 → **A2** → language cap 4; two on topic → topic cap 3 → **band 3**. Meets target (3).
Biggest fix: answer Question 3.

**High — expected band 5 (Above A2)**

> Q1: "Usually I spend Saturday with my friends. We go to the park or, if the weather is bad, we play games at my friend's house. On Sunday I help my parents at home."
> Q2: "I really love lagman, especially the one my father makes. It's spicy and filling, and I've eaten it since I was a child, so it reminds me of home."
> Q3: "Probably my younger sister. We share a room, so we talk a lot, and I help her with her English homework, although sometimes she's lazy."

| Judgement | Expected | Why |
|---|---|---|
| Q1–Q3 | on_topic | All answered with detail |
| Grammar | above_A2 (3) | No systematic basic mistakes; conditional, present perfect, "although" → fits the B1 reference |
| Vocabulary | above_A2 (3) | "filling", "reminds me of home": beyond basic personal words |
| Fluency | above_A2 (3) | No pausing visible in the transcript |

Mean 3 → **above_A2** → language cap 5; full coverage + grammar and vocabulary above A2 → topic cap 5 → **band 5**.

### Part 1.2 (target B1, ladder below_A2 0 · A2 1 · B1 2 · above_B1 3)

Pictures: **A** a family cooking dinner together at home · **B** teenagers eating burgers in a fast-food restaurant.
**Q4** *Describe the two pictures and compare them.* · **Q5** *Do you prefer eating at home or eating out? Why?* ·
**Q6** *How have people's eating habits changed in your country?*

**Low — expected band 1 (Lower A2)**

> Q4: "In first picture is a family. They cooking in kitchen. Second picture, young people, they eat burger. First is home, second is café."
> Q5: "Um… sorry, I don't understand. Um…"
> Q6: "Um… I don't know. Sorry."

| Judgement | Expected | Why (official text) |
|---|---|---|
| Q4 | on_topic | Both pictures described and contrasted ("First is home, second is café") |
| Q5 | missing | |
| Q6 | missing | |
| Grammar | A2 (1) | "basic mistakes systematically occur" ("They cooking", "In first picture is") but sentences, not only words → not the A1 reference |
| Vocabulary | A2 (1) | Enough to respond; noticeable choices |
| Fluency | A2 (1) | "frequent pausing, false starts" |
| Cohesion | A2 (1) | "Responses tend to be a list of points" |

Mean 1 → **A2** → language cap 2; one on topic → topic cap 1 → **band 1**. Biggest fix: answer Question 5.

**Middle — expected band 2 (Higher A2) — tests the .5 rounding rule**

> Q4: "In the first picture there is a family who are cooking together at home. In the second picture some teenagers are eating burgers in a café. The first one looks more healthy and calm, but the second is more fun."
> Q5: "I prefer eat at home because my mother cook very good and is cheaper. But sometimes I go to café with friends."
> Q6: "Now people eat more fast food. Before, people eat at home every day. Now many fast food is in Tashkent."

| Judgement | Expected | Why (official text) |
|---|---|---|
| Q4 | on_topic | Both described and compared |
| Q5 | on_topic | Preference + reason (two sentences, not a bare one) |
| Q6 | on_topic | Before/now change |
| Grammar | A2 (1) | Basic mistakes recur in simple forms ("prefer eat", "my mother cook", "people eat" for the past, "many fast food is"); the B1 text needs simple structures used correctly |
| Vocabulary | A2 (1) | "inappropriate word choices are noticeable" ("cook very good", "many fast food") |
| Fluency | B1 (2) | No more than "some pausing" visible |
| Cohesion | B1 (2) | "only simple cohesive devices" (because, but, before, now) |

Mean (1+1+2+2)/4 = 1.5 → **exact .5 rounds down → A2** → language cap 2; three on topic → topic cap 4 →
**band 2**. Does not meet target. Biggest fix: grammar (tied lowest with vocabulary; grammar comes first in
`FIX_PRIORITY`).

**High — expected band 5 (Above B1)**

> Q4: "Both pictures are about eating, but they show very different situations. In the first one, a family is preparing dinner together, which looks relaxed and quite healthy. The second shows teenagers grabbing burgers in a fast-food place, so it's quicker but probably less healthy."
> Q5: "Honestly, I'd rather eat at home. Home-cooked food is fresher, and it's a chance to talk to my family, although I don't mind eating out on special occasions."
> Q6: "I think they've changed a lot. Ten years ago fast food was rare, whereas now there are chains everywhere, so young people eat out much more and families cook together less."

| Judgement | Expected | Why |
|---|---|---|
| Q4–Q6 | on_topic | Q4 compares explicitly ("Both … but", "quicker but less healthy") |
| Grammar | above_B1 (3) | Complex structures used accurately ("I'd rather", "which looks…", present perfect, "whereas") → fits the B2 reference |
| Vocabulary | above_B1 (3) | "home-cooked", "on special occasions", "chains" |
| Fluency | above_B1 (3) | No pausing visible |
| Cohesion | above_B1 (3) | Beyond simple devices: "whereas", "although", "both … but" |

Mean 3 → **above_B1** → language cap 5; full coverage + grammar and vocabulary above B1 → topic cap 5 → **band 5**.

### Edge cases for the unit tests (not anchors)

| Case | Expected |
|---|---|
| Silence / noise only | Speech guard rejects before evaluation (no band) |
| One memorised "my hobby" paragraph for all of Part 1.1 | `memorized_or_irrelevant` → band 0 |
| Part 1.1, one word per question ("Football." / "Plov." / "Mother.") | No word floor in Part 1.1; all three on_topic; grammar A1, vocabulary A1, fluency A1–A2 → mean rounds to A1 → language cap 2, topic cap 4 → **band 2** (Higher A1: at least two on topic, A1 language) |
| Part 1.1, one relevant word for one question only, other two missing | One on topic, A1 → topic cap 1 → band 1 (not band 0) |
| Part 1.2, 4 relevant words in the whole part (e.g. Q4 "Family. Burger." / Q5 "Home, yes." / Q6 missing) | Fewer than 5 → band 0 (no ratable sample) |
| Part 1.2, exactly 5 relevant words | Not below the floor → scored normally |
| Part 1.2, Q4 describes only picture A | Q4 `partial` (counts); feedback contains "compare the two pictures" |
| Part 1.2, Q5 = "I prefer home." | Q5 `partial` (counts); feedback asks for a reason |
| Part 1.1 output contains `partial` or `minimal` | Quality gate rejects (status not allowed in this rubric) |
| Above-target grammar + vocabulary, one question missing | Topic cap 3 → band 3 |
| All features above target except vocabulary at target, full coverage | Mean rounds to above target, but `above_target_requires` fails → band 4 |

---

## 5. Decisions recorded (owner, 2026-11-04)

1. Timings come from the official `Speaking_format.pdf` and are stored as config values (filled in, see 13).
2. One continuous recording per part with a timestamp per question, for v1.
3. Official descriptors as in §2, verbatim; the lower level for Questions 1–3 is A1; Part 1.1 has no cohesion.
4. Caps work exactly like Part 2, shifted down; band 5 needs all three on topic and grammar and vocabulary above
   target.
5. One band per part.
6. `minimal` is a Part 2 rule only. Part 1.1: any relevant answer is on topic. Part 1.2: a bare one-sentence
   answer is `partial` (counts) and the feedback flags it.
7. Question 4: one picture only, or no comparison → `partial`, feedback "compare the two pictures".
8. Full part only; single-question practice later.
9. Original or freely licensed pictures only, never copies of exam pictures; licence/source stored per image.
10. Level-name generalisation goes in the Part 2 files, after the other session merges, on a fresh branch from `main`.
11. Borrowed descriptors approved, as background for the model only, never as band text: "above A2" = Questions 4–6
    B1 text; "above B1" = Question 7 B2 text; "below A2" = Questions 1–3 A1 text. Part 1.1 has no "below A1" text:
    band 0 there means no meaningful language or all responses off-topic, nothing else.
12. Minimum word count (corrected 2026-11-04): set from real answers later. For now, as config values:
    - **Part 1.1: no word floor** (`min_relevant_words: 0`). Answer statuses decide; any relevant answer counts,
      even one word. "Football. / Plov. / Mother." gives band 2 (Higher A1).
    - **Part 1.2: safety floor** `min_relevant_words: 5`: fewer than 5 relevant words in the whole part = band 0
      (no ratable sample).
13. Timings (official `Speaking_format.pdf`, received 2026-11-04): Part 1.1 = 3 × 30 s, Part 1.2 = 45 s + 30 s +
    30 s, no preparation in either. Questions are presented one after another.
14. Delivery as in the exam: each question is read aloud (recorded or TTS audio) and shown on screen, and a chime
    signals "start speaking".
15. In the exam, Parts 1.1 and 1.2 run back to back with one introduction; each still has its own band.

## 6. Order of work

1. Wait for the other session's Part 2 work to merge; branch from the new `main`.
2. **PR A — generalise** (no Part 2 behaviour change): levels, features and statuses per rubric; prompt and gate
   wording from the rubric. Part 2 tests pass unchanged; evaluator version bump.
3. **PR B — Part 1.1:** rubric file, task type + content (timings from the PDF), stepper UI, offsets, anchor tests.
4. **PR C — Part 1.2:** rubric file, licensed pictures + panel, Q4 partial hint, anchor tests.
5. Live calibration on the six anchors (both providers), results in `AI_EVALUATION_QUALITY.md`.

## 7. Still to confirm (small)

- The real Part 1.2 minimum word count, from real answers (replaces or adds to the 5-word safety floor).
- Question audio source: a recorded human voice (closer to the exam, needs a speaker and re-recording when wording
  changes) or TTS generated when the content is written (cheap, consistent, easy to update). My recommendation is TTS
  for v1, with a natural voice at a moderate speed, swapped for recordings later if students find it unnatural.
- "Part 1 (exam order)" mode (1.1 then 1.2 after one introduction): in v1, or after the two parts work on their own?
- Should the question text stay on screen while the student speaks? This plan keeps it visible, which is slightly
  easier than the exam if the exam shows it only briefly or not at all.
