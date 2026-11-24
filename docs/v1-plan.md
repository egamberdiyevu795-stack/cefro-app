# CEFRO Version 1: plan for students and teachers

Status: **draft, 2026-11-10. Asadbek answered Q1–Q8 the same day (Decisions log at the end); the plan below
follows those answers. Only Q9 (teacher comment) is still open. Nothing in this plan is built yet.** Planning only: no app code, no migration, no model call was made to write it.
Cut from `claude/project-thread-e59hcb`.

Read with: `docs/teacher-plan.md` (Teacher view, built in mock mode), `docs/consent-design.md` (under-18 consent,
pilot route built), `docs/feedback-review.md` (open evaluator issues), `docs/design-system.md`.

---

## 0. Version 1 goal, restated (Asadbek, 2026-11-24)

CEFRO comes in three versions, each built on the one before:

| Version | What it is | Depends on |
| --- | --- | --- |
| **V1: a score you can trust** | Full mock or part by part; the student gets the level they are likely to get in the real exam; the teacher sees every student's performance **without having to listen** | — |
| **V2: a teacher, not a text corrector** | The app teaches the 1–2 things that move a B1 student to B2 (or B2 to C1) fast: answer in a structure, use connectors, a few higher-level structures and words. Not "here are your mistakes" | V1's scoring being right: you can only teach the right thing if you diagnose the right thing |
| **V3: premium** | Each job goes to the AI that does it best (e.g. one model for transcription, another for reasoning about the answer) | V2 |

**What changes for V1:** the build steps in section 8 (1–7) are built and in `main`. The teacher's main job is no longer
"listen to every recording and mark it" (section 5's listening flow) but **read the app's evaluation**: the class
overview (T3) and class mock results (T8) show each student's level, part bands and biggest weakness. Listening becomes an
optional spot check. Agree / Choose level stays, because **every teacher rating is the evidence that V1's scoring is
right** (or shows where it is wrong).

**Done means:** on real students' answers, the app and the teacher (Azamat, or an examiner) agree **within one band on
almost every part attempt and exactly on most**, and the whole-mock level matches on most mocks. Until then the anchors
(written by us, synthetic) are the only proof, and they do not prove the scoring of real speech.

**How it is measured:** GitHub → Actions → **Scoring report** → Run workflow (`.github/workflows/scoring-report.yml`,
`npm run stats:scoring` locally). Read-only, counts only. Part 1 says whether AI scoring works in production (scored by a
real model / no AI score / failed with the reason); part 2 is the teacher-vs-app agreement, per part and per mock.

**Order:**

1. AI scoring on in production. Already configured: the production health check (which includes the scoring provider
   and its key) passed on the 2026-11-24 deploy. Whether the key has credit only shows on a real answer (step 2).
2. The owner tests it: one Part 2 answer, then a full mock, on a laptop and on an iPhone. Run the Scoring report after.
3. 20–30 real mocks, each with the teacher's level (switch on `TEACHER_LIVE`, `FULL_MOCK_LIVE`, consent; `docs/pilot-runbook.md`).
4. Scoring report → where the app is too high or too low, per part → fix the rubric or prompt → re-score → report again.
5. When "done" above holds: V1 is finished, and V2 starts on the diagnosis it produced.

## 1. What Version 1 is

**One sentence:** a student sits a full speaking mock (or one part) on their own phone, gets a transcript with their
mistakes and better versions of their own sentences, and their teacher sees the results and can listen to the
recordings, without a YouTube video, a phone recorder and an evening of listening.

### The problem today (what teachers do now)

1. The class watches a YouTube video that plays the exam: questions, timers, beeps.
2. Each student answers out loud in turn while the teacher records them on the teacher's own phone.
3. After class the teacher listens to every recording, one by one, and gives each student a level by ear.
4. Students get a level and maybe one comment, days later. No transcript, no record of progress.

**Cost of this today:** one student at a time, the rest of the class waits; 10 students × about 12 minutes of audio
(a full mock) = 2 hours of listening for the teacher; the recordings live in the teacher's phone gallery (a privacy
problem nobody notices); progress is in the teacher's head.

### Who V1 is for

| Person | Wants | V1 gives |
| --- | --- | --- |
| **Student** (mainly B1 → B2, many under 18, on a phone) | Practise the real exam, know their level, know what to fix | Full mock or part by part, exam timing and voice; transcript; mistakes with better versions; one biggest fix; history |
| **Teacher** (learning centre or school teacher, runs mocks in class) | Less manual work, see who is weak at what, keep evidence of progress | A class with a join code; each student's mocks and part results; recordings and transcripts in one place; agree with the app's level or give their own |
| **Parent** (for under-18s) | Know who hears their child's voice | A clear consent that names teacher listening; can withdraw |

### Success for V1 (how we know it worked)

- One real teacher runs **one class mock with at least 6 students** on the exam laptop instead of YouTube + phone.
- The teacher says it saved time, and **checks at least 3 students' recordings** against the app's level.
- **Teacher and app agree within one band on most attempts** (the Agree / Choose level data already planned in
  `docs/teacher-plan.md`). Where they don't, we learn why before any public launch.
- At least half the students **open their result and do a retry** without being told.

### Not in V1 (Version 2)

Learning path, lessons chosen for you over weeks, teacher homework and deadlines, teacher messages and comments,
class leaderboards, school admin accounts, payments, public teacher sign-up.

---

## 2. Gap analysis: what we have vs what V1 needs

**Short answer:** most of the pieces exist. The three big gaps are (1) **the full mock itself**, (2) **sentence-by-sentence
improved versions**, (3) **teachers listening to audio and seeing all parts and mocks**. Part 3 also has no real
recording yet (mock only).

| V1 need | What exists today (on `claude/project-thread-e59hcb`) | Gap | Size |
| --- | --- | --- | --- |
| **Part 1.1 and 1.2** | Built: player, real question audio (Piper voice), exam timing, recording, scoring rubric, result. Switch `PART_LIVE["1.1"]`/`["1.2"]` is **off**. | Turn on after a live check; behind the consent lock. | Small |
| **Part 2** | Built and **live** (switch on): intro, questions read aloud, 1:00 prep, 2:00 speak, beeps, scoring, result, retry. | None for the part itself. | — |
| **Part 3** | Built in **mock mode only**: topics, intro, prep, rubric, scorer, result. **No real recording or upload route.** | Real recording + scoring route + consent lock (same as Part 2). | Medium |
| **Full mock (all parts in exam order)** | Nothing. The database already has `practice_sessions` with a `kind` column (today only `single_task`) and `session_id` on each attempt, made for this. The dashboard "Mock exam" link was removed. | A mock runner that plays 1.1 → 1.2 → 2 → 3 back to back, one session, one mock result page. Needs Part 3 real first. | Large |
| **Overall mock result** | Each part has its own band and level. No overall level. | A rule (in code, not the AI) that turns part bands into one estimated level. Must match the official scale (section 9, Q3). | Medium |
| **Transcript** | Shown on every result ("Your answer" card) with the student's own recording player. | Mistakes are not marked inside the transcript. | Small |
| **Mistakes + improved versions** | Biggest fix shows **one** quote with "Try instead", plus "What you did well / To improve" quotes and patterns ("Missing -s · 2 times"). | Competitors show **every** mistake and a better version of each sentence. We show one or two. See section 3. | Medium (needs evaluator change + live test) |
| **History** | Built: all attempts, filter by part, levels over time. | Mocks shown as one row (not 4 loose attempts); filter "Mock exams". | Small |
| **Teacher: class + join code** | Built in **mock mode** (`TEACHER_LIVE = false`): create class, code, students join and confirm "Name your teacher sees", class overview, student page, attempt page, Agree / Choose level, leave / remove / close, delete rules. | Turn on for the pilot (needs consent with teacher sharing). | Small |
| **Teacher sees all parts** | Share screen promises **Part 2 attempts only**. | Share Part 1, Part 3 and mocks; new share text version. | Small |
| **Teacher listens to recordings** | **Decided no** on 2026-11-07 (recordings are owner-only; Share screen says "Won't see: recordings"). | Owner decided yes (Q4). Needs: player on teacher pages, access rule, new Share text. See section 7. | Medium |
| **Teacher mock view** | Nothing. | A mock page per student: each part's audio, transcript, app band, teacher's band. | Medium |
| **Classroom mock** | Nothing. | Section 6. Exam laptop mode: one student at a time, PIN, saved to the student's account. | Medium |
| **Scoring cost** | Gemini credit is near zero. Mock evaluators work for everything. | A full mock = about 4 scorings (1.1, 1.2, 2, 3) instead of 1. Measure the real cost before the pilot. | — |

---

## 3. Student side

### 3.1 Two ways to practise

On `/practice` (the task list, already in exam order):

- **Full mock exam** (new, top of the page, the one black button): "All 4 parts, about 15 minutes, like the real exam."
- **Part by part** (exists): each part's tasks below it, as today.

### 3.2 Full mock: the flow

Exam rules already checked by Asadbek (memory 8–9 Nov) are reused exactly: spoken intro per part, beep at start and end
of each answer, 1.1 = 30 s each, 1.2 = Q4 45 s / Q5–6 30 s, Part 2 = intro, questions read aloud, 1:00 prep, 2:00,
Part 3 = intro, 1:00 prep, 2:00.

1. **Before you start** (one screen): "About 15 minutes. Find a quiet place. Use headphones with a microphone if you
   can. You can't pause between parts, like the real exam." Microphone check (exists). Black button: **Start mock**.
2. **Part 1.1 → 1.2 → 2 → 3**, each with its own spoken intro, no result in between. A thin progress bar at the top:
   "Part 2 of 4". Nothing else on screen that the real exam doesn't have.
3. **If something breaks** (phone call, tab closed, network): the parts already finished are saved. "Continue your
   mock" on the dashboard starts the next part. A mock not finished within 24 hours is marked "Not finished" and its
   finished parts still show their results.
4. **Uploading:** each part uploads as soon as it ends, while the next intro plays (so the student never waits at the end).
5. **Mock result** (one page, then each part's page as today):
   - Top: **estimated level** (for example "B2"), with "Estimate from this mock" underneath. Never "Passed/Failed".
   - Four rows, one per part: band and level, "See details".
   - **Biggest fix for the whole mock**: the weakest skill across parts, with its retry and lesson link (exists for
     single parts).
   - While scoring: "Scoring Part 1… Part 2…", each row fills in when ready.

Question choice in a mock: the app picks one task per part the student **hasn't done recently**, so a second mock is
not a repeat. (A teacher's exam laptop can give everyone the same tasks; section 6.)

### 3.3 Transcript with mistakes and better versions

This is what all the competitors show, and students expect it. Our version keeps our rule: **better versions of the
student's own sentences, never a new answer written for them.**

On every result page, the "Your answer" card becomes:

- The transcript, with each mistake **underlined** (not red: amber underline, readable for colour-blind users).
- Tap a sentence → it opens under it:
  - **You said:** "my father give me advice"
  - **Better:** "my father **gave** me advice"
  - **Why:** "Past story → past tense." (one short line)
- A small count at the top: "6 sentences to improve". Show **at most 8**, the most important first, so a weak answer
  doesn't become a wall of red.
- "What you did well" quotes stay. The Biggest fix stays the one thing to work on.

**What we don't do in V1:** a full "model answer" or "improved answer" that rewrites the whole response. Reasons: it is
the AI writing new ideas on the task's own topic (our rule in `docs/feedback-review.md`, issue 3), students memorise it,
and a memorised answer hides the student's real level. Some competitors do this; it is section 9, Q2.

**Honesty rules for better versions** (the evaluator must follow, tests check):

1. "Better" changes only what is wrong; it keeps the student's words and idea.
2. Each "Better" is about one mistake (same as feedback-review issue 1).
3. No claims about pauses or pronunciation from a transcript alone (feedback-review issue 2).
4. The "You said" text must be found word for word in the transcript; if not, it is dropped (code checks this, not the AI).

Technically this is one more list in the evaluator's output (sentence, better, why). The mock evaluator gets it first;
the real prompt changes only after a live test (credit needed).

### 3.4 History

- A mock is **one row**: "Mock exam · B2 · 10.11.26", opens the mock result.
- Filter pills: All · Mock exams · 1.1 · 1.2 · 2 · 3.
- Progress line uses mock levels when there are 2 or more mocks.

---

## 4. Teacher and student link

Most of this is **already designed and built in mock mode** (`docs/teacher-plan.md`, approved 2026-11-07). V1 keeps it
and changes four things.

### 4.1 How a student joins (exists)

Teacher creates a class → gets a 6-character code (e.g. `K7M4QD`) → writes it on the board → student: Account page →
Join a class → code → **Share screen** (confirm "Name your teacher sees", read what the teacher will and won't see) →
**Share with this teacher**. Only attempts made **after** that tap are shared. Student can leave any time; the teacher
loses access at once.

**Why a code and not a link:** a code works on a board in class and in a Telegram group; a link is easy to forward to
the wrong group. V1 adds a **link that pre-fills the code** (`/join/K7M4QD`) for Telegram, but the student still sees
the same Share screen and taps Share. Nothing is shared by opening a link.

**Student approval** = the Share tap. The teacher never adds a student; the student always opts in. Under-18s need
parent consent with teacher sharing first (section 7).

### 4.2 Roles (exists)

- `student` (default) and `teacher`, set only by the owner's script (`scripts/set-role.mjs`). No public teacher sign-up
  in V1: Asadbek approves each teacher by hand.
- A teacher can also practise as a student on the same account (their own attempts are never in their class).

### 4.3 What the teacher can see (V1 changes in bold)

| Teacher sees | Teacher never sees |
| --- | --- |
| The name the student chose for this class | Email, account name, exam date |
| Level from shared attempts | Attempts from before the student joined |
| **Every part (1.1, 1.2, 2, 3) and every mock**, made after joining (today: Part 2 only) | Other classes the student is in |
| Transcript, quotes, mistakes and better versions, biggest fix | Analytics, sign-in times |
| **The recording, while it exists (deleted 30 days after scoring)** (today: never) | A way to download the audio (V1 plays it only) |
| Their own rating (Agree / Choose level) | — |

### 4.4 Data model and migration sketch

One additive migration, **`0008_v1_mock_and_teacher`** (number after the pilot consent migration `0007`). No existing
column changes meaning; old rows keep working.

```
practice_sessions.kind     add value 'full_mock' (today only 'single_task'; enum in code, text in the database)
practice_sessions          add: status ('in_progress' | 'finished' | 'not_finished'),
                                finished_at, class_mock_id (null unless started from a class mock),
                                estimated_level (written by code when all parts are scored)

class_mocks (new)          id, class_id, teacher_user_id, title ("Mock 3"),
                           task_1_1, task_1_2, task_2, task_3 (null = a different paper per student),
                           opened_at, closed_at  (one row per "Start exam laptop"; two laptops share it)

exam_passes (new)          id, class_mock_id, student_user_id, device_label ("Room 2"),
                           created_at, expires_at, used_up_at  (the one-mock pass of section 6)

class_members              add: pin_hash (the student's 4-digit class PIN, hashed), pin_failures;
                                share_text_version already exists, V1 writes a new version ("v1-all-parts-audio")

teacher_ratings            add: session_id (rate a whole mock), part (rate one part); unique per
                                (attempt or session) and teacher

```

Access rule stays one function: `teacherCanSee(teacher, attempt)` (exists) plus `teacherCanHear(teacher, attempt)` =
`teacherCanSee` **and** the account still has `consent_teacher_sharing` **and** the audio is not deleted yet. (No
log of who listened: Asadbek, Q4.)

Delete rules: the new tables go into `delete-account.ts` and its table-by-table test (as every table does today). On
Leave / Remove / Close, the teacher loses audio access at the same moment as everything else.

---

## 5. Teacher views

Phone first, design system, at most one black button per screen. T1–T5 exist in mock mode; T6–T8 are new.

| Screen | What's on it | Black button |
| --- | --- | --- |
| T1 Your classes (exists, top of Home) | One row per class: name, students, last activity | Create class |
| T2 Create class (exists) | Name → code, large | Create class, then Copy code |
| **T3 Class overview** (exists, V1 adds) | Join code + **Copy join link**. **Most common problems** (exists). **Students** table: name, level, **last mock** (level, date), attempts, last practice, biggest fix. **Class mocks** list (new): "Mock 3 · 10.11.26 · 8 of 9 finished". | **Start exam laptop** (replaces Copy join code as the black one; Copy becomes grey) |
| T4 Student (exists, V1 adds) | Name, level, **level over time (mocks)**, skills, **mocks** first, then single attempts | Open latest mock |
| T5 Attempt (exists, V1 adds) | Result components read-only, **plus the recording player** and the transcript with mistakes. Your view: Agree / Choose level, both grey. | None |
| **T6 Student's mock (new)** | Top: estimated level, date, "Finished" / "Not finished". Four part cards, each: player, transcript (tap to expand), app band, **teacher's band** (Agree / Choose level per part). Bottom: "Your level for this mock" (optional). | None (rating buttons are grey, like T5) |
| **T7 Exam laptop (new)** | Class name, "Tap your name". Student list: Not started / In progress (Room 2) / Done. Then PIN pad → "Hi Aziza" → mock → "Done" → back to the list. Quiet End exam laptop (teacher's password). | **Start mock** (on the student's screen) |
| **T8 Class mock: results (new)** | One row per student: level, part bands, "Listen" (opens T6). Sort by level. "3 students: Answer every question" style common problems for this mock. | Open first unrated |

**Listening flow** (the teacher's evening job, now): T8 → first student → T6 → play Part 2 at 1.5× speed while reading
the transcript → Agree or Choose level → "Next student" (grey). Goal: under 3 minutes per student instead of 12.
Playback speed 1× / 1.25× / 1.5× on the player (new, small).

---

## 6. Classroom flow: one laptop per room, one student at a time

**Decided (Asadbek, Q7):** in class, students take the mock **one at a time on one laptop**, like the YouTube setup
today. To go faster, **two laptops in two separate rooms**. Each student speaks alone in a quiet room, so other voices
don't get into the recording, and students don't need their own phone or headphones in class.

### What the teacher does

1. **Before class (once):** students join the class with the code on their own phone and set a **4-digit class PIN**
   on the Share screen (so nobody can record under someone else's name). Under-18s have consent (section 7).
2. **In class:** teacher signs in on the laptop → class page (T3) → **Start exam laptop** → picks the paper (the app
   suggests 4 tasks nobody in the class has done) or "a different paper for each student". The laptop is now in
   **exam laptop mode** (T7). For two rooms, do the same on the second laptop: both show the same class.
3. **Each student:** taps their name on the list → types their PIN → "Hi Aziza, this mock is saved to your account" →
   **Start mock** → the full mock (about 15 minutes) → end screen "Done. Your results will be on your phone." → back
   to the list. **No results on the shared screen**, so the next student doesn't see them.
4. The list shows: Not started / In progress (Room 2) / Done. A student in progress on one laptop can't be picked on
   the other.
5. **End exam laptop** (needs the teacher's password again, so a student can't wander into the teacher's account).
   Results fill the class mock page (T8) as they come in.
6. After class: the teacher listens and marks (T6), at 1.5× speed with the transcript beside it.

**Time:** about 15 minutes per student, so 10 students take about 2.5 hours on one laptop, or about 1¼ hours on two.
That is about the same as today, but the evening of listening gets shorter: marking with the transcript beside the
audio, and no hunting for files in the phone gallery.

### How it works behind the screen

- The laptop stays signed in as the **teacher**. When a student enters their PIN, the server gives that laptop a
  **one-mock pass for that student only** (valid about 30 minutes, ends at the end screen). Every recording made with
  the pass is saved to the **student's own account**, not the teacher's, so the student sees their own result, can
  delete it, and the consent check is the student's.
- 5 wrong PINs lock that student on that laptop until the teacher unlocks them.
- A student who forgot their PIN: the teacher can't see it; the student resets it on their own phone (Account page →
  My classes).

### Also works: students on their own phones at home

Nothing stops a student doing a full mock or a single part at home on their own phone. Those attempts are shared with
the teacher too (made after joining), and show as "At home" instead of "In class".

### Why not: the teacher records students on their own account

It is closest to today's habit, but the recordings would sit in the teacher's account, not the student's: the student
can't see their own result, can't delete it, and consent is unclear. The PIN pass above gives the same "teacher's
laptop" feel without that problem.

## 7. Privacy and consent (under 18, teacher listening)

**Decided (Asadbek, Q4): teachers can listen to recordings.** Asadbek also decided the extras are not needed: **no
log of who listened, no "listened" line on the Account page, no separate teacher terms, no separate "Share
recordings" switch.** What stays, because it is already built or costs nothing:

1. **The student opts in per class** with the Share tap (exists). The Share screen's "Will see" list says "Your
   recordings (deleted after 30 days)" instead of today's "Won't see: recordings", so the screen tells the truth.
2. **Play only, no download button** on the teacher's player.
3. **Audio deleted 30 days after scoring** (built); transcripts and feedback stay until the account is deleted.
4. **Leaving the class cuts access at once**, recordings included (built for everything else).
5. **Recording stays locked until consent** (built, `CONSENT_REQUIRED`), and teacher pages need the account's
   teacher-sharing consent (built, `set-consent.mjs --teacher-sharing`).
6. **First name only** for under-18s in "Name your teacher sees", and nobody under 14
   (decided earlier).

## 8. Build order

Each step is **one separate Claude Code task** (new chat, new short branch, mock data only, push, report, stop), built
on the step before it. Sizes: S ≈ one chat, M ≈ one long chat, L ≈ may need two.

| # | Step | What it delivers | Needs | Size |
| --- | --- | --- | --- | --- |
| 1 | **Part 3 real recording** | Upload and scoring route (real evaluator wired in, mock evaluator in tests), consent lock, real result; `PART_LIVE["3"]` stays off | — | M |
| 2 | **Full mock runner** | `full_mock` session, the 4 parts back to back with intros, resume after a break, uploads during the next intro; each part is sent for AI scoring as it uploads; works on a laptop screen as well as a phone | Step 1 | L |
| 3 | **Official scale check** (docs only) | Collect what UZBMB officially publishes about the speaking score and level boundaries (sources linked, quoted exactly), so the mock result follows the official scale as far as it is public | — | S |
| 4 | **Mock result, two levels** | Mock result page: each part's transcript, recording, **AI band** and **teacher's band** side by side ("CEFRO: B2 · Your teacher: B2"); overall AI level by code from the official scale (step 3); History rows and filter. When AI scoring can't run, the AI side says "AI score not ready yet" and the teacher's level still shows | Steps 2, 3 | M |
| 5 | **Transcript with mistakes and better versions** | Evaluator output gets the sentence list (own sentences only, Q2), the real prompt updated (not live-tested), mock evaluators fill it; result page underlines and expands; the "found word for word" check | Step 4 | M |
| 6 | **Teacher: all parts, mocks and audio** | New share text, T3/T4 updates, T6 student's mock page with player (speed control, no download), AI band next to Agree / Choose level per part, `teacherCanHear` | Step 4 | M |
| 7 | **Exam laptop mode** | Class PIN on the Share screen, Start exam laptop, T7 list and PIN pad, one-mock pass, end screen, End exam laptop, two laptops on one class, T8 class mock results | Step 6 | L |
| 8 | **Pilot switch-on checklist** | Speech-to-text key, `TEACHER_LIVE` and part switches on in Production, consent recorded, `CONSENT_REQUIRED=true`, a dry run with Asadbek on two laptops | Steps 1–7 | S |
| 9 | **AI scoring live** (when there is credit) | No new building: top up Gemini, live check on `gemini-3.8-flash` with the anchors, feedback-review fixes, then the AI side of every result fills in, including attempts already recorded in the pilot (re-score button for the owner) | Credit | S–M |

### First pilot (decided: Q1, changed by Asadbek on 2026-11-10)

**Steps 1–8. AI scoring and teacher marking are both built now, side by side** (Asadbek: build AI scoring along the
way, not later). One teacher (Azamat, at our language centre), about 10 students, one or two laptops in quiet rooms.

- Every answer goes to AI scoring as soon as it is uploaded. **Without Gemini credit**, the AI side shows "AI score not
  ready yet" and nothing breaks; the teacher's level carries the pilot.
- The teacher listens with the transcript and the AI's feedback beside it, and gives Agree or their own level.
- The student sees their transcript, the AI's feedback (when ready) and the teacher's level, labelled
  "Your teacher: B2", next to the app's level, never instead of it (Q6).
- When credit arrives (step 9), we only switch it on: no rebuild. Pilot answers already recorded can be re-scored, so
  we get AI vs teacher levels on the same answers, which is exactly the check we need before any launch.

**What it still needs:** speech-to-text for the transcript (an OpenAI key, or Gemini transcription; a small cost per
minute of audio), and Gemini credit for the AI side.

## 9. Questions for Asadbek

**Q1 (answered, then changed: both AI scoring and teacher marking built now). Pilot with AI scoring, or recording + teacher marking first?** Recommended: **recording + teacher marking first**
if credit is still short. It solves the teacher's problem today and gives us real marked answers to check our scoring.
AI scoring switches on when there is credit.

**Q2 (answered: own sentences only). Better versions: own sentences only, or also a full improved answer?** Recommended: **own sentences only** in V1
(section 3.3). A full rewritten answer gets memorised and goes against our "no ready-made sentences" rule.

**Q3 (answered: estimated level, following the official scale as far as it is published; step 3). What overall result does a mock show?** The real exam's total score and level boundaries need checking against
the official UZBMB papers before we show anything. Recommended: show **an estimated level only (B1 / B2 / C1)**, no
made-up total score, until the official conversion is checked.

**Q4 (answered: yes, without the extras; section 7). Can teachers listen to recordings?** This changes the 2026-11-07 decision ("teachers never hear recordings").
Recommended: **yes, with the rules in section 7** (consent names it, play only, access log, 30-day deletion).

**Q5 (settled by Q4: one tap). One Share tap for everything, or a separate "Share recordings" switch?** Recommended: **one tap** in V1. Simpler
for students; the parent consent already decides it for under-18s.

**Q6 (answered: yes). Does the student see the teacher's level?** Teacher plan says no in v1. In a class it would be natural, and the
cheap pilot (Q1) needs it. Recommended: **yes, labelled "Your teacher: B2"**, next to the app's level, never instead.

**Q7 (answered: one student at a time on one laptop, or two laptops in two rooms; section 6). Classroom setup:** is "each student on their own phone, with headphones" realistic in the classes you know?
If not, we design the shared-laptop flow properly instead of just not breaking it.

**Q8 (answered: Azamat, a teacher at our language centre). Who is the first pilot teacher**, and how many students (we planned about 10)? Are any under 14?

**Q9. Teacher written comment?** Teachers grade by hand today and probably write notes. A one-line comment per mock is
small to build but is a "message" (excluded from v1 in the teacher plan). Recommended: **not in V1**, ask the pilot
teacher.

## Decisions log

Asadbek, 2026-11-10:

- **Q1:** first pilot = students record, the teacher listens and gives the level; AI scoring later, when there is credit.
- **Q2:** better versions fix the student's own sentences only; no full rewritten answer.
- **Q3:** the mock shows an estimated level, following the official UZBMB scale as closely as it is published.
- **Q4:** teachers can listen to recordings. No extra parent information, access log or teacher terms needed.
- **Q7:** in class, one student at a time on one laptop; two laptops in two separate rooms to go faster.
- **Q6:** the student sees the teacher's level, next to the app's level.
- **Q8:** first pilot teacher: Azamat, at our language centre.
- **Change to Q1:** build AI scoring now, alongside teacher marking, even though it can't run without credit yet. The
  pilot shows both; the AI side fills in when credit arrives.
