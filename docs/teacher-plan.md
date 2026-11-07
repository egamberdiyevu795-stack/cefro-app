# Teacher view (v1): plan

Status: **plan, not approved.** No code yet. The owner's decisions (2026-11-07) are taken as given; the rest is a
proposal. **Not in v1:** audio playback, messages, editing scores, mocks or deadlines (v2), public teacher sign-up
(teachers are approved by the owner by hand). Teachers see first names only, never emails.

## 1. User flows

**Teacher:** owner marks an existing account as teacher → teacher opens Classes → Create class (name) → gets the code
(e.g. `K7M4QD`) and gives it to the class → students appear in the overview after they share → teacher opens a
student → opens an attempt → Agree or Choose level.

**Student (signed in; a browser with no account is asked to create one first):** Profile → Join a class → enters the
code → sees the share screen (who, what, how to stop) → taps **Share with this teacher**. Nothing is stored before
that tap; "Not now" or closing the page shares nothing. Later: Profile → Leave class → confirm → sharing stops at once.

## 2. Screens (phone first, design system, exactly one black button each)

| Screen | Content | Black button |
| --- | --- | --- |
| T1 Classes | One row per class: name, students, last activity. Empty: "No classes yet". | Create class |
| T2 Create class | Name field; then the code, large, with "Students enter this in Profile". | Create class, then Copy code |
| T3 Class overview | Join code (quiet Copy). **Most common problems**: top 3 biggest fixes, counted once per student from their latest scored attempt ("4 of 9 students"), each with a quiet link to its approved lesson (read-only preview; none if no approved lesson). **Students**: first name, current level, attempts, last practice (dd.mm.yy), current biggest fix, retry goal (Goal met / Not yet / —). Rows open T4. | Copy join code |
| T4 Student | First name, current level, skills (as on the dashboard), attempts newest first (as History). | Open latest attempt |
| T5 Attempt (read-only) | The result page's components: band, questions, biggest fix (quote, Try instead, goal), skills, transcript. No player, no Retry, no Learn how. **Your view** card: "CEFRO: Part 2 · Band 3 · Lower B2". After a choice: "You: Agree" or "You: Band 4 · Higher B2", quiet Change. | Agree (quiet: Choose level → the part's bands 0–5 with labels → Save) |
| S1 Join a class | Code field (6 characters, not case-sensitive). Wrong code: "We can't find a class with this code." | Continue |
| S2 Share | "Ms Karimova · Group B". **Will see:** your first name, your levels, every Part 2 attempt (past and future) with transcript, quotes and feedback. **Won't see:** your email, your recordings, your exam date. "Leave any time in Profile; they then lose access to everything." Quiet Not now. | Share with this teacher |
| S3 Profile | New page (Account menu → Profile). Class card per class: teacher, class, "Sharing since 07.11.26", quiet Leave class → confirm card. | Leave class (on the confirm card only); otherwise Join a class |

The student never sees the teacher's rating in v1 (question 7).

## 3. Data model (one additive migration, `0006_teachers`)

- `users.role`: `student` (default) or `teacher`. Set only by the owner (a script), never by any API.
- `classes`: `id`, `teacher_user_id`, `name`, `join_code` (unique; 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`,
  no 0/O/1/I/L), `created_at`, `closed_at`.
- `class_members`: `id`, `class_id`, `student_user_id`, `shared_at`, `share_text_version`, `left_at` (null = sharing).
  At most one open row per class and student. Rejoining makes a new row after a new S2 tap.
- `teacher_ratings`: `id`, `attempt_id`, `teacher_user_id`, `agrees` (bool), `teacher_band` (null when agrees),
  `app_band`, `evaluator_version`, `rubric_version` (snapshots for the later comparison), `created_at`, `updated_at`.
  Unique per attempt and teacher. **Never read by the scorer, result page, dashboard or History.**

## 4. Access rules (server only)

One function decides everything: `teacherCanSee(teacherId, studentId)` = caller's role is `teacher` **and** an open
`class_members` row joins a class owned by the caller to that student. It runs on **every** teacher request (pages
and API, dynamic, no cache). Anything else, including a left student, an unknown id and another teacher's student,
gets the same 404 as a stranger's result today.

- Teacher reads: their classes; for visible students: first name (first word of `users.name`, else "Student"),
  scored attempts, transcripts, evaluations, retry outcomes. Never: email, recordings (recording route stays owner
  only), exam date, analytics, account data.
- Teacher writes: their own classes and their own ratings on attempts they can see. Nothing of the student's.
- Student reads: their own memberships (teacher's display name, class name). Never the class list or other students.
- Join: rate-limited (10 wrong codes per hour per account) so codes can't be guessed.

## 5. Leave class and account deletion

- **Leave class:** sets `left_at`; the next teacher request is a 404. The student vanishes from the overview and the
  common-problems counts. The teacher's ratings on that student's attempts are hidden from the teacher (kept for
  calibration only, owner access, question 2).
- **Student deletes account** (account deletion doesn't exist yet; it must before launch): memberships and every
  rating on their attempts are deleted with their attempts.
- **Teacher account removed or class closed:** classes closed, all memberships ended; the student's Profile says
  "This class has closed." Ratings keep only the band numbers and versions, no teacher id.

## 6. Mock mode (`?mock=1`)

A demo teacher ("Demo teacher") with one demo class ("Demo class", code `DEMO42`) and six made-up students (first names
only), built like the demo student: hand-written answers through the real evaluation with the mock evaluator, real
types, no database, cookies or identity read. Agree / Choose level change the page only. The student side: Profile
→ Join → `DEMO42` → S2; Share changes the page only. `DemoLabel` on every screen; every link keeps `?mock=1`. Works
on a Vercel Preview with no variables.

## 7. Under-18 risks and what the consent work must add before launch

Many exam takers are school students under 18. Risks: an adult sees a minor's data; Part 2 answers are personal stories
(family, health, school problems) and transcripts carry them; a first name plus a class can identify a child; a minor's
own tap may not count as valid consent; a teacher account could be misused.

The consent work must add, **before any real class opens:** an age question at sign-up; for under-18s, parental consent
recorded before S2 can be used (or joining blocked); a privacy notice that names teacher sharing; the S2 text versioned
and stored with each share; teacher terms (use only for teaching, no copies, no sharing) accepted on approval; account
deletion; a retention rule for ratings; a check with a lawyer on Uzbekistan's personal-data law (including where the
data is stored).

## 8. Tests

- Unit: `teacherCanSee` (not a teacher, other teacher, left, rejoined, closed class); join codes; common-problems
  counts and approved-only lesson links; first-name rule.
- API (as `cross-user.test.ts`): teacher, other teacher, student, stranger and anonymous browser on every teacher
  endpoint; no `@` in any teacher response; recordings refuse the teacher; 404 right after Leave; nothing stored
  before the S2 tap; rate limit; no endpoint can set a role.
- Ratings never change the result, dashboard or History. Migration additive. Deletion removes memberships and ratings.
- Mock pages: no database, one black button, no text under 11 px, only `?mock=1` links.
- Browser: create class → join and share → overview, student, attempt → Agree → Leave → teacher gets 404; 390 px.

## 9. Open questions

1. Share **past** attempts too (proposed), or only attempts after joining?
2. After Leave: keep the teacher's ratings for calibration (owner only), or delete them?
3. Can a teacher remove a student, reset a code or close a class in v1? (Proposed: close class and reset code only.)
4. Under-18: block joining until parental consent is recorded, or allow with a notice? Which age?
5. Teacher's level: the part's band 0–5 (proposed, comparable to ours) or a CEFR level?
6. First name: first word of the display name (proposed), or ask the student to confirm it on S2?
7. Should the student ever see the teacher's rating?
8. One student in several classes at once (proposed yes, each shared separately)?
