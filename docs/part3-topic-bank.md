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
