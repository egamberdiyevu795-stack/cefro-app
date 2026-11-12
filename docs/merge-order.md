# Merge order

Checked 2026-11-06 against `main` at `b597b4f` (Merge PR #6). **Nothing has been merged.** Every branch below starts
from that `main` (none is behind it), and every check here was a dry run in a throwaway worktree.

## Safe order

| # | Branch | PR | Merge as | Rebase needed? |
| --- | --- | --- | --- | --- |
| 1 | `claude/compassionate-johnson-odu08r` | **#5** (open) | merge commit | No |
| 2 | `claude/friendly-darwin-l73xx9` | none yet | merge commit | No |
| 3 | `claude/design-system-dashboard` | none yet | merge commit | No |
| 4 | `claude/sharp-fermi-qol4ym` | none yet | merge commit | No |
| 5 | `claude/part2-practice-flow` | none yet | merge commit | No |
| 6 | `claude/real-result-page` | none yet | merge commit | No |
| 7 | `claude/part1-plan` | none yet | any | No (one new doc) |
| 8 | `claude/lucid-euler-460531` | none yet | any | No (one new doc) |
| 9 | `claude/sleepy-hypatia-rp7db1` | none yet | any | No (new module + tests) |
| 10 | `claude/upbeat-ride-2eymyu` | none yet | merge commit | No (one new doc) |
| 11 | `claude/wave1-lesson-drafts` | none yet | merge commit | No (new docs, on top of 10) |
| 12 | `claude/part1-player` | none yet | merge commit | **Yes: one fix, see below** |

Steps 7–11 are independent of each other and of steps 1–6: they can go in any order, before or after them.
Step 12 must come **after step 5** (or carry the fix below).

**Update 2026-11-08:** steps 7 and 12 are both inside `claude/project-thread-krzvuk` (the finished Part 1 branch,
after `claude/launch-cleanup`, see its section below). Merge that branch instead of 7 and 12 on their own.
Steps 8 and 9 (with `claude/part3`) are inside `claude/project-thread-mz2ndw` (Part 3, right after
`claude/project-thread-krzvuk`, see its section below). Merge that branch instead of 8 and 9 on their own.
Pilot consent (`claude/consent-pilot`) comes **right after `claude/project-thread-mz2ndw`** and contains
`claude/pilot-consent` and `claude/consent-plan-j0ky8m`: merge it instead of those two.
`claude/p2-read-qs` (Part 2 questions read aloud) comes **right after `claude/consent-pilot`** and contains it.
`claude/practice-list` (task list restyle) comes **right after `claude/p2-read-qs`** and contains it.
`claude/project-thread-e59hcb` (all four parts on the task list) comes **right after `claude/practice-list`** and contains it.

### Why merge commits for 1–6 (and 10–11)

Steps 1–6 are one chain: each branch contains the one before it (2 and 3 both start from 1; 4 merges 2 and 3). Merged
in this order, each one only adds its own commits. **Do not squash or rebase-merge them**: a squashed step 1 gives
`main` new commit ids, and steps 2–6 would then conflict with their own history. If one must be squashed, rebase every
later branch onto the new `main` before merging it. The same goes for 10 → 11.

Merging step 6 alone would bring in 1–6 together; merging them one by one keeps each review small.

## What each branch contains

**1. `compassionate-johnson-odu08r`: PR #5.** Part 2 task "Advice from someone" with its picture; the exact-band
anchor set (A0–A5) and the picture-only anchor; evaluator 3.1.0 → 3.5.0 calibration (B1 / B2 / above-B2, below-B1
cues, owner scoring decisions); rubric `multilevel-q7/2.1.0`. 69 files. Contains two earlier merges of `main`.

**2. `friendly-darwin-l73xx9`.** Test data only: the 19 saved live evaluator outputs from gemini-3.6-flash
(`test/fixtures/live-3.6-flash/`, **not** the production model) with a fixture test, and a one-at-a-time mode for
the live evaluation run. 11 files, no app code. The result page (4 onwards) reads these fixtures.

**3. `design-system-dashboard`.** The design system (`src/app/design-system.css`, `src/components/ds/`), the mocked
`/dashboard`, feature flags, the `(site)` route group (home, login, register moved into it; URLs unchanged), and the
server-configuration check moved from startup to each route. 44 files.

**4. `sharp-fermi-qol4ym`.** Merges 2 and 3, then: the `/result` prototype on the design system (fed by the fixtures
of 2, through the real evaluator types), `docs/design-system.md`, `docs/feedback-review.md`.

**5. `part2-practice-flow`.** The Part 2 practice screens on the design system (brief, preparation, recording,
microphone states, early-finish warning), the retry goal on every screen, `?mock=1`. Moves the practice page out of
`(site)` (same URL). **Deletes the old practice panels**, including `CountdownRing.tsx` (see 12).

**6. `real-result-page`.** Real attempts on the new result page, at their own address `/result/[attemptId]` (owner
only, 404 otherwise); patterns in this answer; the retry comparison and error screens on the design system;
`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; the real Account menu everywhere (old header control
removed; `/api/account/me` now also returns the display name); the start-of-speaking beep; this file.
Deletes the old feedback report and its components.

**7. `part1-plan`.** `docs/part1-plan.md` only: the plan for Part 1.1 / 1.2 (official timings, question delivery
with a chime, TTS, decisions).

**8. `lucid-euler-460531`.** `docs/part3-plan.md` only: the plan for Part 3 (Question 8, C1, band 0–6).

**9. `sleepy-hypatia-rp7db1`.** `src/domain/evaluation/multilevel/prompt-overlap.ts` with its fixtures and tests
(Part 3 plan §6). Not used by the app yet.

**10. `upbeat-ride-2eymyu`.** `docs/teaching-plan.md` (problem list, lesson map, lesson format, decisions).

**11. `wave1-lesson-drafts`.** Contains 10, then the first lesson drafts (L-T1, L-T4 B2, L-T8) in
`docs/lessons/drafts/` and a teaching-plan update. Merging 11 also brings in 10.

**12. `part1-player`.** The Part 1 question-by-question player on a dev-only page (`/dev/part1-player`, 404 in
production): Part 1 content, placeholder question audio and chime, a pausable recorder, the sequence state machine,
and its own browser test. 26 new files.

## The one rebase: `part1-player`

`src/features/speaking-practice/components/QuestionSequencePlayer.tsx` imports `./CountdownRing`, which step 5
deleted. After step 5, `part1-player` merges **without a text conflict but does not type-check** (`TS2307: Cannot find
module './CountdownRing'`).

Fix while rebasing it onto the new `main` (or in one commit before merging), either:

- **quick:** add `CountdownRing.tsx` back (it is in history: `git show 31965d8:src/features/speaking-practice/components/CountdownRing.tsx`), or
- **better, when Part 1 gets its real screens:** use the design-system countdown from `components/screens.tsx`.

Checked: steps 1–11 plus `part1-player` with `CountdownRing.tsx` restored type-check, lint cleanly, pass all 880
unit tests, and pass `e2e/part1-player.spec.ts` (4 of 4).

Also, once it is in:

- **Where the dev page lives.** `docs/design-system.md` used to say to move it into `(site)`. That is no longer needed:
  the practice page itself left `(site)` in step 5, and a dev page needs no header. Keep it at `src/app/dev/part1-player/`.
- **One chime.** Part 2 no longer plays a file: since `claude/launch-cleanup` its chime is two tones made in code
  (`lib/chime.ts`, Web Audio) and the copy of the placeholder `.wav` is deleted. `part1-player` still adds its own
  `chime.wav` (a file the chain never had at its base, so it merges without a conflict). When Part 1 ships, play the
  same code-made chime there (`playChime`) instead of the file, so both parts sound the same.
- It still uses the older `components/ui` styles; restyle it with the design system when Part 1 ships.

## After step 6: `claude/history-page`

Cut from `real-result-page` (step 6), so it comes after it, merge commit. Contains: the History page, real Recent
attempts on the dashboard, Part 2 playing Part 1's chime file. No database migration.

## After that: `claude/dashboard-real-data` (adds a database migration)

Cut from `history-page`, so it comes after it, merge commit. Contains: the dashboard on real data, the exam date.

**Migration `0005_exam_date`:** adds two nullable columns to `users` (`exam_date`, `exam_date_skipped_at`). Additive
only: no table is rebuilt and no row changes. Local databases apply it when they open; **the hosted database needs
`npm run db:migrate` before (or as) this branch is deployed**, as with every migration: the app refuses to start on
a hosted database whose migrations are behind. Any other branch that adds a migration after this one must be
renumbered `0006`.

## After that: `claude/cefro-part-2-tasks-yfr6x5` (content only, no migration)

Cut from `dashboard-real-data`, so it comes after it, merge commit. Contains: six new Part 2 tasks (An important
decision, A goal you set, Working in a team, Trying and failing, A tradition, A happy day), each with an original
picture in `public/tasks/`, alt text, source and licence, and examiner guidance in the same shape as "Advice from
someone". New tasks start at version 1. All 7 pictures (advice included) are now "© 2026 CEFRO. All rights reserved."
instead of CC0 1.0, so "Advice from someone" is version 3 (new attempts get a new snapshot; old attempts keep v2). The
dashboard's Part 2 tile now opens the Part 2 task list (`/#part-2`) instead of one task. Two anchor answers per new
task (band 4 and band 1, `test/evaluation-samples/part2-new-task-anchors.ts`), **not yet live-tested**. Tests: `src/content/speaking/part2-tasks.test.ts`;
the dashboard and History tests now also run on all 7 tasks. Two browser tests now open "Advice from someone" by name
(the task list has 7 "Start practice" links), and the dashboard browser test expects Practise next to move on to
"An important decision" after the first answer.

## After that: `claude/review-dashboard-real-data-4jikaa` (dashboard fixes, no migration)

Cut from `cefro-part-2-tasks-yfr6x5`, so it comes after it, merge commit. Fixes from the dashboard review:

- **Exam date:** after Skip, a small "Add exam date" in the countdown's place opens the picker; Edit has "Remove date"
  (`PUT /api/account/exam-date { remove: true }`: clears the date, back to "Add exam date"). Edit, Skip, Cancel, Add
  exam date and Remove date have a 36 px tap area. No new column: Remove reuses `exam_date_skipped_at`.
- **Part tiles:** 1.1, 1.2 and 3 have no task, so no "Start" link: "Coming soon". Part 2 unchanged. (The first commit
  used `examPart*` flags; the follow-up replaced them with `PART_LIVE`, below.)
- **Attempts, none scored:** no first-visit screen any more; "Welcome back", the black "Start practice", and Recent
  attempts. Level and skills still wait for a scored answer.
- **Practise next:** the retry goal is shown in full (no line clamp).
- **Tests:** unit (`sections.test.ts`, more in `progress.test.ts` and `cross-user.test.ts`) and browser (Add exam date
  / Remove date, passed date, not scored yet, "Still in", a 390 px audit on every state). `playwright.config.ts`
  now shares its run id with the test workers (`E2E_RUN_ID`), so `e2e/db.ts` can set the two states the app refuses
  to create (a passed exam date, a failed attempt) in the run's throwaway database.
- **Screenshots** retaken from the real app; two new states (`not-scored-yet`, `exam-skipped`).
- **Follow-up commit:** the exam-date controls are disabled until the page is ready (a date picked on a slow
  connection was lost; browser test with delayed scripts); parts are live or not (`PART_LIVE`: Part 2 live, the
  others "Coming soon", all four tiles always shown; replaces the `examPart*` flags); `e2e/db.ts` refuses anything
  but the run's own test database; the screenshot script is in `scripts/screenshots/dashboard.mjs` (mock providers only).

## After that: `claude/mock-mode-vercel-preview-8uzlim` (mock mode everywhere, no migration)

Cut from `review-dashboard-real-data-4jikaa`, so it comes after it, merge commit. Contains:

- **Mock mode on every page (`?mock=1`):** the task list, dashboard and History join the practice and result pages.
  The dashboard and History show a demo student (`src/server/demo/demo-data.ts`: six attempts on five Part 2 tasks,
  one with no speech, a retry with its goal, an exam date), each result produced for its own task by the mock
  evaluator, in the real types, through the pages' real code. Mock mode never reads or writes the database (or cookies, the caller's identity, any
  API) and skips the configuration check, so it works on a Vercel Preview with no variables. Real pages keep refusing.
- **`?mock=1` stays on every link** inside mock mode (nav, back link, wordmark, task tiles, rows, filters, "Show more",
  Practise next, Start retry, Retry with this goal, Scoring… → result). Demo attempt ids are rewritten to their demo
  result (`/result?demo=<id>&mock=1`) and kept as the retry (`?mock=1&retry=<id>`). `src/proxy.ts` passes `?mock=1` to the
  `(site)` layout as the header `x-cefro-mock` (a layout gets no query).
- **Demo labels:** practice and task list "Demo mode. Your answer won't be scored."; results "Demo result. Your answer
  was not scored."; dashboard and History "Demo mode. These are example attempts, not yours." Never on real pages.
- **Mock-only behaviour:** the exam date changes only on the page (nothing sent); the demo Account menu has no sign-in
  or Log out (it used to call the real sign-out endpoint).
- **Config wording:** each provider variable names its own values (`TRANSCRIPTION_PROVIDER=openai or …=gemini`,
  `EVALUATION_PROVIDER=gemini or …=anthropic`).
- **"Used before the page is ready" fixes:** the sign-in and Create account buttons (a tap or Enter before the scripts
  ran sent the email and password in the address), and the brief's Start preparation / Practise without the goal (a
  tap did nothing). `useHydrated` moved to `components/ds`.
- **Tests:** `src/features/demo/*.test.ts` (demo data, links, every mock page rendered with the database, cookies and
  identity wired to throw, on a Preview-like configuration); `e2e/mock-mode.spec.ts` (the whole loop, no API call, no
  real page, 390 px audits) on `next dev` and, with `npm run test:e2e:preview`, on a production build started like a
  Preview with no variables (`playwright.preview.config.ts`); slow-connection tests in `auth.spec.ts` and
  `practice-flow.spec.ts`.
- `docs/DEPLOY_VERCEL.md`: the mock URLs that work on a Preview.
- **Follow-up commits:** demo results match their task (each task's demo answer through the real evaluation with the
  mock evaluator; the mock evaluator's tips and model answers made task-neutral; the demo data moved to
  `src/server/demo/`); the sign-in and register forms are `method="post"` as a second layer. Tests:
  `src/server/demo/demo-data.test.ts`, `src/features/account/AuthForm.test.ts`, and the browser tests check the task
  shown on each demo result and the form method.
- **Mock evaluator key words:** a mock-only list of key words per question for every task
  (`src/server/evaluation/mock-question-keywords.ts`, imported only by the mock evaluator), so a full demo answer
  counts 3 of 3 answered on every task ("Working in a team" used to score questions 1 and 2 as missing). Test:
  `src/server/evaluation/mock-evaluation-model.test.ts`.

## After that: `claude/lessons` (lessons in the app, no migration)

Cut from `mock-mode-vercel-preview-8uzlim`, so it comes after it, merge commit. It **merges in
`claude/wave1-lesson-drafts`** (step 11, and so step 10): merging it brings in the teaching plan and the lesson drafts
too, unchanged. Contains:

- **The three approved lessons** (L-T1, L-T8, L-T4 B2) in `src/content/lessons/`, word for word from
  `docs/lessons/drafts/`. The three files' Status / Reviewed by / Reviewed at now read approved, Asadbek, 2026-11-07
  (lesson text unchanged); a test checks the app agrees with each file.
  Only approved lessons are ever shown.
- **Result page:** Biggest fix has a quiet "Learn how" to the matching lesson; no link when no approved lesson matches.
  The `fixLesson` flag ("Lesson for this fix", Coming soon) is removed.
- **Lesson page** `/lessons/[slug]`: why → explanation → examples → self-check drill (record and listen back in the
  browser, checklist) → the black "Retry with this goal" (the same retry, goal carried over). Mock mode (`?demo=`,
  `?anchor=`) and real attempts (`?attempt=`, owner only).
- **Mock evaluator** (mock-only rules in `mock-answer-rules.ts`, imported only by the mock evaluator; tested): an answer whose every sentence talks about the picture is off topic; a question answered in one
  sentence of at most 6 words is `minimal`. Two new demo keys for the lesson demos (`picture.<task>`, `bare.<task>`,
  "Advice from someone" only). The demo student's attempts are unchanged.
- **Tests:** `src/content/lessons/lessons.test.ts`, `src/features/lessons/choose.test.ts` (including: lesson examples
  never use the retry task's topic, all 3 lessons × all 7 Part 2 tasks), more in `mock-pages.test.ts`,
  `view-model.test.ts` and `e2e/mock-mode.spec.ts`; `mock-answer-rules.test.ts`.
- **Drills:** the neutral drill sets in `docs/lessons/drill-drafts.md` (approved by Asadbek, 2026-11-07) replace the
  advice-based drills in all three lesson files and in the app (lesson version 2); the same drill for every retry task.

## After that: `claude/profile-settings` (Profile and Settings, no migration)

Cut from `claude/lessons`, so it comes after it, merge commit. **No database migration** (no `0006`): the name,
email, sign-up date and exam date columns already exist, and deletion only removes rows. Contains:

- **Profile** (`/profile`, from the person tab's new "Profile" menu item; the person tab is the grey current tab
  there): name (editable, `PUT /api/account/name`), email (shown only), the dashboard's exam-date editor and rules
  ("Not set · Add exam date", Edit, "Remove date"), the current level from the latest scored Part 2 answer ("No level
  yet" and "Go to Part 2" when there is none), member since, number of practice attempts.
- **Settings** (`/settings`, the gear tab, now a real link): Test your microphone (3 s, played back, never uploaded;
  a clear message when the microphone is blocked), Change password (`POST /api/account/password`: current password
  needed, other devices signed out, wrong passwords count like failed sign-ins; a POST form, disabled until the page
  is ready), Sign out, Delete my account (`POST /api/account/delete` with `DELETE` typed: attempts, results,
  recordings and their audio, transcripts, exam date, sessions, analytics events, the account and its merged anonymous
  identities; this browser is signed out).
- **Where audio is stored:** `recording_blobs` in the database on the hosted setup (Turso), files under
  `AUDIO_STORAGE_DIR` otherwise; deletion removes both kinds.
- **Mock mode:** `/profile?mock=1`, `/settings?mock=1`: the demo student, "Demo mode. Changes are not saved.", nothing
  sent; Change password and Delete my account show their screens and say nothing was changed.
- **Shared code touched:** the Account menu (a "Profile" item first in every state, `active` prop), `Menu`
  (`current`), the nav's Settings item (`built: true`), `DemoLabel` (`changes`), `isCrossSite` moved from the auth
  route to `server/http.ts` (same code), `e2e/db.ts` (`querySql`), `playwright.preview.config.ts` (also runs the new
  spec's mock tests).
- **Tests:** `src/app/api/account/account-routes.test.ts` (name, password, deletion table by table with audio on
  disk and in `recording_blobs`, another account untouched, pages show only the caller's data),
  `src/features/profile/view-model.test.ts`, `src/domain/account.test.ts`, more in `mock-pages.test.ts` and
  `features.test.ts`; `e2e/profile-settings.spec.ts`; `e2e/mock-mode.spec.ts` (390 px audit and Preview lists).
- `docs/privacy-todo.md`: what the under-18 consent work will need from these pages.
- **Follow-up (design change approved by Asadbek, 2026-11-07):** Profile and Settings merged into one **Account page**
  at `/profile`, opened directly by the Account tab (no menu); the gear tab is gone, so the navigation has 5 tabs
  (Home, Practice, Lessons, History, Account); `/settings` redirects to `/profile` (keeps `?mock=1`); Delete my account
  also needs the account's password; "Test your microphone" moved to the practice brief as the grey "Check
  microphone" above Start preparation. The `settings` feature flag is removed; the (site) header keeps its Account menu.
  Still no migration.
- **Follow-up 2:** the per-IP sign-in / sign-up limits now read the client address only from Vercel's `x-real-ip` on
  Vercel (a visitor's own `x-forwarded-for` is ignored); tests may set `x-forwarded-for` only in a test run (vitest, or
  the browser tests' server with `CEFRO_TEST_CLIENT_IP=1`, never a production build or Vercel); off Vercel outside tests
  every caller counts as one client (`src/server/auth/auth-limits.ts`, test `src/server/auth/client-ip.test.ts`).
  After "Delete my account" the browser is signed out and lands on `/?deleted=1`: "Your account and all your data were
  deleted." No new environment variable is needed on Vercel.

## Right after `claude/profile-settings`: `claude/teacher-plan-v7fp7j` (contains profile-settings code)

**This branch contains all of `claude/profile-settings`, app code included** (merged in, not just referenced). Merge
it **right after `claude/profile-settings`, never earlier**: merged before it, it would bring the Profile, Settings
and account-deletion code into `main` unreviewed. Merge commit, no squash. Its own commits change docs only:
`docs/teacher-plan.md` (Teacher view v1, final, approved by Asadbek 2026-11-07) and this entry. No migration (the plan
proposes `0006_teachers` for later).

## Right after `claude/teacher-plan-v7fp7j`: `claude/teacher-view-kd6wdk` (Teacher view v1, **adds migration `0006`**)

Cut from `claude/teacher-plan-v7fp7j` with the latest `claude/profile-settings` (`f01e5d4`) merged in (normal merge),
so it comes **after `claude/teacher-plan-v7fp7j`**, merge commit, no squash. Branch name: `claude/teacher-view-kd6wdk`
(19 characters after `claude/`).

**Migration `0006_teachers`:** four new tables (`classes`, `class_members`, `teacher_ratings`, `rating_pairs`) and
one column, `users.role` (`'student'` by default, NOT NULL). Additive only: no table is rebuilt and no row changes. Its `-- cefro:reviewed` line for the new unique indexes (on
tables this migration creates) was approved by Asadbek, 2026-11-07.
**Run `npm run db:migrate` against the hosted database when this branch is merged (before, or as, it is deployed):**
the app refuses to start on a hosted database whose migrations are behind. Teachers are made only with
`node scripts/set-role.mjs <email> teacher` (no API sets a role).

Contains (docs/teacher-plan.md, built as written; see "Not followed" below):

- **Release switch:** `TEACHER_LIVE = false` (`src/config/features.ts`). Every real teacher page and API, and the
  student's Join / Share / Leave, answer 404 until parent consent for under-18s exists. Mock mode works either way.
- **Mock mode:** the demo teacher (`/dashboard?mock=1&as=teacher`), Demo class (code `DEMO42`) and six made-up
  students (`src/server/demo/demo-teacher.ts`: hand-written answers through the real evaluation with the mock
  evaluator). Teacher screens T1–T5 and a read-only lesson; the student's Join (S1) → Share (S2) → Account page "Your
  classes" (S3) → Leave. Nothing is sent; every link keeps `?mock=1` (the demo teacher's also `as=teacher`).
- **Server side, tested:** `src/server/teacher/` (one access check `teacherCanSee`, classes, codes, shares, ratings,
  Leave / Remove / Close turning ratings into id-free `rating_pairs` in one transaction), API routes under
  `src/app/api/teacher/` and `src/app/api/classes/`, account deletion of class links and ratings (both roles).
  Teachers never receive emails, account names, recordings or exam dates (tested). 10 wrong join codes per account per
  hour.
- **Sign-in / sign-up limits for classrooms** (one shared IP): sign-up 30 per hour per client IP (was 10), 300 in
  total (was 100). Wrong passwords (sign-in, Change password and Delete my account share one counter per account):
  5 per 15 min per account **and** client IP, and 20 per 15 min per account from any IP, so a classmate failing on
  purpose from their own phone can't lock the owner out elsewhere (on the same Wi-Fi they share an IP, so it is locked
  there for 15 minutes); sign-in also 100 failures per 15 min per IP (was 30). The auth library's own per-minute limit
  is raised to 120 sign-ins / 60 sign-ups per IP. Before this branch, Change password and Delete my account counted
  wrong passwords under a different key from sign-in. The trusted-IP rule from `claude/profile-settings` is unchanged.
  Tests: `src/server/auth/classroom-limits.test.ts`.
- **Delete my account list:** with `TEACHER_LIVE` on, it also lists "Your classes and teacher ratings"
  (`deletedItems` in `src/domain/account.ts`); off, it is unchanged. Tested in both states.
- **Shared code touched:** `ScoredResult` (`teacher` read-only mode), `AppShell` / `BackLink` / `Wordmark` /
  `AccountTab` (`back`, `href`, `demoTeacher`), `PractiseNextCard` / `FindYourLevelCard` (`quiet`), `LessonView`
  (`TeacherLessonView`), `DemoLabel` (`class`), icon `plus`, `demo-data.ts` (`evaluateDemoAnswer`),
  `delete-account.ts`, `auth.ts`, `auth-limits.ts`, `env.ts`, the dashboard and Account pages.
- **Tests:** `src/app/api/teacher/teacher-routes.test.ts`, `src/features/teacher/*.test.ts`,
  `src/server/auth/classroom-limits.test.ts`, more in `account-routes.test.ts` and `migrations.test.ts`;
  `e2e/teacher-view.spec.ts` (also in `playwright.preview.config.ts`).
- **Not followed exactly:** (1) teacher account deletion deletes the classes and memberships, as the plan says, so
  students then simply no longer see the class (the plan also says they see "You're no longer in this class"; both
  can't hold once the rows are gone). (2) The Leave confirm card's "Leave class" is grey, not black: a destructive
  action is never black, and the Account page keeps its own black button.

## Right after `claude/teacher-view-kd6wdk`: `claude/entry-pages` (signed-out pages, no migration)

Cut from `claude/teacher-view-kd6wdk` (`ee7b793`), so it comes **after it**, merge commit, no squash. Branch name:
`claude/entry-pages` (11 characters after `claude/`): **this is the real branch**; all its work is committed here.
No database migration, no new environment variable.
Preview (mock pages only, no variables): `https://cefro-app-mgm6-git-claude-entry-pages-crm-b915.vercel.app/?mock=1`.
Vercel builds a commit once: push a new commit to `claude/entry-pages` first, or its Preview address does not exist.

Contains (docs/design-system.md, "Signed-out pages"):

- **Home, sign in, Create account on the design system only** (`components/ds` and tokens; new route group
  `src/app/(entry)/`, `src/features/entry/`). No header menu, no navigation tabs. Home: "Practise the multilevel
  speaking exam", the example feedback card, the black "Create account", the grey "Try the demo"
  (`/dashboard?mock=1`), "Have an account? Sign in". Sign in and Create account as specified; Create account now asks
  for a name (optional: empty = no name; see the follow-up below).
- **`/` is now the signed-out home; the task list moved to `/practice`** (decided with the owner, 2026-11-07). A
  signed-in visitor on `/` goes to `/dashboard`. The Practice tab, the dashboard's top-bar link and Part 2 tile
  (`/practice#part-2`), the Account page's "Go to Part 2" and the task pages' current tab follow. `/?mock=1` is the
  signed-out home in mock mode (it used to be the task list: now `/practice?mock=1`). `?deleted=1` stays on `/`.
- **Unchanged:** POST forms disabled until the page is ready, the API's rate limits and trusted-IP rule (not
  touched), `?next=` after sign-in, the configuration check on these pages (now in the `(entry)` layout).
- **Design system:** token `--text-heading` (28/36 px); components `TextField`, `Notice`, `WordmarkLink`;
  `PillAction` takes `type="submit"`; `DemoLabel variant="entry"`.
- **Shared code touched:** `AuthForm`, `current-user.ts` (`isSignedIn`), `NAV_ITEMS`, `examPartListHref`,
  `PART2_HREF`, `AppShell` (default current tab), the dashboard's `Wordmark` and top-bar link, the `(site)` layout's
  logo, `playwright.preview.config.ts` (also runs the new spec).
- **Tests:** `src/features/entry/entry-pages.test.ts`, more in `mock-pages.test.ts` and `deleted.test.ts`;
  `e2e/entry-pages.spec.ts` (390 px audits with AA contrast, real and mock). Updated for the new addresses:
  `auth.spec.ts` (Journey A starts at `/practice`; on the sign-in pages, which have no Account menu, the signed-in
  state is read from `/api/account/me`; after Create account the browser lands on `/dashboard`), `practice-flow`,
  `dashboard`, `profile-settings` and `mock-mode` specs, and the dashboard unit tests.

**Follow-up on `claude/entry-pages` (privacy and names, no migration):**

- **A name is never built from the email.** Sign-up with Name empty stores no name (`users.name` null); the Account
  menu says "Your account", the Account page "Not set". Accounts the old form named after their email (the name equals
  the email's local part, any case) count as having no name everywhere (`accountDisplayName` in `domain/account.ts`;
  no row is changed). A teacher's name shown to students follows the same rule.
- **"Name your teacher sees"** is prefilled only from a typed account name, so for these accounts it starts empty and
  must be typed. Share refuses a shown name that is the student's email, its local part (or a long handle inside it)
  or its domain; a share stored before this rule with such a name is shown to the teacher as "Student".
- **Server-side name check** (sign-up in `api/auth/[...all]`, `PUT /api/account/name`, Share): trimmed, 1–50
  characters (Share: 1–30, as in the teacher plan), not an email address ("Use your name, not an email address.",
  400 `invalid_name` / `invalid_shown_name`).
- **Links:** no page links to `/` for the task list any more; it is `/practice` (keeping `?mock=1`) on the dashboard,
  History, practice, result, lesson, Account and teacher pages. Result, Retry with this goal and lessons open a task's
  brief (`/practice/speaking/<task>`), unchanged.
- **Tests:** `src/app/api/teacher/email-privacy.test.ts` (no part of a student's email in any teacher API response or
  teacher page, or on the Share screen; legacy names; sign-up and Account name rules), more in `domain/account.test.ts`,
  `features/teacher/view-model.test.ts`, `mock-pages.test.ts` and `teacher-pages.test.ts` (no link to `/`, `/practice`
  keeps `?mock=1`); `e2e/entry-pages.spec.ts` (email as name refused, empty name stored as none). `test/auth-helpers.ts`
  `signUp` now sends the name as the form does (empty unless given).

## Right after `claude/entry-pages`: `claude/landing` (signed-out pages redesign, no migration)

Cut from `claude/entry-pages` (`96395d2`), so it comes **after it**, merge commit, no squash. Branch name:
`claude/landing` (7 characters after `claude/`). No database migration, no new environment variable.
Preview (mock pages only, no variables): `https://cefro-app-mgm6-git-claude-landing-crm-b915.vercel.app/?mock=1`.

Contains (docs/design-system.md, "Signed-out pages"; docs/growth-plan.md, phase 1):

- **Home redesign, for the whole exam:** top row with a small grey "Sign in"; "UZBMB multilevel speaking", "Know
  exactly what to fix before your speaking exam", the black "Start practising" (`/register`), the grey "See a demo
  result" (`/result?demo=demo-5&mock=1`); three steps with icons; the "Example feedback" card is gone. A small
  exam-parts list read from `PART_LIVE` ("Part 1 · A1–B1", "Part 2 · B2", "Part 3 · C1": Open / Coming soon; "All
  three parts are open." when all are live).
- **Create account:** "Save your results", email and password only (the name field is gone; the name is set on the
  Account page). **Sign in:** "Welcome back".
- **Unchanged:** POST forms disabled until the page is ready, the API's rate limits and trusted-IP rule, `?next=`,
  mock mode, the "account deleted" message, the server's sign-up name rules.
- **Shared code touched:** `AuthForm` (no name field; sends an empty name), `EntryFrame` (`headerEnd`,
  `EntryHeaderLink`), `Icon` (new `quote` glyph).
- **New doc:** `docs/growth-plan.md` (phases 1–4).
- **Tests:** `src/features/entry/entry-pages.test.ts` (rewritten for the new pages; the exam-parts list with the
  switches in each state), `mock-pages.test.ts` (home's demo link), `e2e/entry-pages.spec.ts` (390 px audits, demo
  link, the list follows `PART_LIVE`, no name at sign-up, the server's name rule).

## Right after `claude/landing`: `claude/integration-chgcwb` (docs only, no migration)

Cut from `claude/landing` (`b528b15`), so it comes **after it**, merge commit, no squash. One commit, docs only:
`docs/launch-checklist.md` (the checks run on the whole chain, the merge commands, migration, live-check, deploy and
rollback steps). No app code, no migration, no new environment variable.

## Right after `claude/integration-chgcwb`: `claude/launch-cleanup` (no migration)

Cut from `claude/integration-chgcwb` (`ced5367`), so it comes **after it**, merge commit, no squash. Branch name:
`claude/launch-cleanup` (14 characters after `claude/`). No database migration, no new environment variable.
Preview (mock pages only, no variables): `https://cefro-app-mgm6-git-claude-launch-cleanup-crm-b915.vercel.app/dashboard?mock=1`.
Contents: see the commits on the branch and `docs/launch-checklist.md` ("Coming soon / mock-only", live check).

## Right after `claude/launch-cleanup`: `claude/project-thread-krzvuk` (Part 1.1 and 1.2, not live, no migration)

**This is the Part 1 branch to merge.** It is `claude/part1` (`4177904`) with `claude/launch-cleanup` (`2880d95`)
merged in, so it comes **after `claude/launch-cleanup`**, merge commit, no squash. It brings `claude/part1`, steps 7
(`claude/part1-plan`) and 12 (`claude/part1-player`) with it: do not merge those three separately. Branch name:
`claude/project-thread-krzvuk` (21 characters after `claude/`; the preview host name is still under Vercel's limit).
No database migration, no new environment variable, no evaluator version bump.
Preview (mock pages only, no variables):
`https://cefro-app-mgm6-git-claude-project-thread-krzvuk-crm-b915.vercel.app/practice/speaking/a2-part1-1-daily-life?mock=1`
and `…/practice/speaking/b1-part1-2-shopping?mock=1`.

Added on this branch, on top of `claude/part1`:

- **Merge of `claude/launch-cleanup`:** two text conflicts (this file, `playwright.preview.config.ts`: both new
  browser tests kept). `launch-cleanup` deleted the chime `.wav`, so **Part 1 now plays the same code-made two-tone
  chime as Part 2** (`lib/chime.ts`, primed by the Start tap). The `chime` field is gone from the Part 1 content.
- **Real spoken questions (decision 16), replacing the placeholder tones:** pre-generated offline with Piper, voice
  `en-us-libritts-high` speaker 6426 (LibriTTS, **CC BY 4.0**, credited in `public/audio/speaking/part1/README.md`),
  slowed to 0.75 tempo for B1 learners. Texts, paths, voice and settings: `src/content/speaking/part1/question-audio.json`;
  regenerate with `scripts/make-part1-question-audio.mjs`. Files are versioned with the task
  (`/audio/speaking/part1/<task>/v<version>/q<n>.wav`). A unit test fails if a question's wording changes without new
  audio. **Owner: listen to the six files before launch** (nobody has listened to them yet).
- **Exam timing (owner, 2026-11-08):** 5 s to get ready before each Part 1.1 answer; 10 s before Question 4 and 5 s
  before Questions 5–6 in Part 1.2 (countdown "to get ready", not recorded). A spoken introduction per part (own
  wording) with a sample chime; a chime at the end of each answer. The Part 1 prompt now says the student had a few
  seconds to get ready (Part 1 prompt only; Part 2's prompt is unchanged).

What `claude/part1` itself contains:

Contains (docs/part1-plan.md, built as written; see "Not followed" below):

- **The one rebase of step 12 is done here:** `CountdownRing.tsx` restored (the dev page `/dev/part1-player` uses it).
- **Release switch unchanged:** `PART_LIVE["1.1"]` and `["1.2"]` stay `false`. The real practice pages of Part 1 tasks
  are 404 and the API refuses Part 1 uploads (`task_not_found`); the task list, dashboard tiles ("Coming soon"), home
  and the demo student don't show Part 1. Only mock mode (`?mock=1`) opens them.
- **Scoring generalised per rubric** (plan §3): each rubric declares its four `levels`, its `features`, its
  `question_statuses`, `first_question_number` and `min_relevant_words` (all defaulting to Part 2's, so
  `multilevel_q7.json` is unchanged and stored Part 2 results parse as before). `band-scoring.ts` works on the index of
  the rubric's ladder; the zero reason for the bottom level is `below_B1` / `below_A2` / `below_A1`.
- **Rubrics** `multilevel-q1-3/1.0.0` (target A2, no cohesion, statuses on_topic / missing / off_topic, no word floor)
  and `multilevel-q4-6/1.0.0` (target B1, partial counts, at least 5 relevant words), official text verbatim; reference
  texts marked as reference (decision 11).
- **Prompt:** a Part 1 prompt of its own (`prompts/multilevel-part1-evaluation.ts`) and a Part 1 audio prompt, built
  only from the rubric (no literal level names). **Part 2's prompt, provider schema and prompt hash are byte-for-byte
  unchanged** (pinned by `part1-prompt.test.ts` and `test/fixtures/q7-model-output-schema.json`).
- **Quality gate:** rejects a status, level or feature outside the draft's rubric (e.g. `partial` / `minimal` or
  cohesion in Part 1.1); "strength below the rubric's target" (code `strength_below_target`, was `strength_below_b2`).
- **Content:** `a2-part1-1-daily-life` (`short_answers`) and `b1-part1-2-shopping` (`picture_questions`) are now
  `SpeakingTask`s with `delivery` (timed questions, chime, audio source) and, for 1.2, two original pictures with
  `src`, `alt`, `author`, `sourceUrl`, `licence`, `retrievedAt` (`public/tasks/part1/`, listed in `public/tasks/README.md`).
  `listSpeakingTasks()` stays Part 2 only; `getSpeakingTask()` finds Part 1 too.
- **Practice flow on the design system** (`Part1Experience`, `part1-screens.tsx`, hook `useQuestionSequence` shared
  with the dev player): introduction (black "Start"), then each question with its text and audio → chime → countdown
  → next, **recorder paused during the question audio and the chime** (one file); Part 1.2's pictures from Question 4 to
  the end. Retry goal on every screen. Mock mode: nothing sent, then the demo Scoring… and result.
- **Offsets:** the upload sends `questionOffsetsMs`; the attempt keeps them in its `metrics` JSON until transcription
  adds the speech metrics and `questionSeconds` (no migration). Part 1.1 needs only 1 recognised word.
- **Result page in the Part 2 style:** "Part 1.1 · Band 3 · Lower A2", questions numbered as the student saw them
  (4–6 in Part 1.2), only the part's own skills, Question 4's hint "compare the two pictures" word for word.
- **Mock evaluator:** Part 1 rules in `server/evaluation/mock-part1-rules.ts` (imported only by the mock evaluator).
  Demo answers per Part 1 task in `features/demo/demo-answers.ts` (`answer.<task>`, `retry.<task>.<key>`).
- **Analytics:** new client event `question_audio_failed`.
- **Tests:** `part1-content.test.ts`, `rubrics/part1-rubrics.test.ts` (rubric text vs the plan's §2 tables),
  `test/evaluation-samples/part1-anchors.{ts,test.ts}` (six made-up anchors, test-only, and the §4 edge cases),
  `evaluation/part1-prompt.test.ts`, `attempts/part1-pipeline.test.ts`, `result/part1-view-model.test.ts`;
  `e2e/part1-practice.spec.ts` (also in `playwright.preview.config.ts`).
- **Not followed exactly:** (1) the plan's order of work (§6: after Part 2 is merged and live-tested, from `main`, in
  three PRs) — built in one branch from the integration branch, as asked. (2) Part 2's prompt was **not** rewritten to
  read from the rubric (§3 item 5) and `EVALUATOR_VERSION` was **not** bumped (item 8): Part 1 has its own prompt so
  Part 2's behaviour stays identical without a live re-run (no model calls allowed). (3) Question audio was placeholder tones on `claude/part1`; fixed
  on `claude/project-thread-krzvuk` (see above). (4) Live calibration on
  the anchors (§6 step 5) not run (no model calls). (5) The questions are not listed on the introduction screen (the
  exam reads them one at a time).

## Right after `claude/project-thread-krzvuk`: `claude/project-thread-mz2ndw` (Part 3 mock mode; Part 2 and 3 exam intros; no migration)

**This is the Part 3 branch to merge.** It is `claude/project-thread-krzvuk` (`5e57819`, the Part 1 branch) with
`claude/part3` (`15096a4`, described in the next section) merged in, so it comes **after `claude/project-thread-krzvuk`**,
merge commit, no squash. It brings `claude/part3` and steps 8 (`claude/lucid-euler-460531`) and 9
(`claude/sleepy-hypatia-rp7db1`) with it: do not merge those three separately. Branch name:
`claude/project-thread-mz2ndw` (21 characters after `claude/`, the name this session was given; the preview host name
is 56 characters, under Vercel's 63, so it is not shortened). No database migration, no new environment variable, no
evaluator version bump, no model call. `PART_LIVE["3"]` stays `false`.
Preview (mock pages only, no variables):
`https://cefro-app-mgm6-git-claude-project-thread-mz2ndw-crm-b915.vercel.app/practice/part3?mock=1`.

Added on this branch, on top of `claude/part3`:

- **Merge:** two text conflicts (this file, `playwright.preview.config.ts`: both browser tests kept). One type error
  from `claude/launch-cleanup` fixed: the Part 3 result page no longer passes `flags` to `ScoringResult`.
- **Exam-style flow (owner feedback, 2026-11-08), Part 2 and Part 3:** brief → **spoken introduction on its own
  screen** ("Listen", "Part 2" / "Part 3", what happens and the timings, "Start speaking when you hear this sound"; our
  own wording, text on screen too) → **chime** → the task with the **1:00 preparation countdown** → **chime** → **2:00
  speaking** → **chime when time is up** (after the recorder stops). The chimes and the introduction are never
  recorded; a missing or blocked file never stops the part. **Part 2 changes too** (the real flow, not only mock mode):
  the brief's "Start preparation" now plays the introduction first; the button label is unchanged.
- **Voice:** one introduction per part (`public/audio/speaking/part2/intro/v1/intro.wav` about 15 s,
  `public/audio/speaking/part3/intro/v1/intro.wav` about 21 s), made offline with **the same Piper voice and settings
  as Part 1** (speaker 6426, tempo 0.75; LibriTTS CC BY 4.0, credited in `public/audio/speaking/part3/README.md`).
  Texts: `src/content/speaking/part-intro-audio.json`; `scripts/make-part1-question-audio.mjs` now reads both
  manifests (`ONLY=/intro/v1/` for these two). A unit test fails if the voice block differs from Part 1's.
  **Owner: listen to the two files before launch.**
- **`?timeScale`** (mock mode, browser tests only) shortens preparation and speaking time, as on Part 1.
- **Tests:** `src/features/part3/part3.test.ts` (introduction texts, audio files, voice, screen),
  `practice-machine.test.ts` (the intro phase), `e2e/part3.spec.ts` (both real introductions; a Part 3 run where
  preparation and recording run out by themselves). Other browser specs serve a 0.2 s silent file for the
  introductions (`e2e/short-intro.ts`).

## Right after `claude/practice-list`: `claude/project-thread-e59hcb` (all four parts on the task list, no migration)

It is `claude/practice-list` plus the owner's feedback on the task list (2026-11-10). Merge commit, no squash. (Branch
name set by the session: 21 characters after `claude/`, one over the rule; the Preview address is still under
Vercel's limit and not shortened.) Preview (mock mode):
`https://cefro-app-mgm6-git-claude-project-thread-e59hcb-crm-b915.vercel.app/practice?mock=1`.

- `/practice` shows **all four parts in exam order** (1.1, 1.2, 2, 3). Parts that are not live (`PART_LIVE`) say
  "Coming soon": no task rows on the real page, their mock pages in mock mode. `PART_LIVE` is unchanged.
- The timing is said **once per part** under its title ("1 min to prepare · 2 min to speak"; Part 1 "3 questions ·
  30 s each" / "45 s for the first, 30 s for the others"), not on every row.
- One grey tag from the student's own history: "Start here" (no attempts yet) or "Try next" on the task the
  dashboard's Practise next picks; "Practised dd.mm.yy" under practised tasks.
- SAMPLE "Often / Sometimes / Rarely asked" labels, sorted often → rarely, **only with `?mock=1&freq=1`**, each card
  saying they are made up (`features/task-list/sample-frequency.ts`). For the owner to judge the idea; there is no
  real exam data, so they never show on the real site. Delete the file or replace it with real data before use. `PractiseNext` gains `taskId`.
  The real page now reads the caller's attempts (`findCurrentUserId`, `listAttemptHistory`, like the dashboard);
  mock mode uses the demo student and reads nothing.
- Tests: `part2-tasks.test.ts` (order, timing once, Coming soon, mock links, tags), `e2e/no-dead-controls.spec.ts`
  (the task list's "Coming soon" line is allowed, like the part tiles).

## Right after `claude/p2-read-qs`: `claude/practice-list` (task list restyle, no migration)

It is `claude/p2-read-qs` plus the task list (`/practice`) on the design system. Merge commit, no squash. Branch
name: 13 characters after `claude/`. Preview (mock mode):
`https://cefro-app-mgm6-git-claude-practice-list-crm-b915.vercel.app/practice?mock=1`.

- `/practice` moved from `src/app/(site)/practice/page.tsx` to `src/app/practice/page.tsx` (same URL) and now uses
  the app frame (`AppShell`), like Lessons and History. One card per part with tasks, one row per task, no black
  button. See docs/design-system.md, "Task list".
- The `(site)` layout (its old header) and the `AccountMenu` it used are deleted, with the unused `components/ui/Badge`.
  The configuration check now runs in the page itself (mock mode still skips it).
- Tests: `part2-tasks.test.ts`, `mock-pages.test.ts`, `e2e/mock-mode.spec.ts` (390 px audit now includes
  `/practice?mock=1`), `e2e/auth.spec.ts` Journey A (reads the Account tab and Account page, not the old menu).

## Right after `claude/consent-pilot`: `claude/p2-read-qs` (Part 2 questions read aloud, no migration)

It is `claude/consent-pilot` plus one change from the owner's feedback on the real exam (2026-11-09). Merge commit, no
squash. Branch name: 11 characters after `claude/`. Preview (mock mode, sound on):
`https://cefro-app-mgm6-git-claude-p2-read-qs-crm-b915.vercel.app/practice/speaking/b2-part2-happy-day?mock=1`.

- **Part 2 order is now:** brief → spoken introduction on its own screen → **chime** → **the examiner reads the task
  aloud** (the task line, e.g. "Describe a very happy day in your life.", then the three questions; not "Answer the
  three questions below" or "Look at the photograph") with the task on screen and a "Listen" card, **no countdown and
  no button** → only when the reading ends, the **1:00 preparation countdown** → chime → 2:00 speaking → chime. A
  missing or blocked file never stops the part (its watchdog settles it; the questions are on screen). The
  introduction screen now says "After the chime, you will hear the questions. Then the minute of preparation starts
  by itself." **Part 3 is unchanged** (introduction, chime, then the timer: the owner confirmed it matches the exam).
- **Audio:** one file per task version, `public/audio/speaking/part2/<task id>/v<version>/questions.wav` (12–19 s),
  made offline with the same Piper voice and settings as Part 1 and the introductions. Texts:
  `src/content/speaking/part2-question-audio.json`, built from each task's own wording
  (`part2SpokenQuestions` in `src/content/speaking/part2-question-audio.ts`); `scripts/make-part1-question-audio.mjs`
  reads it too (`ONLY=questions.wav` remakes only these). A unit test fails when a question's wording changes until
  its audio is made again. **Owner: listen to the seven files before launch.**
- **Tests:** `part2-tasks.test.ts` (texts match the screen, files exist, same voice, the listening screen),
  `practice-machine.test.ts` (the new `questions` phase), `e2e/part3.spec.ts` (the real introduction and real
  questions, then the countdown), `e2e/practice-flow.spec.ts` (sound files in order). Other browser specs serve a
  0.2 s silent file for the questions too (`e2e/short-intro.ts`).

## Right after `claude/project-thread-mz2ndw`: `claude/consent-pilot` (pilot consent and 30-day audio deletion, migration 0007)

**This is the consent branch to merge.** It is `claude/project-thread-mz2ndw` (`e5c3a38`) with `claude/pilot-consent`
(`d793c7e`, which contains the docs of `claude/consent-plan-j0ky8m`) merged in, plus the finishing work below. Merge
commit, no squash. Do **not** merge `claude/pilot-consent` or `claude/consent-plan-j0ky8m` on their own. Branch name:
13 characters after `claude/`. **One database migration, `0007_pilot_consent`** (additive; never applied anywhere yet)
and **two new Production variables**, `CONSENT_REQUIRED` and `CRON_SECRET`: see `docs/launch-checklist.md`, section 11.
`vercel.json` gains a daily cron. Previews (mock pages only, no variables):
`https://cefro-app-mgm6-git-claude-consent-pilot-crm-b915.vercel.app/practice/speaking/b2-part2-happy-day?mock=1&consent=waiting`
and `…/profile?mock=1&consent=granted`.

- **Merge of `claude/pilot-consent`:** conflicts in this file, `playwright.preview.config.ts` (both test lists kept) and
  the practice page (the lock now also reaches the Part 1 flow, which `pilot-consent` did not know about).
- **From `claude/pilot-consent`:** the `CONSENT_REQUIRED` lock on the upload and scoring routes (guests never record),
  the locked practice brief, teacher sharing behind `--teacher-sharing`, `scripts/set-consent.mjs`, the daily
  audio-retention job (`/api/cron/audio-retention`, `CRON_SECRET`), "Recording deleted on …" on the result page.
- **Added here:** `consent_notice_version` (which text was agreed; the script stores it); `scripts/delete-account.mjs`
  (the owner deletes an account on a parent's request; a test requires it to match "Delete my account" table by
  table); the Account page's read-only "Recording consent" section; the Part 1 brief lock; audio of attempts stuck
  before scoring is deleted after 30 days too; a test that no code stores audio at a provider; docs updated
  (`consent-design.md` 2b, `pilot-parent-message.md` no "free", `lawyer-questions.md`, `privacy-todo.md`,
  `launch-checklist.md` section 11).
- **Still open:** the parent message is not sent (native check of Uzbek and Russian; lawyer question 1 on data
  location). Part 3 has no real recording yet; when it goes live it needs the same lock.

## Merged through `claude/project-thread-mz2ndw`: `claude/part3` (Part 3 in mock mode, no migration)

Do not merge this branch on its own: merge `claude/project-thread-mz2ndw` (above), which contains it.


Cut from `claude/integration-chgcwb` (`ced5367`, which holds the chain up to `claude/landing` and the launch checklist),
with `claude/lucid-euler-460531` (step 8, the Part 3 plan) and `claude/sleepy-hypatia-rp7db1` (step 9, the overlap
module) merged in (normal merges). So it comes **after `claude/landing` and after steps 8 and 9**, merge commit, no
squash; merging it also brings in 8 and 9 unchanged. Branch name: `claude/part3` (5 characters after `claude/`).
No database migration, no new environment variable, no model call.
Preview (mock pages only, no variables): `https://cefro-app-mgm6-git-claude-part3-crm-b915.vercel.app/practice/part3?mock=1`.

Contains (docs/part3-plan.md, built in mock mode; docs/design-system.md, "Part 3 (mock mode only)"):

- **Release switch unchanged:** `PART_LIVE["3"]` stays `false`, so the dashboard tile and the home page keep "Coming
  soon". Every Part 3 page is a 404 without `?mock=1` (also when the switch is on: there is no real Part 3 flow yet).
- **Content:** the three v1 topics with CEFRO's own FOR / AGAINST lists (`src/content/speaking/c1/`, registry
  `src/content/speaking/part3.ts`, separate from the Part 2 registry): cars in city centres, smartphones under 14, a
  tax on sugary drinks and fast food. Task type `BalancedArgumentTask` (`src/domain/speaking/argument-task.ts`).
- **Rubric and scoring:** `src/server/evaluation/rubrics/multilevel_q8.json` (bands 0–6, target band 5 = C1, C1
  descriptors from Question 8, B2 / B1 / below-B1 reused verbatim from Question 7, coverage / dependence / language
  caps, the band-6 gate on grammar AND vocabulary, the overlap thresholds); `src/domain/evaluation/q8/` (C1 ladder,
  model-output schema with the point judgements, deterministic scorer, stored result `kind: "multilevel_q8"`, retry
  goals).
- **Evaluator pipeline:** `src/server/evaluation/argument-evaluator.ts` (schema → Part 3 quality gate → one
  regeneration → prompt overlap → dependence decision → band → goals), the Part 3 prompt (written, **not live-tested**),
  the Part 3 mock evaluator and its mock-only rules (`mock-argument-model.ts`, `mock-argument-rules.ts`).
- **Mock demo:** `/practice/part3?mock=1` → brief → preparation (tick 2 + 2 points in the minute) → recording → Scoring…
  → `/result/part3?demo=<key>&mock=1` → Retry with this goal. Made-up demo answers that follow the points chosen
  (`src/features/demo/part3-demo-answers.ts`) go through the real Part 3 evaluation with the mock evaluator.
- **Anchors (test-only):** `test/evaluation-samples/part3-anchors.ts`: topic 1 from the plan, topics 2 and 3 made up
  (A0–A5 and R1 each), with their measured overlap recorded in docs/part3-plan.md.
- **Shared code touched (small):** `retryReviewSchema` exported from `multilevel/model-output.ts`; `BandMeter`
  exported from `features/result/sections.tsx`; `Countdown` and `LevelMeter` exported from the Part 2 practice
  screens; `playwright.preview.config.ts` also runs `e2e/part3.spec.ts`. No Part 2 behaviour changes.
- **Tests:** `src/domain/evaluation/q8/band-scoring.test.ts`, `test/evaluation-samples/part3-anchors.test.ts`,
  `src/server/evaluation/argument-evaluator.test.ts`, `src/features/part3/part3.test.ts`, `e2e/part3.spec.ts`.
- **Not followed from the plan:** see "Part 3: what the plan says and this branch does not do yet" in
  docs/part3-plan.md.
## After `claude/integration-chgcwb`: `claude/consent-plan-j0ky8m` (docs only)

Cut from `claude/integration-chgcwb` (`ced5367`), so it comes **after it** (or, like it, copy the docs instead of
merging), merge commit, no squash. Branch name: 19 characters after `claude/`. **Documents only**: no app code, no
migration, no environment variable. Contains: `docs/consent-design.md` (under-18 consent design, decisions of
2026-11-08, pilot route), `docs/privacy-notice-draft.md` and `docs/terms-draft.md` (drafts for a lawyer, `[CHECK]`
marks), `docs/lawyer-questions.md`, `docs/pilot-parent-message.md`, a change to `docs/growth-plan.md` phase 2
(guests don't record), and this entry.

## Duplicate: `claude/entry-pages-jgh558` (never merge)

claude/entry-pages-jgh558: duplicate, never merge. (It holds the first two commits of `claude/entry-pages` and is
not updated any more.)

## Duplicate: `claude/lessons-adi79w` (never merge)

claude/lessons-adi79w: duplicate of claude/lessons, never merge.

## Preview alias: `claude/mock` (never merge)

`claude/mock` is **only a short alias** for a Vercel Preview of `claude/mock-mode-vercel-preview-8uzlim`, created at
commit `6b77509` (no commits of its own), so Vercel gives it a short, predictable Preview URL (Vercel shortens long
branch names). **Never merge it, never base work on it, never open a PR from it.** Merge
`claude/mock-mode-vercel-preview-8uzlim` instead. It is not moved automatically: commits after `6b77509` (such as the
one adding this note) are not on it. Delete it once the Preview is no longer needed.

## Rule: short branch names

New branch names must be short: **at most 20 characters after `claude/`** (e.g. `claude/history-page` is 12), so
Vercel does not shorten them and Preview links stay predictable. Branches that already exist keep their names.

## Corrections to earlier notes

- `docs/design-system.md` called `friendly-darwin-l73xx9` "PR #5's branch". **PR #5 is
  `compassionate-johnson-odu08r`.** `friendly-darwin-l73xx9` and `design-system-dashboard` are both cut from it, side
  by side; neither contains the other. Fixed in that doc.

## Not on the list

`amazing-cray-jl6imi` (#4), `faster-feedback` (#2), `happy-mendel-ork3dh` (#1), `multilevel-q7-evaluator` (#3) and
`fix-live-pipeline-version-check` (#6) are already in `main`; they can be deleted.

## How this was checked

`git merge-base --is-ancestor` for every pair (what contains what); `git rev-list --count` against `main` (none is
behind); a trial merge of steps 7–12 onto step 6 in a separate worktree (no conflicts), then `tsc`, `eslint`, `vitest`
and the Part 1 browser test there. Re-run these if `main` moves before merging.

## After `claude/project-thread-e59hcb`: `claude/project-thread-8yy31h` (docs only)

Cut from `claude/project-thread-e59hcb`. **Documents only**: `docs/v1-plan.md` (Version 1 plan for students and
teachers: gap analysis, full mock, better versions, teacher audio, classroom mock, consent, build order, questions for
Asadbek) and this entry. No app code, no migration, no environment variable. Merge any time after it, merge commit,
no squash.

## After `claude/project-thread-8yy31h`: `claude/p3-real` (Part 3 real recording and scoring, no migration)

Cut from `claude/project-thread-8yy31h` (`1c6ecbf`), so it comes **after it**, merge commit, no squash. Branch name:
`claude/p3-real` (7 characters after `claude/`). **No database migration**, no new Production variable, no model call.
`PART_LIVE["3"]` stays `false`: every real Part 3 page answers 404 and the upload refuses until the owner switches it on,
which should wait for the live anchor run (docs/part3-plan.md, section 11). Step 1 of docs/v1-plan.md's build order.

- **Real Part 3 attempts, like Part 2:** create attempt, upload audio (with the ticked points), process (transcribe +
  Part 3 evaluator), stored result (schema version 4, `kind: "multilevel_q8"`), the real `/result/[attemptId]` for
  Part 3 (owner only), real practice page, task-list links, History rows and filter, dashboard (Recent attempts, tile
  band, a Part 3 biggest fix). `AnySpeakingTask` = Part 1/2 task | Part 3 task, only where the flow needs both.
- **Real providers wired for Part 3:** Gemini and Anthropic ask for the Part 3 schema when the rubric is
  `multilevel-q8`; Part 2's prompt hash and provider schema are unchanged. Part 3 prompt fingerprint fixture
  (`src/server/evaluation/q8-fingerprint.ts`, `test/fixtures/q8-model-output-schema.json`). The Part 3 prompt has
  **never been sent to a model**.
- **"AI score not ready yet" (Parts 1, 2, 3):** scoring that can't run after the transcript was saved no longer shows an
  error; the recording and transcript stay and the page offers "Check again". The upload route and the pages' server
  check no longer require the scoring key (`assertServerConfigured` skips it; **`/api/health` and the boot log still
  fail without it**, so deploys are unchanged).
- **Consent and audio:** the same `CONSENT_REQUIRED` lock; Part 3 audio is covered by the 30-day deletion and by
  "Delete my account" (no new table).
- **Test-only switch:** `CEFRO_TEST_PART3_LIVE=1` turns Part 3 on in `next dev` only (ignored when `NODE_ENV=production`
  or `VERCEL` is set), used by `playwright.part3.config.ts` / `npm run test:e2e:part3`. The main browser config ignores
  `e2e/part3-real.spec.ts`. **`.github/workflows/ci.yml` gets one new step** for it.
- **Shared code touched:** `attempt-service`, `attempt-processing`, `attempt-repository`, `attempt-views`, `stored.ts`
  (`parseStoredEvaluation` knows version 4), `history.ts` (`BandedResult`), the Gemini / Anthropic models,
  `provider-config` and `boot-check` (scoring option), `FailedResult` (the AI-pending screen), the result view model
  (`aiPending`, `goalOutcomeOf`), the dashboard `progress.ts`, `features.ts`, the teacher view model (typing only).
- **Tests:** `part3-pipeline.test.ts`, `part3-attempts.test.ts`, `part3-providers.test.ts`, `q8-fingerprint.test.ts`,
  `features.test.ts`, more in `from-attempt.test.ts`, `provider-config.test.ts`, `api-routes.test.ts`;
  `e2e/part3-real.spec.ts` (390 px, AA contrast).

## After `claude/p3-real`: `claude/full-mock` (full mock exam runner, migration 0008)

Cut from `claude/p3-real` (`c5fa288`), so it comes **after it**, merge commit, no squash. Branch name: `claude/full-mock` (9 characters
after `claude/`). Step 2 of docs/v1-plan.md's build order. **One additive database migration, `0008_full_mock`**, no new Production
variable, no model call. Nothing here is live until all four `PART_LIVE` switches are on: `/practice` says "Coming soon." and the real
mock routes answer 404 (`?mock=1` works regardless).

- **Migration 0008:** `practice_sessions` gets nullable `status` (`in_progress` / `finished` / `not_finished`) and `finished_at`, plus one
  index on `(user_id, kind, status)`. `kind` is plain text in the database, so the new value `full_mock` needs no SQL. Single-task rows keep
  both columns null. Run `npm run db:migrate` (or let the deploy do it) before the code is live.
- **Runner:** `/practice/mock` ("Before you start" / "Continue your mock", Parts 1.1 → 1.2 → 2 → 3, "Part N of 4" line, sent in the
  background while the next intro plays), `/practice/mock/[sessionId]` ("Mock finished", owner only). Routes: `POST /api/mock-exams` (start or
  resume), `GET /api/mock-exams/[mockId]`, `POST /api/mock-exams/[mockId]/finish`.
- **Rules:** `domain/speaking/full-mock.ts` (order, resume, 24 hours, task picker), `server/sessions/mock-service.ts`. An upload carrying a
  mock's `sessionId` is accepted for any of the four parts while the mock is open, even if that part is not live on its own; a part is taken once;
  a closed or expired mock takes nothing. Consent lock = the recording lock.
- **Entry:** "Full mock exam" card on `/practice` (the page's one black button), "Continue your mock" on the dashboard.
- **Test-only switch:** `CEFRO_TEST_FULL_MOCK_LIVE=1` (`next dev` only) opens the real mock on a test server; no config uses it yet.
- **Shared code touched (small, additive `embedded` prop):** `PracticeExperience`, `Part1Experience`, `Part3Practice`,
  `useQuestionSequence` (optional `audio`), `api-client` (two functions), `attempt-service` (`createAttempt`: mock-session rule),
  `TaskList` (`mockCard` slot), the dashboard page, `features.ts` (`fullMockLive`). Single-part behaviour is unchanged.
- **Tests:** `full-mock.test.ts`, `runner-machine.test.ts`, `upload-queue.test.ts`, `mock-exams.test.ts`, migration 0008 tests,
  `e2e/full-mock.spec.ts`; `mock-pages.test.ts` now expects the one black button on `/practice`.

## After `claude/full-mock`: `claude/scale-check` (docs only)

Cut from `claude/full-mock`, so it comes **after it**, merge commit, no squash. Branch name: `claude/scale-check`
(11 characters after `claude/`). Step 3 of docs/v1-plan.md's build order. **Documents only**: `docs/official-scale.md`
(what lex.uz officially says about the multilevel exam, what is only believed, what is unknown, and the
recommendation for the mock result page) and this entry. No app code, no migration, no environment variable.
**Partial:** the uzbmb.uz documents could not be read from the sandbox (listed in its section 4).

## After `claude/scale-check`: `claude/mock-result` (mock result and History for mocks, no migration)

Cut from `claude/scale-check`, so it comes **after it** (and so after `claude/full-mock`), merge commit, no squash. Step 4 of docs/v1-plan.md.
No migration, no environment variable, no Gemini call. New: `domain/speaking/mock-level.ts` (the level rule), `features/mock-result/*`,
`server/sessions/mock-result.ts`, `mock-history.ts`, `server/demo/demo-mock.ts`, `GET /api/mock-exams/[mockId]/result`. Changed: the `/practice/mock/[id]`
page (was "Mock finished"; `MockFinishedCard` removed), the runner's mock-mode end, History (view model, rows, `?part=mock`), `HistoryAttempt.sessionId`
(optional). Reads `teacher_ratings`, never writes. Shared code touched: `history/view-model.ts`, `history/sections.tsx`, `api-client.ts`, `attempt-views.ts`.

## After `claude/mock-result`: `claude/better-versions` (transcript with mistakes and better versions, no migration)

Cut from `claude/mock-result` (`0d56c45`), so it comes **after it** (and so after `claude/scale-check` and `claude/full-mock`), merge commit, no squash. Branch name: `claude/better-versions`
(15 characters after `claude/`). Step 5 of docs/v1-plan.md (section 3.3). **No migration, no environment variable, no Gemini call.** Nothing here is live
until the parts are: it changes what a result shows, and results only exist in mock mode or behind the `PART_LIVE` switches.

- **Evaluator output:** a new list `sentence_fixes` (up to 8 items of `you_said` / `better` / `why`, most important first) in the output of all four parts.
  `EVALUATOR_VERSION` `3.5.0` → `3.6.0` (Parts 1.1, 1.2, 2) and `ARGUMENT_EVALUATOR_VERSION` `0.1.0` → `0.2.0` (Part 3). The evaluation schema versions are **not**
  bumped (3 and 4): the list is optional in stored results, so every result stored before this has none and renders as before. Required of the model in the provider schema.
- **Code checks, not the AI:** `domain/evaluation/sentence-fixes.ts` (pure), run inside both quality gates (`quality-gate.ts`, `q8-quality-gate.ts`): an item is dropped (never repaired)
  if `you_said` is not word for word in the transcript, if `better` adds an idea or is more than a few words longer, if it holds more than one mistake, if it is about
  pauses or pronunciation, or if `why` is not one short line. A drop is a warning in the quality report (`sentence_fix_dropped`) and never rejects a draft.
- **Prompts changed, not live-tested:** one shared text (`prompts/sentence-fixes.ts`) in the Part 1, Part 2 and Part 3 prompts. **Part 2's prompt hash and provider schema changed on purpose**
  (`part1-prompt.test.ts` pinned hash, `test/fixtures/q7-model-output-schema.json`); so did Part 3's (`q8-fingerprint.test.ts`, `test/fixtures/q8-model-output-schema.json`).
  Results saved by 3.5.0 keep their old hash. See `docs/feedback-review.md`, "Sentences to improve", for what to check live.
- **Mock evaluators** fill the list from the demo answers (`server/evaluation/mock-sentence-fixes.ts`, a dozen rules for mistakes that are wrong in any context). **The demo answers now contain a few
  such mistakes on purpose** (`features/demo/demo-answers.ts`, `part3-demo-answers.ts`, `server/demo/demo-teacher.ts`), otherwise the list would be empty. Only the words changed, not the length, so the
  mock bands, goals and question statuses are the same as before.
- **Result page:** "Your answer" card: amber underline under each mistake, tap a sentence to open You said / Better / Why under it, the count "6 sentences to improve" at the top. New
  `features/result/TranscriptWithFixes.tsx` (a client component) and `transcript-fixes.ts` (pure); the same card on Part 3's page and on the teacher's read-only attempt page (Parts 1.1, 1.2, 2).
  **New colour token `--color-mark` (amber `#b45309`)**: the only addition to the palette, used only as a line (see design-system.md).
- **Shared code touched (small):** `domain/evaluation/evidence.ts` (`evidenceTokenSpans`, `locateQuote`), `multilevel/model-output.ts` and `q8/model-output.ts` (optional list, `q8ProviderOutputSchema`),
  `quality-gate.ts`, `q8-quality-gate.ts`, the Gemini and Anthropic models and `q8-fingerprint.ts` (Part 3 now asks for `q8ProviderOutputSchema`), the Part 1 / 2 / 3 prompts, `features/result/view-model.ts`
  and `sections.tsx`, `features/part3/view-model.ts` and `result-sections.tsx`.
- **Tests:** `sentence-fixes.test.ts` (the code checks), `transcript-fixes.test.ts`, `sentence-fixes-evaluators.test.ts` (demo answers of all four parts through the real evaluators, old results, schemas,
  prompts), more in `quality-gate.test.ts`; fingerprint fixtures updated; `e2e/transcript-fixes.spec.ts` (390 px: tap to expand, underline contrast, one open at a time, Part 3, teacher page, scripts delayed).

## After `claude/better-versions`: `claude/teacher-v1` (teacher sees all parts, mocks and recordings, **adds migration `0009`**)

Cut from `claude/better-versions` (`3bc5512`), so it comes **after it** (and so after `claude/mock-result`, `claude/scale-check` and `claude/full-mock`), merge commit, no squash.
Branch name: `claude/teacher-v1` (10 characters after `claude/`). Step 6 of docs/v1-plan.md. **No Gemini call, no environment variable.** Nothing is live: `TEACHER_LIVE`
stays false, so the real pages and routes are a 404 and everything works only in `?mock=1` and in the tests.

- **Migration 0009 (`0009_teacher_v1.sql`), additive:** new table `teacher_mock_ratings` (one row per mock and teacher: `agrees` or `teacher_level`, the estimate shown, with its own two
  indexes; foreign keys to `practice_sessions`, `users`, `classes`) and two **nullable** `class_members` columns, `all_parts_from` and `upgrade_declined_at`. Nothing is dropped, rewritten or made
  NOT NULL on an existing table. It carries a `cefro:reviewed:` line (the unique index is on a table the migration creates): **written by Claude, the owner's review is still pending**.
  `teacher_ratings` is **unchanged** (it already is the per-part rating: every part of a mock is an attempt). Run `npm run db:migrate` (or let the deploy do it) before the code is live.
- **Share text:** `SHARE_TEXT_VERSION` is now `"v1-all-parts-audio"`; `"2026-11-07"` is `LEGACY_SHARE_TEXT_VERSION`. Old memberships keep Part 2 only until their student taps
  "Share recordings too?" (details in docs/teacher-plan.md, section 10).
- **Access:** `teacherCanSee` (all parts; the old wording limits it to Part 2), new `teacherCanSeeMock`, new `teacherCanHear` (see + recorded teacher-sharing consent + audio not deleted), all in
  `server/teacher/teacher-store.ts`; the pure rules in `domain/teacher/rules.ts` (`memberSeesAttempt`, `memberSeesMock`, `canHearRecording`, `memberScope`). `teacherSharingConsentRecorded` in
  `server/consent/consent.ts` (audio ignores the `CONSENT_REQUIRED` switch on purpose).
- **New routes:** `GET /api/teacher/classes/[classId]/attempts/[attemptId]/audio` (teacher's player, never cached, Range), `GET .../mocks/[mockId]`, `PUT .../mocks/[mockId]/rating`,
  `POST /api/classes/[memberId]/upgrade`, `POST /api/classes/[memberId]/decline-upgrade`. Changed: the attempt route (any part, `listen`), the rating route (Part 3 too), the class and student
  routes (last mock, mocks first, scope note), `GET /api/mock-exams/[mockId]/result` (`teacherLevel`).
- **New pages:** `/teacher/classes/[classId]/mocks/[mockId]` (T6), `/join/[code]` (redirects to the normal Join screen with the code filled in; signed out: sign in first). Changed: T3, T4, T5
  (Part 3), S2 Share, the Account page (the one-time card), the student's result pages (`/result/[attemptId]`: "Your teacher").
- **Leave / Remove / Close / Delete:** part ratings still become id-free pairs (now Part 1.1, 1.2, 2, 3); a whole-mock level is deleted with no pair. `delete-account.ts` **and
  `scripts/delete-account.mjs`** delete `teacher_mock_ratings`; the table-by-table test is extended and still passes.
- **Demo data (mock mode only, real evaluator types):** Aziza has a finished mock and a Part 3 attempt, Bekzod a not-finished mock, Dilnoza a Part 1.2 attempt, Sardor is on the old wording;
  `public/audio/demo-recording.wav` is a 3-second synthetic tone (no voice) that the demo player plays.
- **Shared code touched (small):** `features/result/sections.tsx` and `features/part3/result-sections.tsx` (`teacher.listen`, `yourTeacher`, Part 3 `teacher` mode), `features/history/view-model.ts`
  (exports `mockRow`, `mockBands`), `features/mock-result/*` (`teacherLevel`), `server/sessions/mock-result.ts` (`bandLabelsForTask` exported), `AttemptResult` / `Part3AttemptResult` (`yourTeacher`).
- **Tests:** `server/teacher/teacher-access.test.ts`, `app/api/teacher/teacher-v1.test.ts`, `features/teacher/{teacher-pages,mock-view,view-model}.test.ts`,
  `features/result/your-teacher.test.ts`, `features/mock-result/view-model.test.ts`, `server/db/migrations.test.ts` (0009), `server/account/owner-delete-script.test.ts`,
  `app/api/teacher/teacher-routes.test.ts` (updated), `e2e/teacher-v1.spec.ts`, `e2e/teacher-view.spec.ts` (updated).
