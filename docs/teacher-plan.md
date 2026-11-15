# Teacher view (v1): plan

Status: **Final, approved by Asadbek 2026-11-07; extended for Version 1 on 2026-11-12 (section 10: what changed).** Where
sections 1 to 9 below say "Part 2 only", "never recordings", "No player" or "students never see ratings", section 10 and
docs/v1-plan.md (Decisions log) win. Built (mock mode only, release switch off) on
`claude/teacher-view-kd6wdk`; see docs/merge-order.md for what was not followed exactly. Built on `claude/profile-settings` (the Account page
at `/profile`, Delete my account). All decisions are in this plan; section 9 lists them.
**Not in v1:** ~~audio playback~~ (now in: section 10), messages, editing scores, deadlines (v2), public teacher sign-up (teachers are
approved by the owner by hand). Teachers see the name the student chose for them, never emails.

**Mock mode only until launch.** Real teacher pages and APIs stay off (a release switch, 404) until parent consent for
under-18s is built (section 7). Until then only `?mock=1` works.

## 1. User flows

**Teacher:** owner marks the account as teacher → Home → **Your classes** (or the link on the Account page) → Create class → code (e.g. `K7M4QD`) → students appear once they
share → student → attempt → Agree or Choose level. Also: close class, reset code (old code stops, members stay),
remove a student.

**Student (signed in; no account → create one first):** Account page → Join a class → code → Share screen (confirm
or edit **Name your teacher sees**) → **Share with this teacher**. Nothing is stored before that tap; only attempts
made **after** it are shared. Several classes allowed, each shared separately. Leave: Account page → Leave class →
confirm. Students never see the teacher's rating in v1.

## 2. Screens (phone first, design system, at most one black button)

| Screen | Content | Black button |
| --- | --- | --- |
| T1 Your classes | Teacher accounts only: a section at the **top of Home** (dashboard), above the student cards, plus a quiet "Your classes" link on the Account page. No sixth tab. One row per class: name, students, last activity. Empty: "No classes yet". | Create class (Home keeps one black button: for a teacher it is this one) |
| T2 Create class | Name field; then the code, large: "Students enter this on their Account page". | Create class, then Copy code |
| T3 Class overview | Join code (quiet Reset code). **Most common problems**: top 3 biggest fixes, once per student from their latest shared scored attempt ("4 of 9 students"), each with a quiet link to its approved lesson (read-only; none if not approved). **Students**: name, current level, attempts, last practice (dd.mm.yy), current biggest fix, retry goal (Goal met / Not yet / —). Quiet Close class at the bottom (confirm card). | Copy join code |
| T4 Student | Name, current level, skills, shared attempts newest first. Quiet Remove from class (confirm card). | Open latest attempt |
| T5 Attempt (read-only) | The result page's components: band, questions, biggest fix (quote, Try instead, goal), skills, transcript. No player, Retry or Learn how. A retry of an attempt from before joining shows no comparison. **Your view**: "CEFRO: Part 2 · Band 3 · Lower B2", then **Agree** and **Choose level**, both grey, same size, side by side, so the design doesn't push agreement. Choose level lists the part's bands with our labels ("Band 4 · Higher B2"). After: "You: Agree" or "You: Higher B2 (Band 4)", quiet Change. | **None** |
| S1 Join a class (Account page) | Code field (6 characters, not case-sensitive). Wrong code: "We can't find a class with this code." | Continue |
| S2 Share | "Ms Karimova · Group B". **Name your teacher sees** (prefilled with the first word of the account name, editable, this class only). **Will see:** that name, your level, and every Part 2 attempt you make from now on, with transcript, quotes and feedback. **Won't see:** earlier attempts, email, recordings, exam date. **If you leave:** "Your teacher loses access to everything." and "If you leave, we keep your teacher's level and ours as an anonymous number pair to improve scoring. It can't be linked to you." Quiet Not now. | Share with this teacher |
| S3 My classes (Account page) | Per class: teacher, class, name shown, "Sharing since 07.11.26", quiet Leave class → confirm card. Closed or removed: "You're no longer in this class." | Leave class (confirm card only); Join a class is grey, the Account page keeps its own black button |

## 3. Data model (one additive migration, `0006_teachers`)

- `users.role`: `student` (default) or `teacher`. Set only by an owner script, never by any API.
- `classes`: `id`, `teacher_user_id`, `name`, `join_code` (unique; 6 characters from
  `23456789ABCDEFGHJKMNPQRSTUVWXYZ`), `created_at`, `closed_at`.
- `class_members`: `id`, `class_id`, `student_user_id`, `shown_name`, `shared_at`, `share_text_version`, `ended_at`,
  `ended_by` (`student` / `teacher` / `class_closed`). One open row per class and student; rejoining is a new row, a
  new S2 tap and a new `shared_at`.
- `teacher_ratings`: `id`, `attempt_id`, `teacher_user_id`, `class_id`, `agrees`, `teacher_band` (0–5, null when
  agrees), `app_band`, `evaluator_version`, `rubric_version`. Unique per attempt and teacher. Shown with the part's
  band labels. **Never read by the scorer, result page, dashboard or History.**
- `rating_pairs` (anonymous): `teacher_band` (the app band when the teacher agreed), `app_band`, `evaluator_version`,
  `rubric_version`, `part`, `month` (YYYY-MM). **Nothing else:** no ids, no name, no transcript, no exact time, so a
  pair can't be linked to a student, attempt or teacher, and can't be deleted later.

## 4. Access rules (server only)

One check decides: `teacherCanSee(teacherId, attemptId)` = the caller's role is `teacher`, an open `class_members`
row joins one of the caller's open classes to the attempt's owner, and the attempt was **created after `shared_at`**.
It runs on every teacher page and API request (dynamic, no cache). Anything else is the same 404 as a stranger's
result.

- Teacher reads: `shown_name`, shared attempts with transcript, evaluation and retry outcome, and levels computed
  from shared attempts only. Never: email, account name, recordings (that route stays owner only), exam date,
  earlier attempts, analytics.
- Teacher writes: own classes, own ratings on attempts they can see, ending a membership in their own class.
- Student reads: own memberships (teacher's display name, class name). Never other students.
- Join: 10 wrong codes per hour per account, so codes can't be guessed.

## 5. Leave, remove, close, delete

- **Leave class, removed by the teacher, class closed:** in one transaction, `ended_at` is set, each of that
  teacher's ratings on that student's attempts becomes an anonymous `rating_pair`, and the rating row is deleted. The
  next teacher request is a 404; the student leaves the overview and the counts.
- **Student deletes their account** (`delete-account.ts`, password + DELETE): also deletes every `class_members` row
  and every `teacher_ratings` row on their attempts, with no pair made. Pairs made at an earlier Leave can't be linked to
  the student and are not deleted (the Share screen says so).
- **Teacher deletes their account:** classes closed (students see "You're no longer in this class"), the teacher's
  ratings, classes and memberships deleted. Students' attempts are untouched.
- **After Remove or Close:** the student is told only on the Account page ("You're no longer in this class") in v1;
  email comes later, once CEFRO sends email.
- Add the new tables to `delete-account.ts` and its table-by-table test.

## 6. Mock mode (`?mock=1`)

A demo teacher ("Demo teacher") with one demo class ("Demo class", code `DEMO42`) and six made-up students, built like
the demo student: hand-written answers through the real evaluation with the mock evaluator, no database, cookies or
identity. Agree, Choose level, Reset code, Remove and Close change the page only. Student side: Account page → Join →
`DEMO42` → S2 → Share changes the page only. `DemoLabel` on every screen; every link keeps `?mock=1`; works on a
Vercel Preview with no variables.

## 7. Under-18s (aligned with `docs/privacy-todo.md`)

Decided: under-18s join only with a parent's consent; age limit 18, to be confirmed by the legal check. Risks: an
adult reads a minor's stories (family, health, school); a name plus a class identifies a child; a minor's tap is not
consent.

Before real teacher pages go on, the consent work must add (privacy-todo items in brackets):
1. Age, asked once, not freely editable (Profile 1); S2 refuses an under-18 account without consent.
2. Guardian name, email and consent status, set by the guardian, never by the student (Profile 2); the consent
   notice names **teacher sharing** and the anonymous pairs.
3. Email sending and verification for the guardian link (Profile 3).
4. First name only for under-18s (Profile 4): `shown_name` must be a first name.
5. Withdrawn consent = full deletion through `delete-account.ts`, now including class links and ratings
   (Settings 1); a guardian's deletion request without the password (Settings 2).
6. Recording before an age is known; a privacy notice naming the scoring providers; Uzbekistan's Law on Personal
   Data, its age of consent and its rule on storing data in Uzbekistan (Gaps).
7. Teacher terms (teaching use only, no copies) accepted at approval; `share_text_version` stored with each share.

## 8. Tests

- Unit: `teacherCanSee` (not a teacher, other teacher, ended, rejoined, closed, attempt before `shared_at`); codes;
  common-problems counts; approved-only lesson links; band labels.
- API (as `cross-user.test.ts`), every endpoint × teacher, other teacher, student, stranger, anonymous: no `@` or
  account name in responses; recordings refuse teachers; 404 right after Leave / Remove / Close; nothing stored before
  the S2 tap; rate limit; no endpoint sets a role; real pages 404 while the switch is off.
- Leave / Remove / Close: one id-free pair per rating, rating gone. Deletion (both roles) in the table-by-table test.
  Ratings never change the result, dashboard or History.
- Mock: T5 has **no** black button and two equal grey ones; one black elsewhere; no text under 11 px; `?mock=1` links
  only. Browser: create → join → share → attempt → Agree → Leave, at 390 px.

## 9. Decisions (Asadbek, 2026-11-07)

Share only attempts made after joining · on Leave, Remove or Close keep only the anonymous pair (section 3), never
deletable, said on the Share screen · on account deletion delete everything else · teacher controls: close class,
reset code, remove a student · under-18s only with parent consent, age limit 18 pending the legal check, mock mode only
until then · teacher level stored as band 0–5, shown with our labels · the student confirms "Name your teacher sees" ·
students don't see ratings in v1 · several classes per student · teachers reach classes from "Your classes" at the top
of Home and a link on the Account page, no sixth tab · Remove / Close: Account page notice only in v1, email later.

## 10. What changed for Version 1 (docs/v1-plan.md, step 6; branch `claude/teacher-v1`, migration 0009)

Still **mock mode only** (`TEACHER_LIVE` is false). Everything below works in `?mock=1` and in the tests.

**Decided by Asadbek (2026-11-10, v1-plan Decisions log):** teachers can listen to recordings (Q4, no access log, no separate
switch), the student sees "Your teacher: B2" beside CEFRO's level (Q6), the teacher sees every part and mock.

| Was (sections 1 to 9) | Now |
| --- | --- |
| Share text version `2026-11-07`: Part 2 attempts only, "Won't see: recordings" | Version **`v1-all-parts-audio`**. "Will see": that name and your level · every part you practise from now on (1.1, 1.2, 2 and 3) · every mock you make from now on · transcripts and feedback · "Your recordings (deleted after 30 days)". "Won't see": earlier attempts, email, exam date. Nothing about leaving changed. |
| Teacher sees Part 2 attempts | Parts 1.1, 1.2, 2, 3 and full mocks, all made after `shared_at` (`teacherCanSee`, the same check; Part 3 has its own read-only attempt page). |
| No player; the recording route is owner only | `teacherCanHear(teacher, attempt)` = `teacherCanSee` **and** the student's account still has recorded teacher-sharing consent **and** the audio is not deleted. A teacher-only audio route (`GET /api/teacher/classes/[classId]/attempts/[attemptId]/audio`), never cached, inline, Range supported. The student's own route stays owner only. Player speed 1x / 1.25x / 1.5x, no download button, no access log. After 30 days: the note "Recording deleted on …", the transcript and feedback stay. |
| T3: name, level, attempts, last practice, fix, retry goal | + **Last mock** (level, date; "Not finished · date"; "—"). **Copy join link** (grey; `/join/CODE` opens the normal Join screen with the code filled in, then Share; opening it shares nothing). Copy join code stays the black one. No "Class mocks" list yet (step 7). |
| T4: shared attempts | **Mocks first** (one row each, opening T6), then single attempts (a mock's four parts are inside the mock). Black button: "Open latest mock" (else "Open latest attempt"). |
| T5 (Part 2 attempt) | Any part. Recording player or the "deleted" note. Part 3: its own page (points, biggest fix, words from the list, skills, answer) with the same **Your view**. |
| (none) | **T6 Student's mock** `/teacher/classes/[classId]/mocks/[mockId]`: estimated level, date, Finished / In progress / Not finished; four part cards, each with the player, the transcript (tap a sentence for You said / Better / Why), CEFRO's band, and grey **Agree / Choose level** for that part (the existing per-attempt rating); at the bottom the optional **Your level for this mock**. No black button. |
| `teacher_ratings` (per attempt) | Unchanged: it already is "the rating per part", because every part of a mock is an attempt. **Added** `teacher_mock_ratings` (migration 0009): one row per mock and teacher, `agrees` or `teacher_level` (Below B1, B1, B2, C1) with the estimate shown at the time. `teacher_ratings` did not need `session_id` or `part`. |
| Students never see ratings | The student's result pages (single attempts, Part 3, mock) show **"Your teacher: B2"** beside CEFRO's band or level, never instead of it, and nothing when not rated. The mock page prefers the teacher's level for the whole mock, else their part levels. |

**Old memberships (made on `2026-11-07`).** They keep the wording they agreed to: **Part 2 attempts only, no mocks, no recordings**
(`memberScope` = `part2_only`). Nothing changes for them until they tap. The Account page shows each of them **one** card,
"Share recordings too?", with two grey buttons: **Share recordings too** (`POST /api/classes/[memberId]/upgrade`) and **Not now**
(`.../decline-upgrade`). The tap sets `class_members.all_parts_from` to now: from then on every part, mock and recording of
attempts made **after the tap** is shared (the old Part 2 attempts stay as they were, text only; nothing from before the tap opens
up). `share_text_version` is not rewritten (it records what they first agreed to; `all_parts_from` records the second yes). "Not now"
stores `upgrade_declined_at`, changes nothing and the card never returns (leaving and rejoining on the new wording is the other
way). The teacher sees a quiet "Shares Part 2 only" on T3 and T4 for such a student. The upgrade needs the same teacher-sharing consent
as Share.

**Consent for audio is stricter than for text.** The text pages follow `CONSENT_REQUIRED` as before. Audio needs the student's recorded
`consent_status = granted` and `consent_teacher_sharing = true` **whatever that switch says**, so a mistake in configuration
cannot open recordings.

**Leave, Remove, Close.** One transaction as before: the membership ends, the teacher loses pages and audio at once, every part rating
becomes an id-free `rating_pair` (now for Parts 1.1, 1.2, 2 and 3), and the rating row goes. The whole-mock level is **deleted
with no pair** (a level is not a band; the part pairs carry the learning). **Delete my account** (`delete-account.ts` and
`scripts/delete-account.mjs`) also deletes every `teacher_mock_ratings` row by, in the classes of, or on the mocks of the
account, with the table-by-table test extended.

**Tests:** `teacher-access.test.ts` (pure rules and `teacherCanSee` / `teacherCanHear` / `teacherCanSeeMock`: other teacher, ended membership,
before `shared_at`, consent withdrawn, audio deleted, old wording and its upgrade), `teacher-v1.test.ts` (API cross-user for every new route),
`teacher-pages.test.ts`, `mock-view.test.ts`, `your-teacher.test.ts`, migration 0009 tests, `owner-delete-script.test.ts`, and
`e2e/teacher-v1.spec.ts` at 390 px.

## 11. What changed for Version 1, step 7: exam laptop mode (docs/v1-plan.md section 6; branch `claude/exam-laptop`, migration 0010)

Still **mock mode only** (`TEACHER_LIVE` is false; the full mock's real routes also wait for all four `PART_LIVE` switches). Everything below works in `?mock=1`
and in the tests; the real server side is covered by route tests and by a browser test on a test-only server (two laptops, a real database).

| Was | Now |
| --- | --- |
| T3's black button: Copy join code | **Start exam laptop** (black). Copy join code and Copy join link are grey. A new **Class mocks** card lists each class mock ("Mock 3 · 10.11.26 · 8 of 9 finished", "Closed") and opens T8. |
| Share (S2): name, will see / won't see | + **Class PIN**: 4 digits, a hidden field, "Your teacher can't see it". Stored only as a salted scrypt hash on `class_members.pin_hash`. |
| Account > Your classes: Leave | + **Class PIN: set / not set yet** with a small **Set PIN / Change PIN** (`PUT /api/classes/[memberId]/pin`). The only way to reset a PIN: the student, signed in, on their own device. A new PIN also clears a lock. The teacher cannot read, set or reset it. |
| (none) | **Start exam laptop** page (`/teacher/classes/[classId]/exam`): "Same paper for everyone" (the app suggests one task per part that **nobody in the class has done**; the screen sends the paper it showed) or "A different paper for each student" (each gets tasks they haven't done recently), a name for this laptop ("Room 1"), one black button. If another laptop already opened the class's mock, this page says **Join Mock 3** and joins it (same `class_mocks` row), with its own room label ("Room 2"). |
| (none) | **T7 Exam laptop** (`.../exam/[classMockId]/laptop?room=Room+2`): **not in the app frame**: no navigation, no link out (the wordmark is not a link). Class name, **Tap your name**, a list in three groups: **Not started**, **In progress (Room 2)**, **Done**. Only a student who can start is a button; a student in progress on the other laptop, done, or without a PIN is plain text ("No PIN yet. Set one on your phone.", "Locked. Ask your teacher."). The list refreshes every 4 s, so the other laptop's state shows. Tap a name → **PIN pad** → **"Hi Aziza, this mock is saved to your account"** (the mock's own "Before you start" card with the microphone check and the black Start mock) → the normal full mock → **"Done. Your results will be on your phone."** (black "Back to the list"; also back by itself after 20 s). No band, level or result is ever on this screen. |
| (none) | **T8 Class mock: results** (`.../exam/[classMockId]`): one row per student (level, the four part bands, a quiet **Listen** to T6), sorted by level (a grey control flips highest/lowest first; no level goes last), **Most common problems** for this mock only, and the black **Open first unrated** (the first row, in the order shown, with a scored part and no rating: no whole-mock level and not every scored part rated). |
| Mocks all look the same | **In class** (taken on the exam laptop) or **At home**: on T6's header, on T4's mock rows, on the student's mock result and on History's mock rows. |

**The device session (follow-up on `claude/exam-laptop`).** A shared laptop must not hold the teacher's login. When **Start exam laptop** (or joining as Room 2) succeeds, the server **signs the teacher out of that browser** (the login session row is deleted and its cookie removed: other devices of the teacher are untouched) and gives it an **exam-laptop device session** instead: a signed (HMAC) **session cookie** `cefro_exam_device`, scoped to **one class mock and one laptop** (room label), at most 12 hours, checked against the database on every request (the class mock must still be open, the teacher still a teacher). It can only: show T7 and its list (`GET /api/exam-laptop/[mockId]/roster`), take PINs (`.../pin`), make one-mock passes, and run the three mock routes a pass allows. **Everything else refuses it with the same 404 as a stranger**: `src/proxy.ts` answers the not-found page (or the JSON 404) for every address but T7, the public audio and pictures and those routes, so teacher pages, T3 to T8, the Start page, student pages, the Account page, recordings and results never open; the routes behind them also see nobody signed in. **End exam laptop** and **Unlock** ask for the teacher's **email and password** (the email must be that teacher's own; wrong ones count like failed sign-ins, 429 after too many), sign the browser in again as a normal teacher session and remove the device session; Unlock then leads to the Start page, which joins the open class mock again. The device session **ends when the class mock closes** (End and close, Close class): the list and PINs answer 404 and the dead cookie is removed; a student already under way on another laptop can still finish their mock (the three pass routes honour a closed class mock). Close the browser and the device session is gone; the browser then simply has no login.

**The pass (docs/v1-plan.md section 6).** The laptop's device session is the teacher's authority; a correct PIN makes an `exam_passes` row: one laptop (a random id the laptop made
for itself and keeps in its browser), one student, one class mock, `expires_at` 30 minutes later. The browser then sends the pass id (`x-exam-pass`) with the mock's requests; the laptop is the one named by its device session. **Only three routes read those headers** (`server/exam-laptop/acting-user.ts`): `POST /api/mock-exams` (Start mock), `POST
/api/speaking/attempts` (the recording) and `POST /api/mock-exams/[mockId]/finish`. Everywhere else a pass is ignored, so it cannot open a result, a recording, an attempt,
the student's account page, a password or anything else of the student. On those three routes the request acts as the **student**: the mock and every attempt belong to
`student_user_id`, the student's own consent check runs (`assertCanRecord`), and the teacher's account is never the owner. A pass is refused (403, `exam_pass_*`) when:
the caller is not the teacher who owns the class mock; the laptop id differs (other laptop); it is expired; it is used up; the student is locked on that laptop (a pass made
before the lock stops at once); the student left, was removed or the class closed; the student's teacher-sharing consent is gone; or the request names any mock but the one the
pass started (another student's, the teacher's own, none) or is a retry. The pass is **used up** at the end screen (finish), when the same student enters their PIN again on that laptop
(a reload replaces it), by End exam laptop on that laptop, and by Leave / Remove / Close.

**PIN lock.** Wrong PINs are counted per student **per laptop** (`class_members.pin_failures`, JSON `{"<laptop id>": n}`, saved with compare-and-set so parallel guesses can't all
count as the first). The 5th wrong PIN on a laptop locks the student **there**; 10 across all laptops lock them everywhere. A correct PIN clears that laptop's count. **Unlocking
needs the teacher's email and password** (Teacher options), as does End exam laptop: both sign the teacher in through the app's own sign-in endpoint, so its limits apply (429 after too many). A student can't be picked when done, in progress on the other laptop, without a PIN, or when the class mock is closed.

**Ending.** **Teacher options** (a quiet text action under the list) opens a card with email and password fields and: **Unlock {name}** for each locked student, **End exam laptop**
(this laptop's passes end; goes to the class page) and **End and close the class mock** (also sets `class_mocks.closed_at`: no new PIN or mock on any laptop, a student already under
way finishes; goes to T8). Closing the class closes its class mocks too.

**Data (migration 0010, additive).** New `class_mocks` (class, teacher, title "Mock N", the four task ids or all null = a different paper per student, `opened_at`, `closed_at`) and
`exam_passes` (class mock, student, `device_label`, `laptop_id`, `session_id`, `created_at`, `expires_at`, `used_up_at`); new nullable `class_members.pin_hash` and `pin_failures`;
new nullable `practice_sessions.class_mock_id` (set = "In class"; a plain text id with no foreign key, so the label survives the teacher's account). A mock started on the laptop is
never offered as "Continue your mock" at home (`findInProgressMock` skips it). **Leave / Remove / Close** (`endMembership`) clear the PIN and its failures and end the student's
passes in the same transaction; Close also closes the class's class mocks. **Delete my account** (`delete-account.ts` and `scripts/delete-account.mjs`) deletes the account's passes
as a student, the passes made in its classes and the class mocks of its classes; the PIN goes with the membership row; both are compared table by table by
`owner-delete-script.test.ts`.

**What no response holds.** No route returns a PIN, a hash or a failure count; the student's class list says only `hasPin`; the roster says only name, state, room, `hasPin`, `lockedHere`,
`locked`, `pickable`. A test reads every response of a whole session and fails on `scrypt`, `pin_hash`, `pinFailures` or either PIN.

**Kiosk mode.** A browser can't be locked into a page, but a student who types another address now reaches nothing (the device session is not the teacher's login). Run the laptop in full-screen or kiosk mode as extra safety (`docs/launch-checklist.md`, section 11). The pass and the lock live in the database, so they survive a reload and a restart.

**Tests:** `domain/teacher/exam-laptop.test.ts` (pass: wrong student, expired, used up, other laptop, locked; PIN lock; list states; paper suggestion), `app/api/teacher/exam-laptop.test.ts`
(API cross-user: every route × caller, a pass can't write to another student, a teacher can't record into their own account through it, no PIN or hash in any response, End needs the
password, Leave / Remove / Close), `server/db/migrations.test.ts` (0010), `owner-delete-script.test.ts`, `account-routes.test.ts`, `teacher-pages.test.ts`,
`e2e/exam-laptop.spec.ts` (mock mode at 1280 and 390 px: two students in a row on one laptop), `e2e/exam-laptop-real.spec.ts` (two laptops, a real database, on
`playwright.exam-laptop.config.ts`: `npm run test:e2e:exam-laptop`), `src/proxy.test.ts` (a device cookie reaches only the allowed addresses: every other page and API, T5 / T6 / T8, recordings and the Account page answer 404).
