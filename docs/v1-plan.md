# CEFRO Version 1: plan for students and teachers

Status: **draft for Asadbek, 2026-11-10. Nothing in this plan is built yet, and no decision here is final until
Asadbek answers section 9.** Planning only: no app code, no migration, no model call was made to write it.
Cut from `claude/project-thread-e59hcb`.

Read with: `docs/teacher-plan.md` (Teacher view, built in mock mode), `docs/consent-design.md` (under-18 consent,
pilot route built), `docs/feedback-review.md` (open evaluator issues), `docs/design-system.md`.

---

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

- One real teacher runs **one class mock with at least 6 students** through CEFRO instead of YouTube + phone.
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
| **Teacher listens to recordings** | **Decided no** on 2026-11-07 (recordings are owner-only; Share screen says "Won't see: recordings"). | Owner now wants it. Needs: a new decision, new consent text, access rule, teacher terms. See section 7. | Medium |
| **Teacher mock view** | Nothing. | A mock page per student: each part's audio, transcript, app band, teacher's band. | Medium |
| **Classroom mock** | Nothing. | Section 6. Same paper for the class + live "who has finished" list. | Medium |
| **Consent for under-18s** | Pilot route built: owner script `set-consent.mjs` (has `--teacher-sharing`), recording locked until consent, audio deleted 30 days after scoring. Parent message written but **not sent**. | Parent message must name teacher listening; native Uzbek/Russian check; lawyer questions still open. | Small (text), but blocks the pilot |
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
not a repeat. (A teacher's class mock gives everyone the same tasks; section 6.)

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
                           task_1_1, task_1_2, task_2, task_3 (the same paper for everyone),
                           start_code (4 digits, only while open), opened_at, closed_at

class_members              add: share_text_version already exists; V1 writes a new version
                                ("v1-all-parts-audio") and stores audio_shared (0/1) per membership

teacher_ratings            add: session_id (rate a whole mock), part (rate one part); unique per
                                (attempt or session) and teacher

audio_access_log (new)     id, teacher_user_id, attempt_id, played_at
                           (so a parent or the owner can see who listened; deleted with the account)
```

Access rule stays one function: `teacherCanSee(teacher, attempt)` (exists) plus `teacherCanHear(teacher, attempt)` =
`teacherCanSee` **and** the membership has `audio_shared = 1` **and** the account still has `consent_teacher_sharing`
**and** the audio is not deleted yet. Every audio request writes one `audio_access_log` row.

Delete rules: the new tables go into `delete-account.ts` and its table-by-table test (as every table does today). On
Leave / Remove / Close, the teacher loses audio access at the same moment as everything else.

---

## 5. Teacher views

Phone first, design system, at most one black button per screen. T1–T5 exist in mock mode; T6–T8 are new.

| Screen | What's on it | Black button |
| --- | --- | --- |
| T1 Your classes (exists, top of Home) | One row per class: name, students, last activity | Create class |
| T2 Create class (exists) | Name → code, large | Create class, then Copy code |
| **T3 Class overview** (exists, V1 adds) | Join code + **Copy join link**. **Most common problems** (exists). **Students** table: name, level, **last mock** (level, date), attempts, last practice, biggest fix. **Class mocks** list (new): "Mock 3 · 10.11.26 · 8 of 9 finished". | **Start a class mock** (replaces Copy join code as the black one; Copy becomes grey) |
| T4 Student (exists, V1 adds) | Name, level, **level over time (mocks)**, skills, **mocks** first, then single attempts | Open latest mock |
| T5 Attempt (exists, V1 adds) | Result components read-only, **plus the recording player** and the transcript with mistakes. Your view: Agree / Choose level, both grey. | None |
| **T6 Student's mock (new)** | Top: estimated level, date, "Finished" / "Not finished". Four part cards, each: player, transcript (tap to expand), app band, **teacher's band** (Agree / Choose level per part). Bottom: "Your level for this mock" (optional). | None (rating buttons are grey, like T5) |
| **T7 Class mock: live (new)** | Big start code, the paper (4 tasks), a list of students: Not started / Part 2 / Uploading / Finished / Scored. Quiet Close mock. | **Close mock** at the end |
| **T8 Class mock: results (new)** | One row per student: level, part bands, "Listen" (opens T6). Sort by level. "3 students: Answer every question" style common problems for this mock. | Open first unrated |

**Listening flow** (the teacher's evening job, now): T8 → first student → T6 → play Part 2 at 1.5× speed while reading
the transcript → Agree or Choose level → "Next student" (grey). Goal: under 3 minutes per student instead of 12.
Playback speed 1× / 1.25× / 1.5× on the player (new, small).

---

## 6. Classroom flow: one teacher, many students, one mock

### Recommended: each student on their own phone, same paper

1. **Before class (once):** students join the class with the code and the parent consent is done (section 7).
2. **In class:** teacher opens T3 → **Start a class mock** → picks a paper (the app suggests 4 tasks nobody in the class
   has done) → a 4-digit **start code** appears big on T7 (and can be put on the projector).
3. Students: dashboard → "Join class mock" → start code → the normal full mock with that paper.
4. Teacher watches T7: who started, who is on which part, who finished. Students who finish early can sit quietly.
5. Teacher taps **Close mock** at the end; later starts are refused. Results fill T8 as scoring finishes.
6. After class: teacher listens to the ones that matter (T6), not all of them.

**The noise problem (real risk):** 15 students speaking at once in one room means each phone also hears the others.
The app needs to hear only the speaker. In order of usefulness:

- **Headphones with a microphone** (most students have cheap ones): strongly recommended on the Before-you-start screen
  and on T7 ("Ask students to use headphones with a mic").
- **Spread out / stagger:** half the class starts, the other half 2 minutes later, so the loud parts don't overlap.
- **Test it first** (build step 0 in section 8): record a real classroom with 5 phones and check the transcripts.
  If other voices get into the transcript, the transcript-only scoring will be wrong.

### Fallback: one shared laptop (like the YouTube setup today)

Students take turns on the teacher's laptop. Each student signs in, does the mock, signs out. Slower and less private
(the next student is waiting next to them), but it needs no student phones. V1 supports it only by **not breaking it**:
a clear "Sign out" at the end of a mock, and the next sign-in never shows the previous student. No special "kiosk mode"
in V1.

### Why not: the teacher records students on their own account

It is closest to today's habit, but the recordings would sit in the teacher's account, not the student's: the student
can't see their own result, can't delete it, and consent is unclear. Not in V1.

---

## 7. Privacy and consent (under 18, teacher listening)

**What changes:** a teacher (an adult who is not the parent) hears a child's voice and reads what they said about
their family, school and plans. That is more sensitive than reading feedback, and our 2026-11-07 decision said no.
If Asadbek now says yes, these are the minimum rules:

1. **Consent names it.** The parent message (`docs/pilot-parent-message.md`, not sent yet) adds one plain line:
   "If your child joins a teacher's class in CEFRO, that teacher can listen to the recordings and read the
   transcripts of answers made after joining, until the recording is deleted (30 days)." New notice version; recorded
   with `set-consent.mjs --teacher-sharing`. The native Uzbek / Russian check is still needed before sending.
2. **The student chooses, per class.** The Share screen shows, in its "Will see" list: "Your recordings (deleted after
   30 days)". It is one tap for everything in V1 (simpler); a separate "Share recordings" switch is section 9, Q5.
3. **Play only, no download.** The player streams; there is no download button. (A determined teacher can still record
   the speaker. The teacher terms forbid it.)
4. **Teacher terms**, accepted when Asadbek makes the account a teacher: teaching use only, no copies, no sharing,
   delete nothing locally because nothing is saved locally. Stored with the date.
5. **Who listened is recorded** (`audio_access_log`). The student's Account page shows "Ms Karimova listened to 3
   recordings" so the family can see it. Deleted with the account.
6. **Audio still deleted 30 days after scoring**; transcripts and feedback stay until the account is deleted (decided
   2026-11-08). The teacher sees "Recording deleted on …" after that.
7. **Leaving cuts access at once**, recordings included (as today for everything else).
8. **First name only** for under-18s in "Name your teacher sees" (teacher plan §7, item 4).
9. **Nobody under 14** until the lawyer answers (decided 2026-11-08). Add to `docs/lawyer-questions.md`: "Can a teacher
   (not the parent) listen to a minor's recording with the parent's written consent? Must the school or centre also
   sign something?"

Today's recordings on the teacher's phone gallery have none of these protections, so V1 is a privacy improvement over
the current practice, as long as these rules hold.

---

## 8. Build order

Each step is **one separate Claude Code task** (new chat, new short branch, mock data only, push, report, stop), built
on the step before it. Sizes: S ≈ one chat, M ≈ one long chat, L ≈ may need two.

| # | Step | What it delivers | Needs | Size |
| --- | --- | --- | --- | --- |
| 0 | **Classroom noise test** (not code) | Asadbek records 5 phones answering at the same time in one room, half with headphones; we listen to how much of the other voices each phone picks up (and run speech-to-text on them once there is a key) | A classroom, 20 minutes | — |
| 1 | **Part 3 real recording** | Upload and scoring route, consent lock, real result; `PART_LIVE["3"]` stays off | — | M |
| 2 | **Transcript with mistakes and better versions** | Evaluator output gets the sentence list; mock evaluators fill it; result page underlines and expands; the "found word for word" check | Step 1 (so all parts get it) | M |
| 3 | **Full mock runner** | `full_mock` session, the 4 parts back to back with intros, resume after a break, uploads during the next intro | Step 1 | L |
| 4 | **Mock result + overall level** | Mock result page, the level rule in code, mock biggest fix; History rows and filter | Step 3, Q3 answered | M |
| 5 | **Teacher: all parts and mocks** | New share text, T3/T4 updates, T6 student's mock page, ratings per part | Step 4 | M |
| 6 | **Teacher: audio** | Player on T5/T6 with speed control, `teacherCanHear`, access log, Account page "listened" line, consent text | Step 5, Q4 answered | M |
| 7 | **Class mock** | Start a class mock, start code, T7 live list, T8 results, Close | Step 5 | L |
| 8 | **Pilot switch-on checklist** | Parent message updated and checked, teacher terms, `TEACHER_LIVE` and part switches on in Production, consent recorded, cost measured | Steps 1–7, credit | S |

### Minimum cut for the first pilot (recommended)

**Steps 0, 1, 3, 4, 5, 6, 8.** One teacher, one class, students on their own phones, full mock and part-by-part,
teacher sees every result and can listen. **Left out:** step 7 (class mock with start code: in the pilot, the teacher
just says "everyone start a full mock now" and sees results on T3/T4) and step 2 (better versions: students still
get the biggest fix, quotes and transcript as today). Step 2 is the first thing after the pilot, because it needs a
live test with credit anyway.

**Cheaper pilot if there is no Gemini credit** (section 9, Q1): steps 0, 1, 3, 5, 6, 8 with **scoring off**: students
record the mock, the teacher listens and gives the level (Choose level), the student sees the transcript and the
teacher's level. This already replaces the YouTube + phone routine, costs only speech-to-text, and gives us a set of
teacher-marked recordings to test our scoring against later. It needs speech-to-text (an OpenAI key, or Gemini
transcription), and the student would see the teacher's level, which the teacher plan says students don't see in v1.

---

## 9. Questions for Asadbek

**Q1. Pilot with AI scoring, or recording + teacher marking first?** Recommended: **recording + teacher marking first**
if credit is still short. It solves the teacher's problem today and gives us real marked answers to check our scoring.
AI scoring switches on when there is credit.

**Q2. Better versions: own sentences only, or also a full improved answer?** Recommended: **own sentences only** in V1
(section 3.3). A full rewritten answer gets memorised and goes against our "no ready-made sentences" rule.

**Q3. What overall result does a mock show?** The real exam's total score and level boundaries need checking against
the official UZBMB papers before we show anything. Recommended: show **an estimated level only (B1 / B2 / C1)**, no
made-up total score, until the official conversion is checked.

**Q4. Can teachers listen to recordings?** This changes the 2026-11-07 decision ("teachers never hear recordings").
Recommended: **yes, with the rules in section 7** (consent names it, play only, access log, 30-day deletion). Also
add the question to the lawyer list.

**Q5. One Share tap for everything, or a separate "Share recordings" switch?** Recommended: **one tap** in V1. Simpler
for students; the parent consent already decides it for under-18s.

**Q6. Does the student see the teacher's level?** Teacher plan says no in v1. In a class it would be natural, and the
cheap pilot (Q1) needs it. Recommended: **yes, labelled "Your teacher: B2"**, next to the app's level, never instead.

**Q7. Classroom setup:** is "each student on their own phone, with headphones" realistic in the classes you know?
If not, we design the shared-laptop flow properly instead of just not breaking it.

**Q8. Who is the first pilot teacher**, and how many students (we planned about 10)? Are any under 14? (Not invited
until the lawyer answers.)

**Q9. Teacher written comment?** Teachers grade by hand today and probably write notes. A one-line comment per mock is
small to build but is a "message" (excluded from v1 in the teacher plan). Recommended: **not in V1**, ask the pilot
teacher.

---

## Decisions log

(Empty: to be filled when Asadbek answers section 9.)
