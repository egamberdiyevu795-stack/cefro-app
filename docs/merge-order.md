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
- **One chime.** Part 2 now plays Part 1's placeholder `.wav` (`history-page` added the same file, byte-identical, at
  the same path, so `part1-player` merges without a conflict on it). Once both are in, `lib/chime.ts` can import the
  path from `content/speaking/part1/chime.ts` instead of repeating it.
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
