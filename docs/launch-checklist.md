# Launch checklist: merging the chain into `main`

Checked 2026-11-07 on `claude/integration-chgcwb`, cut from `claude/landing` at `b528b15`; `main` at `b597b4f`.
**Updated 2026-11-08 on `claude/launch-cleanup`** (cut from `claude/integration-chgcwb`): sections 2, 3, 6, 9 and 10.
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
2. ~~The six new Part 2 tasks' anchor answers are not wired into any live test.~~ **Fixed on `claude/launch-cleanup`:**
   the 12 answers run in `test/live/evaluation-set.live.test.ts`, each with its own task, exact band on every run
   (`npm run eval:live:new-tasks`). **Not run yet** (no model was called). See section 6.
3. **The evaluator in this chain (3.5.0, rubric `multilevel-q7/2.1.0`) has never run on the production model
   `gemini-3.8-flash`.** The saved runs are `gemini-3.6-flash`, transcript only. See section 6.
4. ~~`docs/DEPLOY_VERCEL.md` "First rollout" still quotes "0 of 5 / 5 migrations".~~ **Fixed:** it no longer
   hard-codes a count ("N migrations", N = the entries in the migration journal; 7 with this chain).
5. Old release on the new schema (needed for rollback): **run on 2026-11-08**, see section 9. `main`'s own unit and
   browser tests pass on a database migrated to `0006`, except 4 tests that assert the old migration count / table
   list. **New finding:** `main`'s `db:migrate --check` refuses a database that is ahead of it, so the old release
   can be restored with Vercel Instant Rollback, but **not** by re-running the old commit through the pipeline.

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

| 20 | `claude/integration-chgcwb` | docs only (this file) |
| 21 | `claude/launch-cleanup` | no migration; see `merge-order.md` |

**Never merge:** `claude/entry-pages-jgh558`, `claude/lessons-adi79w`, `claude/mock`.
**Not now:** `claude/part1-player` (needs the `CountdownRing` fix, `merge-order.md`).

Commands (from a clean clone; or the same order as GitHub PRs with "Create a merge commit"):

```bash
git fetch origin
git checkout main && git pull --ff-only origin main
for b in compassionate-johnson-odu08r friendly-darwin-l73xx9 design-system-dashboard sharp-fermi-qol4ym \
         part2-practice-flow real-result-page history-page dashboard-real-data cefro-part-2-tasks-yfr6x5 \
         review-dashboard-real-data-4jikaa mock-mode-vercel-preview-8uzlim upbeat-ride-2eymyu wave1-lesson-drafts \
         lessons profile-settings teacher-plan-v7fp7j teacher-view-kd6wdk entry-pages landing \
         integration-chgcwb launch-cleanup part1-plan lucid-euler-460531 sleepy-hypatia-rp7db1; do
  git merge --no-ff --no-edit "origin/claude/$b" || break   # stop on the first conflict (none expected)
done
npm ci && npm run check && npm run test:e2e -- --trace off   # all green before pushing
git push origin main                                         # pipeline disarmed: runs nothing
```

Since steps 1–20 are all inside `launch-cleanup`, merging `claude/launch-cleanup` alone gives the same tree; one by one
keeps each review small.

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
the merge, before or right after the deploy. **First run the same command with `-- --dry-run`**: it removes every
provider key, calls no model, prints one row per evaluation with its prompt size and the estimated cost, and writes
every prompt in full to `eval-reports/` (`scripts/eval-live.mjs`, `test/live/dry-run.ts`).
Set `EVALUATION_PROVIDER=gemini` for the dry run too, e.g. `EVALUATION_PROVIDER=gemini npm run eval:live:new-tasks -- --dry-run`:
without it the dry run assumes the default provider (Anthropic), has no price for it and prints "n/a".

| Run | What | Calls | Estimated cost (dry run) |
| --- | --- | --- | --- |
| `npm run eval:live:part2` (`EVAL_SAMPLES=A,S15`, ×3) | 8 Part 2 anchors + S15 on `gemini-3.8-flash`; every anchor must hit its band | 27 evaluations | ≈ $0.71 (up to $1.42 if every draft is regenerated) |
| `npm run eval:live:new-tasks` (`EVAL_SAMPLES=NEW`, ×3) | **the 12 new-task anchors**, 2 for each of the 6 newer tasks, each with its own task; every run must hit its exact band | 36 evaluations | **≈ $0.95** (up to $1.90) |
| `EVAL_SAMPLES=A0-below-b1 EVAL_REPEAT=5` | `feedback-review.md` issue 5 | 5 | ≈ $0.13 (up to $0.26) |
| `live-pipeline` workflow | real audio → transcription → audio step → evaluation, end to end | a few answers | < $0.50 |

The new-task anchors are selected with `EVAL_SAMPLES=NEW` (or their ids: `D4,D1` decision, `G4,G1` goal, `T4,T1` team,
`F4,F1` trying and failing, `R4,R1` tradition, `H4,H1` happy day; use full ids, since `R` alone also matches `RETRY`).
`npm run eval:live` with no `EVAL_SAMPLES` runs everything: 108 evaluations, ≈ $2.83 (dry run).

Basis of the estimate: input tokens from the prompt each evaluation sends (≈ 0.365 tokens per character, measured on
the 19 saved 3.6-flash runs), ≈ 5,800 output tokens per evaluation (thinking included, same runs), at the price table
in `src/server/evaluation/pricing.ts` ($0.75 / $3.75 per million, **unverified**, introductory until 31 Dec 2026).
"Up to" assumes every draft is rejected once and sent again. **Total for the runs above ≈ $2.30 – $4; budget $5.**
Check the current price at ai.google.dev before running. Then work through `docs/feedback-review.md` issues 1–5 on the
saved outputs.

## 7. Test on a Preview first

A Preview of this branch has no variables, so only mock mode works (no cost):

- `/?mock=1` home, "See a demo result", "Start practising" → Create account page.
- `/practice?mock=1` → a Part 2 task → brief, Check microphone, preparation, recording, Scoring… → result.
- `/dashboard?mock=1`, `/history?mock=1`, `/profile?mock=1`, `/lessons?mock=1` → a lesson, `/dashboard?mock=1&as=teacher`.
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
  release runs on the new schema (checked, below). Set `CEFRO_AUTO_DEPLOY=false` so the next push does not redeploy the
  bad commit; fix forward on `main`.
- **Not a rollback path: re-deploying the old commit through the pipeline.** `main`'s own `db:migrate --check` (the
  pipeline's `check` / `deploy` stages) refuses a database that is ahead of it: "the database has 2 migration(s) this
  code does not know … refusing to touch it" (exit 1). Use Instant Rollback, or fix forward.
- **Bad code on `main`:** `git revert -m 1 <merge commit>` (never force-push `main`). Reverting the merge that brought
  in a migration does not remove the migration from the database; leave the migration file in place.
- **Rollback check, run 2026-11-08** (local, no hosted database): `main` at `b597b4f` in its own worktree, same
  dependencies.
  - `main`'s unit tests (`npm test`) with the schema at `0006` (`main`'s code, this chain's migration files, so every
    test database is built to `0006`): **691 of 695 pass.** The 4 failures only assert the old schema itself: 3 in
    `test/migrate-script.test.ts` expect "5 migrations" (they get 7), 1 in `src/server/db/migrations.test.ts` expects
    the old table list (it gets the 4 teacher tables too). Baseline on its own schema: 695 / 695.
  - `main`'s browser tests (`npm run test:e2e`: sign-up, sign-in / out, anonymous → account, another user's attempt
    refused, the full practice loop with retry and history, upload / evaluation failures) on the same `0006` schema:
    **16 of 16 pass.**
  - Hosted path (Hrana emulator, `test/hrana-emulator.ts`): this chain's `scripts/migrate.mjs` → "7 migrations applied,
    foreign key check clean"; then `main`'s code opens it as a hosted database (its start-up check accepts 7 ≥ 5),
    writes and reads users, tasks and attempts; a user row `main` inserts gets `role = 'student'`. `main`'s
    `db:migrate --check --require-current` refuses it (above).
  - Caveat: the emulator is SQLite, not Turso; and the old release was not run on Vercel.
- **Database:** never roll a schema back automatically. If data is damaged, restore the Turso backup from step 5.1.
  Otherwise the extra tables and columns are harmless to the old release and can stay.
- **Scoring wrong in production** (the live check finds a regression): set `EVALUATION_PROVIDER=anthropic` (needs
  `ANTHROPIC_API_KEY`) as a temporary switch, or roll back the release.

## 10. "Coming soon" and demo-only things real users will see

Updated on `claude/launch-cleanup`. **No page shows a control that does nothing**: no disabled control once the page is
ready, every button does something when tapped, every link opens a page (browser test `e2e/no-dead-controls.spec.ts`,
on every main page in mock and real mode, at desktop and 390 px; also on the Preview build).

Real pages (signed in), after the merge:

- **Exam parts 1.1, 1.2 and 3**: dashboard tiles and the home page's parts list say "Coming soon" (`PART_LIVE`), as
  text with no link. Only Part 2 is open. **This is the only "Coming soon" left anywhere.**
- **Removed** (in every mode, with their flags and the `ComingSoon` components): dashboard Search, "Mock exam", the
  notifications bell, the "Last 30 days" filter, the attempt row menu (Delete, Report a wrong score), and the result
  page's placeholder "Play recording" (a result with a stored recording still has the real player).
- **Lessons tab:** a real link to `/lessons`, the list of approved lessons (title and the lesson file's Variant,
  "Part 2 (B2)"; no lesson has an approved one-line summary, so none is shown). Each opens its lesson. Opened from the
  list there is no result, so: no "Why this lesson", no goal, no "Retry with this goal"; the back link says "Lessons" and
  the one black button is **"Go to Part 2"** (the Part 2 task list) under a card titled "Practise Part 2", with the
  lesson's own "Remember:" line. That wording is reused from the Account page; **for the owner's review**
  (`src/features/lessons/no-result.ts`). Opened from a result ("Learn how") the lesson is unchanged.
- **Teacher view:** off by default (`TEACHER_LIVE`, false unless the owner sets `TEACHER_LIVE=true` in Vercel, `docs/pilot-runbook.md`): real teacher pages and Join / Share / Leave are 404.
- **Part 1 player:** not merged (`/dev/part1-player` is 404 in production anyway).
- **Pronunciation:** "not assessed" and every band provisional if `GEMINI_API_KEY` is missing or `AUDIO_ASSESSMENT=off`.
- **Start-of-speaking chime:** two soft sine tones (E5 then A5, 0.5 s) made with the Web Audio API in
  `lib/chime.ts`; no sound file (the placeholder `.wav` is deleted). The audio context is created only by the
  "Start preparation" click, so nothing can sound before the student presses a button (unit and browser tests).

Mock / demo content reachable by anyone (always labelled):

- **Home → "See a demo result"** (`/result?demo=demo-5&mock=1`) and any `?mock=1` page: demo student, results from the
  mock evaluator, "Demo mode…" / "Demo result…" labels, nothing saved or sent.
- **`/result` with no `?demo=` and no `?mock=1`** is now the not-found screen (it used to show the saved
  gemini-3.6-flash runs). The saved-runs prototype stays reachable only in mock mode (`/result?mock=1`, labelled).
- **Demo teacher** (`/dashboard?mock=1&as=teacher`), Demo class `DEMO42`.

## 11. Pilot consent and audio deletion (`claude/consent-pilot`)

Before inviting any pilot tester (`docs/consent-design.md`, section 2b):

1. **Migration `0007_pilot_consent`** (additive: four `users` columns, one `recordings` column). Same steps as
   section 5; the counts become 8 migrations.
2. **Vercel → Production variables:** `CONSENT_REQUIRED=true` (locks recording until consent; default `false`), and
   `CRON_SECRET` = 16+ random characters (Vercel Cron sends it; without it the audio job refuses to run).
3. **Check the cron after the production deploy:** Vercel → Project → Settings → Cron Jobs shows
   `/api/cron/audio-retention` daily at 03:17 UTC. Vercel runs crons **on the production deployment only**, never on
   Previews: until production is deployed nothing deletes audio by itself. Its log line "Audio retention run" has
   counts only.
4. **Owner's machine:** with the production `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the shell,
   `node scripts/set-consent.mjs <email> granted` for each tester whose (parent's) written "yes" you hold, and
   `node scripts/delete-account.mjs <email> --yes` when someone asks for deletion (run it once without `--yes` first).
5. **Gemini API logging off:** in Google AI Studio, check that request logging is off for the production project
   (projects created from 26.10.26 have it on by default; logs keep prompts, including audio, up to 55 days). This is a
   copy we control; the provider's own abuse-monitoring copy (55 days) we can't delete.
6. **Exam laptop (`claude/exam-laptop`, `docs/teacher-plan.md` section 11):** run the exam laptop in the browser's full-screen or kiosk mode as extra safety.
   The laptop already runs on its own device session (the teacher's login is signed out of that browser while the exam runs, and every other page and
   API answers 404), so a student who types another address reaches nothing; full-screen or kiosk mode keeps the address bar out of sight as well.
7. **Migration `0010_exam_laptop`** (additive: two tables, three nullable columns). Same steps as section 5; the counts become 11 migrations.
8. **Before the pilot dry run,** test the real full mock on a phone (iOS Safari): microphone permission must survive all four parts and the spoken intros must play.

## 12. Open before the pilot (checked 2026-11-12 on `claude/pilot-ready`)

Nothing below was answered or done by Claude: the repository holds no answer for any of it, and none is assumed. Who does
each is in the third column. The pilot steps themselves are in `docs/pilot-runbook.md`; the rehearsal is `docs/pilot-dry-run.md`.

| # | Open item | What was found | Who |
| --- | --- | --- | --- |
| 1 | **"Speaking only" line in Uzbek and Russian.** | The app shows the English line ("Speaking only. An estimate from this mock, not an official UZBMB score."). The Uzbek and Russian versions exist only as **drafts** in `docs/official-scale.md`, section 5, and say they need a native check before the pilot. They are not in the app. | A **native speaker** checks the two drafts; **you** decide whether the pilot app needs them (the rest of the app stays English, `docs/consent-design.md` section 0); then Claude adds them. |
| 2 | ~~Piper / LibriTTS CC BY 4.0 credit on a public page.~~ **Done 2026-11-12.** | A quiet "Credits" link in the footer of every page (not on the exam laptop screen, which has no link out) opens `/credits`: Piper (MIT), the voice model, the LibriTTS creators, the CC BY 4.0 link, the corpus link and the change (slowed down). The wording is the one recorded next to the audio files (`public/audio/speaking/part1/README.md`); a test keeps them identical. | **You** may still check the wording against openslr.org/60 and the licence. |
| 3 | **Phone test of the full mock on iOS (Safari).** | No record that it was ever run on a real iPhone. Microphone permission must survive all four parts and the spoken introductions must play. (`docs/AI_EVALUATION_QUALITY.md` notes Safari records MP4/AAC, less clearly accepted by speech-to-text than Chrome's WebM.) | **You**, on an iPhone. The dry run (`docs/pilot-dry-run.md`) can include it. |
| 4 | **Speech-to-text account.** | Gemini credit is near zero, so speech-to-text should be OpenAI (`TRANSCRIPTION_PROVIDER=openai`). It has not been run on real learner speech in this chain (`npm run eval:transcription`). The dry run puts one real recording through it. | **You** create the key and add credit; the dry run checks it. |
| 5 | **Turso backup before migrating.** | Migrations 0005 to 0010 are not applied to the production database (the production release runs `main`: 0000 to 0004). | **You**, before `npm run db:migrate`. |
| 6 | **Gemini request logging off** (only if a Gemini key is used). | Section 11, item 5. | **You**, in Google AI Studio. |
| 7 | **The dry run** on a Vercel Preview with a **separate test database**. | Not done. | **You and a friend**. |

Not needed before the pilot (AI scoring is allowed to be off): the live Gemini checks in section 6 and measuring the
real cost of a mock. They come with `docs/v1-plan.md` step 9, when credit exists. Part 3's AI prompt has never been
tested with a real model, which is acceptable only while AI scoring is off.

## 13. Switches that need no commit (added on `claude/pilot-ready`)

`PART_1_1_LIVE`, `PART_1_2_LIVE`, `PART_2_LIVE`, `PART_3_LIVE`, `FULL_MOCK_LIVE` and `TEACHER_LIVE` are read from the environment
(`src/config/features.ts`, tests in `src/config/features.test.ts`). Defaults are unchanged: all off except Part 2. Set them in
Vercel Production, then Redeploy. `docs/pilot-runbook.md` section 1 lists them with `CONSENT_REQUIRED` and `CRON_SECRET`. The
`CEFRO_TEST_*` switches are still ignored in production builds and on Vercel.

## 14. Forgot password (added on `claude/project-thread-je2jm7`)

No migration. Production shows **Forgot password?** only once email is configured: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, `EMAIL_FROM` in Vercel Production, then Redeploy. Setup and troubleshooting: `docs/password-reset.md`.
`SMTP_PASSWORD` is a secret (the logger redacts it).
