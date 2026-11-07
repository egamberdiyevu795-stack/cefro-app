# Launch checklist: merging the chain into `main`

Checked 2026-11-07 on `claude/integration-chgcwb`, cut from `claude/landing` at `b528b15`; `main` at `b597b4f`.
**Nothing was merged, deployed or migrated on a hosted database, and no paid API was called** (mock providers only;
no API key was present). Read with `docs/merge-order.md` (what each branch contains) and `docs/DEPLOY_VERCEL.md`
(the pipeline).

## 1. What was checked

| Check | Result |
| --- | --- |
| Every branch in `merge-order.md` (except "never merge" and `part1-player`) is an ancestor of `claude/landing` | **18 of 21 yes.** Not in it: `claude/part1-plan` (6 commits, `docs/part1-plan.md`), `claude/lucid-euler-460531` (5 commits, `docs/part3-plan.md`), `claude/sleepy-hypatia-rp7db1` (2 commits, `prompt-overlap.ts` + tests). All three are "independent, any order" in `merge-order.md`. A trial merge of all three onto `landing`: no conflicts, `tsc` clean, eslint clean, `prompt-overlap.test.ts` 34/34. `main` has no commit that `landing` lacks. |
| Migrations, fresh empty database | `0000`–`0006` applied by the real `scripts/migrate.mjs` (local Hrana emulator, `test/hrana-emulator.ts`): "7 migrations applied, foreign key check clean". Second run: no-op. `--check --require-current`: 7 of 7. |
| Migrations, old production schema | Database built by **`main`'s** `migrate.mjs` (`0000`–`0004`, the schema production runs today), filled with one row or more in every table (registered + merged anonymous user, auth account/session, attempts incl. a retry, recording + blob, transcript, evaluation, session, analytics). Then `landing`'s script: `--check` "5 of 7, 2 pending" → apply → "7 migrations applied, FK clean". Row counts and existing columns unchanged; new columns `role='student'`, `exam_date`/`exam_date_skipped_at` NULL; the upgraded schema is **identical** to the fresh one; the new teacher tables accept rows linked to old data. |
| Lint, typecheck | Clean. |
| Unit tests (`npm test`) | **1274 / 1274 passed** (95 files). |
| Browser tests (`npm run test:e2e`) | **64 passed, 1 skipped** (that test runs only on the Preview build, by design). |
| Preview build (`npm run test:e2e:preview`) | **19 passed, 9 skipped** (real-account tests, which need a database a Preview does not have; by design). |

Caveat: the emulator is SQLite behind the Hrana protocol, not Turso. It proves the SQL and the script; Turso itself
is only proven by the `check` stage below.

## 2. Problems found

1. **Three branches are not in `landing`** (above). Not a blocker: merge them separately, any time.
2. **The six new Part 2 tasks' anchor answers are not wired into any live test.**
   `test/evaluation-samples/part2-new-task-anchors.ts` is used only by its own unit test; `npm run eval:live` runs the
   "Advice from someone" anchors only. So the new tasks cannot be live-checked until someone adds them to
   `test/live/evaluation-set.live.test.ts` (or a sibling).
3. **The evaluator in this chain (3.5.0, rubric `multilevel-q7/2.1.0`) has never run on the production model
   `gemini-3.8-flash`.** The saved runs are `gemini-3.6-flash`, transcript only. See section 6.
4. `docs/DEPLOY_VERCEL.md` "First rollout" still quotes "0 of 5 / 5 migrations"; with this chain it is 7.
5. Old release on the new schema (needed for rollback) was **reasoned, not run**: both new migrations only add tables
   and nullable / defaulted columns, and the old code names its columns explicitly, so it ignores the new ones.

## 3. Merge order and commands

Each step is a **merge commit, never squash or rebase-merge** (`merge-order.md`, "Why merge commits").

**Before step 1: disarm automatic deploys.** If the repository variable `CEFRO_AUTO_DEPLOY` is `true`, every push to
`main` runs the whole pipeline (migrate + deploy). Set it to `false` for the merge, so production moves once, at the end.

| # | Branch | Note |
| --- | --- | --- |
| 1 | `claude/compassionate-johnson-odu08r` | PR #5 |
| 2 | `claude/friendly-darwin-l73xx9` | |
| 3 | `claude/design-system-dashboard` | |
| 4 | `claude/sharp-fermi-qol4ym` | |
| 5 | `claude/part2-practice-flow` | |
| 6 | `claude/real-result-page` | |
| 7 | `claude/history-page` | |
| 8 | `claude/dashboard-real-data` | **adds migration `0005_exam_date`** |
| 9 | `claude/cefro-part-2-tasks-yfr6x5` | |
| 10 | `claude/review-dashboard-real-data-4jikaa` | |
| 11 | `claude/mock-mode-vercel-preview-8uzlim` | |
| 12 | `claude/upbeat-ride-2eymyu` | (also brought in by 14) |
| 13 | `claude/wave1-lesson-drafts` | (also brought in by 14) |
| 14 | `claude/lessons` | |
| 15 | `claude/profile-settings` | |
| 16 | `claude/teacher-plan-v7fp7j` | right after 15, never earlier |
| 17 | `claude/teacher-view-kd6wdk` | **adds migration `0006_teachers`** |
| 18 | `claude/entry-pages` | |
| 19 | `claude/landing` | |
| any | `claude/part1-plan`, `claude/lucid-euler-460531`, `claude/sleepy-hypatia-rp7db1` | docs / unused module |

**Never merge:** `claude/entry-pages-jgh558`, `claude/lessons-adi79w`, `claude/mock`, `claude/integration-chgcwb`
(this branch: one doc on top of `landing`; copy the doc instead, or merge it last).
**Not now:** `claude/part1-player` (needs the `CountdownRing` fix, `merge-order.md`).

Commands (from a clean clone; or the same order as GitHub PRs with "Create a merge commit"):

```bash
git fetch origin
git checkout main && git pull --ff-only origin main
for b in compassionate-johnson-odu08r friendly-darwin-l73xx9 design-system-dashboard sharp-fermi-qol4ym \
         part2-practice-flow real-result-page history-page dashboard-real-data cefro-part-2-tasks-yfr6x5 \
         review-dashboard-real-data-4jikaa mock-mode-vercel-preview-8uzlim upbeat-ride-2eymyu wave1-lesson-drafts \
         lessons profile-settings teacher-plan-v7fp7j teacher-view-kd6wdk entry-pages landing \
         part1-plan lucid-euler-460531 sleepy-hypatia-rp7db1; do
  git merge --no-ff --no-edit "origin/claude/$b" || break   # stop on the first conflict (none expected)
done
npm ci && npm run check && npm run test:e2e -- --trace off   # all green before pushing
git push origin main                                         # pipeline disarmed: runs nothing
```

Since steps 1–18 are all inside `landing`, merging `claude/landing` alone gives the same tree; one by one keeps each
review small.

## 4. Production environment variables (Vercel → Production)

No new variable is required by this chain. Check these are set:

| Variable | Value | Note |
| --- | --- | --- |
| `TRANSCRIPTION_PROVIDER` | `gemini` (or `openai`) | **No default on Vercel**: missing = every page 500 / API 503. `mock` is refused. |
| `EVALUATION_PROVIDER` | `gemini` (or `anthropic`) | Same. |
| `GEMINI_API_KEY` | secret | Needed for Gemini, and turns on the audio (pronunciation) step (`AUDIO_ASSESSMENT=auto`). |
| `AUTH_SECRET` | 32+ random characters | Required in production. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Production only | Untick Preview and Development. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | only if that provider is chosen | |
| Optional | `GEMINI_EVALUATION_MODEL` (default `gemini-3.8-flash`), `GEMINI_TEMPERATURE` (new, default 0), `GEMINI_THINKING_LEVEL`, `TRANSCRIPTION_FALLBACK_PROVIDER`, `LIMIT_*` | |

Must **not** be set in Production: `CEFRO_TEST_CLIENT_IP`, `CEFRO_ALLOW_PREVIEW_TURSO`, any `NEXT_PUBLIC_*` secret.
**Changed meaning:** `LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN` is now "per account from any IP" (default 8 → 20); new
`LIMIT_LOGIN_FAILURES_PER_EMAIL_IP_15MIN` (5). Defaults for sign-up / per-IP limits were raised for classrooms. If
Production overrides any `LIMIT_*` value, review it. GitHub `production` environment secrets are unchanged
(`TURSO_*`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

## 5. Migration step

Two pending migrations, both additive (`0005_exam_date`, `0006_teachers`). The app refuses to start on a hosted
database that is behind, so migrate **before** deploying. GitHub → Actions → "Deploy production", run manually on `main`:

1. **Take a Turso backup / point-in-time restore point.**
2. Stage `check`: expect `5 of 7 migrations applied, 2 pending; foreign key check clean`. Writes nothing.
3. Stage `migrate`: expect `db:migrate: OK. 7 migrations applied, foreign key check clean`. One transaction.
4. Stage `check` again: `7 of 7`.

The release still live keeps working on the migrated database (additive only).

## 6. Live Gemini check still to do (costs money)

Run with the GitHub `live-evaluation` / `live-pipeline` workflows (manual, use the `GEMINI_API_KEY` secret) **after**
the merge, before or right after the deploy:

| Run | What | Calls | Estimated cost |
| --- | --- | --- | --- |
| `npm run eval:live:part2` (`EVAL_SAMPLES=A,S15`, ×3) | 8 Part 2 anchors + S15 on `gemini-3.8-flash`; every anchor must hit its band | 27 evaluations | ≈ $0.70 – $1.40 |
| `EVAL_SAMPLES=A0-below-b1 EVAL_REPEAT=5` | `feedback-review.md` issue 5 | 5 | ≈ $0.15 – $0.25 |
| `live-pipeline` workflow | real audio → transcription → audio step → evaluation, end to end | a few answers | < $0.50 |
| New-task anchors (after wiring them, problem 2) | 12 answers × 3 | 36 | ≈ $1 – $2 |

Basis: the saved 3.6-flash runs average ~6,200 input / ~5,800 output tokens per evaluation; at the price table in
`src/server/evaluation/pricing.ts` ($0.75 / $3.75 per million, **unverified**, introductory until 31 Dec 2026) that is
≈ $0.026 per evaluation, plus the audio step. **Total ≈ $2 – $4; budget $5.** Check the current price at
ai.google.dev before running. Then work through `docs/feedback-review.md` issues 1–5 on the saved outputs.

## 7. Test on a Preview first

A Preview of this branch has no variables, so only mock mode works (no cost):

- `/?mock=1` home, "See a demo result", "Start practising" → Create account page.
- `/practice?mock=1` → a Part 2 task → brief, Check microphone, preparation, recording, Scoring… → result.
- `/dashboard?mock=1`, `/history?mock=1`, `/profile?mock=1`, `/lessons/<slug>?mock=1`, `/dashboard?mock=1&as=teacher`.
- Every page at 390 px; demo labels shown; real pages (`/dashboard` without `?mock=1`) refuse cleanly.

Real accounts on a Preview need their own Turso database (`CEFRO_ALLOW_PREVIEW_TURSO=true`, Preview-only `TURSO_*`,
migrated by hand) and real provider variables (mock is refused in a production build), so scoring an answer there
costs ≈ $0.03. Worth one pass: sign up, sign in, exam date, one scored answer, retry, Account name, Change password,
Delete my account.

## 8. Deploy and after

1. Stage `deploy`: it re-checks 7 of 7, deploys exactly the head of `main`, checks `/api/health`.
2. On production: sign up, one real Part 2 answer, result page, retry, History, Account, sign out / in.
3. Re-arm: `CEFRO_AUTO_DEPLOY=true`.

## 9. Rollback

- **Bad release:** Vercel *Instant Rollback* (or `vercel rollback`) to the previous production deployment. The old
  release runs on the new schema (additive migrations; see problem 5). Set `CEFRO_AUTO_DEPLOY=false` so the next push
  does not redeploy the bad commit; fix forward on `main`.
- **Bad code on `main`:** `git revert -m 1 <merge commit>` (never force-push `main`). Reverting the merge that brought
  in a migration does not remove the migration from the database; leave the migration file in place.
- **Database:** never roll a schema back automatically. If data is damaged, restore the Turso backup from step 5.1.
  Otherwise the extra tables and columns are harmless to the old release and can stay.
- **Scoring wrong in production** (the live check finds a regression): set `EVALUATION_PROVIDER=anthropic` (needs
  `ANTHROPIC_API_KEY`) as a temporary switch, or roll back the release.

## 10. "Coming soon" and demo-only things real users will see

Real pages (signed in), after the merge:

- **Exam parts 1.1, 1.2 and 3**: dashboard tiles and the home page's parts list say "Coming soon" (`PART_LIVE`). Only
  Part 2 is open.
- **Lessons tab** in the navigation: "Coming soon" (no lessons index page). The three lesson pages themselves work,
  reached from the result page's "Learn how".
- **Dashboard top bar:** Search ("Search tasks and lessons…"), "Mock exam", Notifications bell: all "Coming soon".
- **Dashboard:** "Last 30 days" period filter, and the attempt row menu (Delete, Report a wrong score; hidden on phones):
  "Coming soon".
- **Teacher view:** off (`TEACHER_LIVE = false`): real teacher pages and Join / Share / Leave are 404.
- **Part 1 player:** not merged (`/dev/part1-player` is 404 in production anyway).
- **Pronunciation:** "not assessed" and every band provisional if `GEMINI_API_KEY` is missing or `AUDIO_ASSESSMENT=off`.

Mock / demo content reachable by anyone (always labelled):

- **Home → "See a demo result"** (`/result?demo=demo-5&mock=1`) and any `?mock=1` page: demo student, results from the
  mock evaluator, "Demo mode…" / "Demo result…" labels, nothing saved or sent.
- **`/result` without `?demo=`** is the design prototype: saved **gemini-3.6-flash** outputs for "Advice from someone",
  not the production model. Always mock data, even without `?mock=1`; not linked from real pages.
- **Demo teacher** (`/dashboard?mock=1&as=teacher`), Demo class `DEMO42`.
- **Placeholder chime** (Part 2 start-of-speaking beep uses Part 1's placeholder `.wav`).
