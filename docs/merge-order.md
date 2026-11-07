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
