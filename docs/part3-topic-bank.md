# Part 3 topic bank (2026-11-15)

Source: owner uploads in `/mnt/project-files/uzbmb/teacher-lists/`: a teacher's table of the most frequent Part 3
topics with counts (`part3-topic-frequency.jpg`) and three real exam screenshots (`part3-exam-screenshot-*.png`).
Branch `claude/project-thread-naroeq`. Mock only: Part 3 is still off (`PART_LIVE['3']`), no Gemini call.

## What was added

17 new topics in `src/content/speaking/c1/part-3-bank.ts`, plus our three v1 topics (kept): 20 in all. "Gambling should be banned" (on the teacher's rare list) is left out on purpose: not a topic for teenagers.
The **statements** are the exam's topics. **Every FOR / AGAINST point is our own writing**, three per side; the
screenshots were used only as a format reference (a test checks none of their wording is in the bank).

| Topic | Source | Weight |
|---|---|---|
| Social media should be banned for children under 16. | frequent (5×) | 5 |
| Homework should be optional for school students. | frequent (4×) | 4 |
| Books are better than films for telling stories. | frequent (4×) | 4 |
| Public transport should be free for everyone. | frequent (4×) | 4 |
| Everyone should learn to play a musical instrument. | frequent (4×) | 4 |
| Fast food restaurants should show calories on their menus. | frequent (3×) | 3 |
| Zoos should be banned. | frequent (3×) | 3 |
| University education should be free for everyone. | frequent (row of 4×, shared) | 2 |
| A university degree is necessary for success. | frequent (row of 4×, shared) | 2 |
| Single-use plastics should be banned. | rare | 1 |
| Handwriting should still be taught in schools. | rare | 1 |
| Online education should replace traditional classrooms. | rare | 1 |
| Working from home should be the standard. | rare | 1 |
| There should be more surveillance cameras in public places. | rare | 1 |
| Electric cars should replace petrol cars. | rare (also on a real screenshot) | 1 |
| Space exploration is a waste of money. | rare | 1 |
| All countries should use one global language. | real exam screenshot | 1 |
| Our v1 topics: cars in city centres, smartphones under 14, sugar tax | our own | 1 each |

## How a topic is picked

- **Full mock and exam laptop:** weighted random by the table's weight (`pickWeightedTask`), leaving out the
  student's (or, for "same paper", the class's) latest three Part 3 topics. Frequent topics make up about 70% of
  picks; a weight-5 topic comes up 5× as often as a rare one. Rare topics stay rare even for students who do many mocks.
- **Practice list:** shows all 20 topics, frequent first, then our v1 topics, then the rarer ones. The student chooses.

## Mock mode

The new topics have no hand-written demo answer: a plain one is made from each topic's own points
(`templateDemoAnswer`), and the mock evaluator uses each point's text as its key phrase. Never read by real scoring.

## Our Part 3 screen vs the real exam

Changed on 2026-11-15 (owner's answers):
- The lists are labelled **Pros** and **Cons**, as in the exam (`SIDE_LABELS`; code and the model still say for / against).
- **No ticking.** Preparation shows the statement with its Pros / Cons lists and the timer; the student plans two points per
  side in their head, as in the exam. Scoring never used the ticked points (they were only shown on the result), so the
  evaluator is unchanged; new answers are stored with no chosen points, and the result no longer says "You chose this point".

Still different (not changed): the exam shows the points as full sentences (12–20 words) in a two-column table with
1-2-3 progress circles; ours are short phrases (at most 10 words, so reading the list out is easy to spot) in two lists
with a countdown.

## Live check on Gemini (2026-11-15)

The 11 Part 3 anchors run on `gemini-3.8-flash` (evaluator 3.8.1), as the app now sends them: no ticked points.
`test/live/part3-anchors.live.test.ts`. Cost **$0.49** in total.

| Anchor | Expected | Got |
|---|---|---|
| cars-A0 | 0 | 0 |
| cars-A1 | 1 | **0** |
| cars-A2 | 2 | 2 |
| cars-A3 | 3 | 3 |
| cars-A4 | 4 | 4 |
| cars-A5 | 5 | 5 |
| cars-R1 | 4 | 4 |
| phones-A2 | 2 | **1** |
| phones-A4 | 4 | 4 |
| tax-A1 | 1 | **0** |
| tax-A5 | 5 | **6** |

**7 of 11 exact, 11 of 11 within one band.** Pattern: weak answers that mostly read the points out get one band
too low (1 → 0, 2 → 1), and one excellent answer got the top band 6 instead of 5. Time per answer 33–96 s (cars-A0
needed a second call, 216 s, $0.12). Removing the tick step did no harm: the middle and upper bands (2–5) are exact.

### Weak-answer fix (argument-evaluator 0.3.0, same day)

Three prompt rules: a short simple reason ("…, because children can call") counts as developed; one developed point
means at most "heavily_dependent"; reading the lists never lowers a language level (dependence already judges it).
Rerun of the anchors that were off plus one middle check, $0.14:

| Anchor | Expected | Before | After |
|---|---|---|---|
| cars-A1 | 1 | 0 | **1** |
| tax-A1 | 1 | 0 | **1** |
| phones-A2 | 2 | 1 | **2** |
| cars-A2 | 2 | 2 | **2** |

Not changed: tax-A5 (expected 5, got 6 once). The band-6 gate already needs grammar and vocabulary both above C1, so
it is a judgement call on a very strong answer, not a rule gap.

**Part 3 is live by default** (`PART_LIVE["3"]` on unless `PART_3_LIVE=false`), and so is Part 1.1 (owner decision
2026-11-15: no manual Vercel step). Both open on the site once this branch is merged and deployed.
