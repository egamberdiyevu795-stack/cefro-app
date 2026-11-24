# Part 1 question bank (2026-11-15)

Source: a teacher's lists uploaded by the owner on 2026-11-15 (`/mnt/project-files/uzbmb/teacher-lists/`).
Branch `claude/project-thread-naroeq`, cut from `claude/p1-stability`. Mock only: Part 1.1 and 1.2 are still off
(`PART_LIVE`), no Gemini call was made.

## Part 1.1: 30 questions, picked by how often they are asked

**Owner decision:** the list's questions are standard exam phrases, so we use them **word for word**
(`src/content/speaking/part1/part1-1-bank.ts`). Where the list gives two options with a slash
("Can you describe your house / your home?"), the screen shows the slash and the examiner's voice says "or".

### How a set is picked (`part1-1-sets.ts`)

- **Theme mix (the list's note):** every set has one **home/hometown** question, then one **daily life/free time**
  question, then one **personal preference** question (food, teacher, pets, …), in that order. The theme of each
  question is our classification (table below).
- **Tier weights 6 : 3 : 1** inside each theme: most common (red, Q1–10) 6, very common (blue, Q11–20) 3, rare
  (black, Q21–30) 1. Over all asked questions that gives **most common 59%, very common 31%, rare 10%**.
- **No two questions on the same subject:** "breakfast" (daily) never comes with a food preference question
  (favourite food, drink, cooking); "sports" (daily) never comes with "favourite sports person".
- **No repeat in a row:** the full mock and the Part 1.1 card leave out the questions of the student's latest set when
  the theme has others.
- A set is an ordinary task whose id names its questions, e.g. `a2-part1-1-set-04-13-09`
  ("Hometown, sports, favourite food"). Attempts, results, history, the evaluator and **retries** work unchanged; a
  retry keeps the same three questions. 882 valid sets.

### Where it is used

| Place | What happens |
|---|---|
| Task list, Part 1.1 card ("Questions about you", id `a2-part1-1-questions`) | Opening it redirects to a fresh weighted set. Query switches (`?mock=1`, `?timeScale=`) are kept. |
| Full mock (`planMockTasks`) | Part 1.1 gets a weighted set, avoiding the student's last set. |
| Exam laptop, "same paper" | One weighted set for the whole class. "Different paper": each student gets their own (via `planMockTasks`). |
| Mock-mode fixed pages (mock demo, laptop demo) | The default set: Q1, Q5, Q8. |

The first Part 1.1 task, "Daily life" (`a2-part1-1-daily-life`, our own wording), is **retired**: no longer offered,
but still opens by id, because stored attempts, the demo student and the tests point at it.

### Chance of each question being asked (per set, exact)

| # | Question | Tier | Theme | Chance |
|---|---|---|---|---|
| 1 | Do you live in a house or a flat? | most common | home | 19.4% |
| 2 | Can you describe your house / your home? | most common | home | 19.4% |
| 3 | Can you describe your room? | most common | home | 19.4% |
| 4 | Tell me about your hometown. | most common | home | 19.4% |
| 16 | What is your favourite room in your house? | very common | home | 9.7% |
| 20 | Tell me about your neighbourhood. | very common | home | 9.7% |
| 25 | What do you like about your hometown? | rare | home | 3.2% |
| 5 | What do you do in your free time? | most common | daily | 14.6% |
| 6 | What do you usually do at the weekends? | most common | daily | 14.6% |
| 7 | What do you do in the evenings? | most common | daily | 14.6% |
| 10 | What do you usually eat for breakfast? | most common | daily | 14.6% |
| 12 | What do you do to stay healthy? | very common | daily | 7.3% |
| 13 | Do you do any sports / exercise? | very common | daily | 7.3% |
| 17 | How often do you use the internet? | very common | daily | 7.3% |
| 18 | Do you have a mobile phone? | very common | daily | 7.3% |
| 23 | How do you spend time with your family? | rare | daily | 2.4% |
| 27 | How often do you watch TV? | rare | daily | 2.4% |
| 28 | What time do you usually get up / go to bed? | rare | daily | 2.4% |
| 29 | Tell me about your typical weekday / typical day. | rare | daily | 2.4% |
| 30 | Do you like outdoor activities? | rare | daily | 2.4% |
| 8 | Tell me about your first teacher. | most common | preference | 22.7% |
| 9 | What is your favourite food / meal? | most common | preference | 18.4% |
| 11 | Do you have any pets? | very common | preference | 11.4% |
| 14 | Tell me about your close / best friend. | very common | preference | 11.4% |
| 15 | Tell me about your school. | very common | preference | 11.4% |
| 19 | What is your favourite season? | very common | preference | 11.4% |
| 21 | What is your favourite singer / type of music? | rare | preference | 3.8% |
| 22 | Who is your favourite sports person? | rare | preference | 3.5% |
| 24 | What is your favourite drink? | rare | preference | 3.1% |
| 26 | Do you like cooking? | rare | preference | 3.1% |

The daily-life theme has 13 questions, so each one comes up less often than a home or preference question of the same
tier. Q8 is a little above Q9 because a food question is skipped after "breakfast".

Questions to check (our classification, easy to change): **breakfast** is daily life (a habit), not preference;
**school** and **best friend** are preference; **mobile phone** and **internet** are daily life.

### Audio

30 new files, `public/audio/speaking/part1/a2-part1-1-bank/v1/q01.wav` … `q30.wav`, made with the same Piper voice and
settings as every other Part 1 file (`scripts/make-part1-question-audio.mjs`, texts in `question-audio.json`).
**Normal speed since 2026-11-15:** the 0.75 slow-down is gone (the owner found it too slow; the exam speaks at a normal
pace), and every Part 1, Part 2 and Part 3 audio file was made again. The voice is to be replaced by one the owner picks
on ElevenLabs. **The owner should listen to them**, especially the
"a or b" ones (Q2, Q9, Q13, Q14, Q21, Q28, Q29).

### Mock mode

Each question has made-up demo answers and mock key words (`part1-1-bank-mock.ts`), so every set shows a demo result
in mock mode. Never read by real scoring.

## Part 1.2: nine separate tasks, data only

**Update 2026-11-21:** five entries are now real tasks with our own pictures (`part1-2-tasks.ts`, pictures in
`public/tasks/part1/`): indoor-outdoor-sports, plane-or-train, healthy-or-fast-food, online-or-classroom,
board-games-or-tv. Not made: supermarket-or-open-air-market (same topic as `b1-part1-2-shopping`) and
car-or-public-transport (too close to the official sample, decision 9). Grow-or-buy-vegetables and festivals-or-museums
are still data only.

Each page of the list shows two tasks; they are split into nine entries in `part1-2-bank.ts`. **None is a task yet:**
the list's pictures are stock/AI images from a teacher's channel and are not copied. An entry becomes a task only when
our own two pictures exist (with the licence fields every Part 1.2 picture needs).

| Entry | Questions 5 and 6 | Our two pictures must show |
|---|---|---|
| Outdoor vs indoor sports | What are the advantages of indoor sports? · Do you prefer outdoor sports or indoor sports? | someone running outside · someone at an indoor gym |
| Plane vs train | What are the advantages of travelling by plane? · Why do some people prefer travelling by train? | a passenger on a plane · a passenger on a train in the countryside |
| Supermarket vs open-air market | What are the advantages of shopping at a supermarket? · Why do some people prefer shopping at an open-air market? | a family with a trolley in a supermarket · a shopper at a market stall |
| Healthy vs fast food | Why do many people try to eat healthy food? · Why do some people choose fast food? | someone eating a salad · friends eating burgers |
| Online vs classroom | What are the advantages of online learning? · Why do some students prefer studying in a classroom? | students in a classroom · someone studying at home on a laptop |
| Board games vs TV | What are the advantages of playing board games instead of watching TV? · What are the advantages of watching TV over playing board games? | a family watching TV · friends playing a board game |
| Car vs public transport | Why do some people prefer using private cars? · Why do others choose public transport? | someone driving · a busy city bus |
| Grow vs buy vegetables | What are the advantages of growing vegetables at home? · Why do some people think that vegetables in a supermarket are better? | someone growing vegetables · a shopper at supermarket shelves |
| Traditional holidays vs museums | Are traditional holidays better than visiting museums? · Why do some people think that museums are boring? | a street festival (e.g. Navruz) · someone in a quiet museum |

**Fixes to the list's wording:** "growing veges" → "growing vegetables"; the unfinished "Why do some people think
that vegetables in a supermarket?" → "…in a supermarket are better?"; "watching TV over playing games" → "…playing
board games" (matches the pictures); the holidays task's unnumbered first question is kept as Question 4.

**Flags:**
- **Repeated task with wrong pictures:** page 3 (IMG_4031) shows the online-learning questions twice; the second copy
  sits under two eating pictures (friends in a café, a family dinner at home) that do not match. Left out. It may have
  meant "eating out vs eating at home", but its questions are not on the list.
- **Overlap:** "Supermarket vs open-air market" is the same topic as our live-in-mock task `b1-part1-2-shopping`. Use
  one or the other.
- **Question 4 (owner decision 2026-11-15):** the exam's own "What can you see in these pictures?" for every Part 1.2
  task, our live one included (`b1-part1-2-shopping` is now version 2). Describing only one picture is partial (hint
  "talk about both pictures"); comparing is welcome but no longer required. Evaluator 3.8.1: rerun the Part 1.2 anchors
  before Part 1.2 goes live.

## Part 2: their themes vs ours (reference only, our own wording stays)

| Teacher list theme | Ours |
|---|---|
| A time someone gave you advice | ✓ Advice from someone |
| A major change / important or difficult decision | ✓ An important decision |
| A goal you set for yourself | ✓ A goal you set |
| A time you worked in a team | ✓ Working in a team |
| A time you felt truly happy | ✓ A happy day |
| A time you tried to do something but failed | ✓ Trying and failing |
| A tradition you grew up with | ✓ A tradition |
| A disagreement / conflict with someone | ✗ missing |
| A challenge you faced | ✗ missing |
| A success or achievement in your life | ✗ missing |
| A time you forgave someone | ✗ missing (handle with care for teenagers) |
| A time you shared a secret | ✗ **not added on purpose** (avoided for teenagers) |

Next Part 2 tasks to write (our own wording, own pictures): disagreement, challenge, success. Forgiving only with
careful, light wording.
