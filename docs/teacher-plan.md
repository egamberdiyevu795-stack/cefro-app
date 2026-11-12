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
