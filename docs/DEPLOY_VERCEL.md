# Deploying CEFRO to Vercel

CEFRO keeps its data (attempts, sessions, accounts, **and the recordings**) in a hosted libSQL database (Turso), so every
serverless function instance sees the same data. Once `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in Vercel, the
deployed app uses Turso automatically; nothing else in the code needs to change.

> **Status: implemented and tested locally, not yet validated against a real Turso database.** See "Real Turso
> validation: NOT RUN" below for what that means and exactly how to do it.

## Automatic deployment (GitHub Actions)

Once it is armed (below), nothing is deployed or migrated by hand. A push to `main` runs `.github/workflows/deploy.yml`:

```
push to main
  └─ Validate    lint, typecheck, tests (incl. migration tests), build, browser tests, migration safety   (CI, no secrets)
      └─ Preflight   secrets present · Vercel project safe (production branch, credential scope, no deploy hooks) · head of main
          └─ Migrate     npm run db:migrate -- --require-remote   (production Turso database, idempotent, one run at a time)
              └─ Verify      db:migrate --check --require-current   (read-only: every migration is applied)
                  └─ Deploy      vercel deploy --prod of exactly this commit, then a health check of the production domain
```

Every stage needs the one before it. A failed check, a failed migration, a stale run or a bad Vercel setting stops
everything after it, so nothing is migrated before the checks pass and nothing is deployed before the migration is
verified.

### Arming the automatic pipeline

A push to `main` does **nothing** until the GitHub repository variable `CEFRO_AUTO_DEPLOY` is exactly `true`
(*Settings → Secrets and variables → Actions → Variables*). That is deliberate: the first rollout is done by hand, stage by
stage (`check`, `migrate`, `deploy`), so the first real migration and deployment are watched. Set the variable only after
that has succeeded. Setting it to anything else (or deleting it) switches automatic deployments off again at any time; manual
runs are never affected by it. An unarmed push shows a run with every job skipped.

### Manual stages (first rollout, retries)

*Actions → Deploy production → Run workflow* (on `main`) offers one stage at a time. The default is the harmless one.

| Stage | Runs | Writes | Never |
|---|---|---|---|
| `check` (default) | preflight, then `db:migrate --check` | nothing: only `SELECT` and `PRAGMA foreign_key_check` | migrates, deploys, needs CI |
| `migrate` | CI, preflight, then `db:migrate` | the migrations | deploys |
| `deploy` | CI, preflight, `db:migrate --check --require-current`, then deploy + health check | the deployment | migrates; it stops unless the database is already fully migrated |
| `full` | everything, as a push does | both | |

Every stage that writes needs CI and the preflight to pass first, and only the head of `main` can be used. A run started
from any other branch does nothing.

**Concurrency and cancellation.** A push and the manual `migrate`, `deploy` and `full` stages share one queue
(`production-deploy`): one at a time, and a run that has started is never cancelled by a newer one. GitHub keeps only the
newest *waiting* run of a queue, so an older waiting run is replaced by a newer one; every run acts on the head of `main`
and stale runs refuse, so nothing is lost by that. The read-only `check` has its own queue (`production-check`): it cannot
replace a waiting production run and does not wait behind one. If you cancel a run, no job that has not yet started will
start (the conditions use `!cancelled()`, never `always()`), and a job whose upstream job failed, was skipped or was
cancelled does not run.

### What the safety checks refuse

- **`db:migrate`** refuses: missing or incomplete credentials when `--require-remote` is given (the pipeline always gives
  it, so a missing secret can never turn into "nothing to migrate" followed by a deployment); an `http://` address (only a
  loopback test endpoint may use it); a Vercel Preview build; a database that has tables but no CEFRO migration history
  (probably the wrong database); and a database whose migration history this code does not know (it is ahead of this
  version, or unrelated). None of these prints a credential, an address or a table name.
- **The Vercel check** refuses: a production branch other than `main`; an unknown production branch, unless GitHub reports
  that its default branch is `main` (Vercel then uses the default branch); database credentials that Preview or Development
  can read; Deploy Hooks; and a Vercel project that is not connected to this repository (see "Is it the right Vercel
  project?" below).
- **The deploy job** refuses to migrate, verify or deploy unless the checked-out files are exactly commit `GITHUB_SHA` and
  the working tree is clean (`scripts/ci/assert-checked-out-commit.mjs`; the Vercel CLI uploads the working tree). It takes
  the deployment URL out of the CLI's output with `scripts/ci/parse-deploy-url.mjs`, which accepts only a plain
  `https://<name>.vercel.app` line (extra output lines are ignored; any other host, a port, credentials, a path or empty
  output is an error that does not echo the output) before anything is written to `$GITHUB_OUTPUT`.
- **The running app** refuses, in a Vercel **Preview or Development** environment (`VERCEL_ENV`), to connect to Turso when
  it holds Turso credentials (unless `CEFRO_ALLOW_PREVIEW_TURSO=true`). That is enforced where the connection is opened,
  not only in scripts, so a variable ticked for the wrong environment cannot expose the production database to code nobody
  has reviewed or to a laptop that ran `vercel env pull` / `vercel dev`. Plain local development (no `VERCEL_ENV`; SQLite,
  or a Turso test database in `.env.local`) is not affected.

**Production and Preview are separate.**

| | Production | Preview |
|---|---|---|
| Trigger | push to `main` (or a manual run of the workflow, which still only uses the head of `main`) | any other branch and every pull request |
| Who deploys | the workflow, via the Vercel CLI | Vercel's Git integration, as before |
| Migrates the database | yes, in the *Migrate* job, after the checks | never (the build is `next build`; `db:migrate` refuses to run in a Vercel Preview build) |
| Has the Turso credentials | yes (Vercel: Production only; GitHub: the `production` environment only) | no; the pipeline refuses to continue if Vercel gives them to Preview, and a Preview that has them does not start (below) |
| Sees the GitHub secrets | yes | no (the workflow never runs for pull requests, and the environment is restricted to `main`) |

`vercel.json` switches off Vercel's own automatic deployment of `main` (`git.deploymentEnabled.main = false`). Without
that, Vercel would build and publish every push to `main` on its own, immediately and unmigrated, regardless of the
workflow. With it, the workflow is the only thing that deploys production.

**What a Preview does.** A Vercel Preview runs the production build (`NODE_ENV=production`), so the configuration check
(`src/server/config/boot-check.ts`) applies to it. At start-up it logs every problem (variable names only, never a
value); it is then enforced on every request that needs the configuration: every API route answers 503
`service_not_configured`, `/api/health` answers 503 "unavailable", and the app's pages (home, login, register, practice)
fail with HTTP 500, except in mock mode (`?mock=1`, below). It fails in either direction:

- *With Turso credentials* (a variable ticked for Preview by mistake): the check reports "Database credentials are
  present in a Vercel Preview or Development environment…" and everything that can reach the database is refused as
  above. The database initialisation (`getDb`) also refuses the same configuration before any network request, as a
  second layer.
- *Without credentials* (the intended setup): Vercel requires the hosted database (`validateDatabaseConfig`), so the
  same check fails ("required on Vercel…") and the same routes are refused.

**Mock mode: the whole app on a Preview with no variables (`?mock=1`).** Add `?mock=1` to an address and the page
shows demo data instead of the student's own: a demo student with six attempts on five Part 2 tasks (one failed with
no speech, one retry with its goal), a level, a biggest fix and an exam date 23 days away. Every demo result is for
its own task: a hand-written demo answer to that task (`src/features/demo/demo-answers.ts`) goes through the real
evaluation with the existing **mock evaluator** (no model call), in the real types; the dashboard, History and the
result page run their real code on them (`src/server/demo/demo-data.ts`). The mock evaluator is a crude keyword
heuristic, so the bands are demo values, not assessments.
Mock mode never reads or writes the database, reads no cookie or identity, calls no API and no AI provider, and skips
the configuration check, so it works on a Preview where every real page is refused. Every link inside it keeps
`?mock=1` (navigation, back links, task tiles, rows, filters, retries), so a tester cannot fall into a real page by
accident. Every mock page shows a demo label: "Demo mode. Your answer won't be scored." (task list and practice),
"Demo result. Your answer was not scored." (results), "Demo mode. These are example attempts, not yours." (dashboard
and History). Real pages never show it. In mock mode the exam date can be changed on the dashboard, but only on that
page (nothing is saved; a reload brings the demo date back), and the Account menu shows the demo account with no
sign-in or Log out.

What a Preview **with no environment variables** serves, checked on 2026-11-07 with a production build started the way
a Preview runs (`NODE_ENV=production`, `VERCEL=1`, `VERCEL_ENV=preview`, no other variables, a database path that
cannot be created): `npm run test:e2e:preview` (`playwright.preview.config.ts`, `e2e/mock-mode.spec.ts`).

**Mock URLs that work on a Preview (200):**

| Page | Address |
| --- | --- |
| Signed-out home, sign in, Create account | `/?mock=1`, `/login?mock=1`, `/register?mock=1` (nobody is looked up; the forms send nothing; "Try the demo" opens `/dashboard?mock=1`) |
| Task list | `/practice?mock=1` (every task opens its brief in mock mode; it was `/?mock=1` before `claude/entry-pages`) |
| Part 2 brief, then preparation, recording, Scoring… and the demo result | `/practice/speaking/<task id>?mock=1`, for all 7 tasks: `b2-part2-advice-from-someone`, `b2-part2-important-decision`, `b2-part2-goal-you-set`, `b2-part2-working-in-a-team`, `b2-part2-trying-and-failing`, `b2-part2-a-tradition`, `b2-part2-happy-day` |
| A retry with its goal | `/practice/speaking/<task id>?mock=1&retry=<demo key>` (a demo result of that task, e.g. `b2-part2-a-tradition?mock=1&retry=demo-5`; opened by "Retry with this goal" and "Start retry"), or `&retry=<saved run>&run=1..3` (the saved-runs prototype) |
| Part 1.1 / 1.2 (not live: real pages are 404, dashboard and home say "Coming soon") | `/practice/speaking/a2-part1-1-daily-life?mock=1`, `/practice/speaking/b1-part1-2-shopping?mock=1` (introduction → questions one by one → Scoring… → demo result; "Retry with this goal" keeps the goal: `?mock=1&retry=answer.<task id>`); results `/result?demo=answer.<task id>&mock=1` |
| A demo attempt's result, for its own task | `/result?demo=demo-1..6&mock=1` (opened from the dashboard and History rows) |
| The result of a mock practice of a task, and of its retry | `/result?demo=answer.<task id>&mock=1`, `/result?demo=retry.<task id>.<demo key>&mock=1` (opened by Finish, with `&state=scoring&next=1` first) |
| The saved-runs prototype ("Advice from someone" only) | `/result?mock=1`, `/result?mock=1&anchor=<saved run>&run=1..3`, `/result?mock=1&state=scoring\|too-short\|no-speech\|retry` (`/result` without `mock=1` is the same prototype; its links add it) |
| Dashboard | `/dashboard?mock=1` (`&flags=off` also works) |
| History | `/history?mock=1`, `/history?mock=1&part=2` |
| Static files | e.g. the task pictures `/tasks/*.svg` |

Start a tester at `/?mock=1` and "Try the demo" (or `/dashboard?mock=1`): the loop task list → brief → practice → result → retry →
dashboard → History clicks through without leaving mock mode. Only exactly `mock=1` counts (`mock=0`, `mock=true`
are real pages).

**Still refused on a Preview with no variables** (unchanged): every page without `?mock=1`: `/`, `/login`,
`/register`, `/practice`, the practice pages (HTTP 500, "CEFRO isn't available right now", the configuration check), `/dashboard`,
`/history`, `/result/<attempt id>` (500: the configuration check or the database); every API route (503
`service_not_configured`) and `/api/health` (503 "unavailable").

How mock mode reaches the task list and the signed-out pages: `/practice` sits in the `(site)` layout and `/`, `/login`,
`/register` in the `(entry)` layout; both run the configuration check, and a layout gets no query. `src/proxy.ts` therefore passes `?mock=1` on as the request header `x-cefro-mock: 1` (and removes one
sent by a browser); the layout skips the check only then. The pages themselves read `?mock=1`.

So to look at a branch on its Preview without a database, open `/?mock=1` (the signed-out home), then "Try the demo". (Until November 2026 a failed check made
the start-up hook throw, which made Next.js answer 500 on every route.)

**Which variables the check reports on a Preview with none set:** `TRANSCRIPTION_PROVIDER` and `EVALUATION_PROVIDER`
(they must be explicit on Vercel, see "AI providers" below), the key of each chosen provider (`GEMINI_API_KEY` with the
Gemini settings), `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` and `AUTH_SECRET`. `APP_URL` is not needed on Vercel: it is taken from
`VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` (`applyHostingDefaults` in `src/server/config/env.ts`).

So a Preview of this application is **not usable as a running app** unless it has its own database. That is deliberate:
the Preview is kept away from real data rather than half-working. If you want working Previews, create a **second** Turso
database for them, migrate it yourself (the pipeline does not touch it), give Preview its own `TURSO_*` values in Vercel,
and set `CEFRO_ALLOW_PREVIEW_TURSO=true` for Preview in Vercel and the repository variable `CEFRO_ALLOW_PREVIEW_TURSO=true`
in GitHub, to say that the Preview credentials are a different database. The same flag covers a Development environment.

### AI providers: the defaults, and how to switch to Gemini

The code's defaults (`src/server/config/env.ts`, also in `.env.example`) are **not** Gemini:

| Step | Variable | Default | Its key | Other choices |
|---|---|---|---|---|
| Speech-to-text | `TRANSCRIPTION_PROVIDER` | `openai` (model `OPENAI_TRANSCRIPTION_MODEL`, default `gpt-4o-transcribe`) | `OPENAI_API_KEY` | `gemini` (model `GEMINI_TRANSCRIPTION_MODEL`, default `gemini-3.8-flash`); `mock` (development only, refused in production) |
| Speech-to-text fallback | `TRANSCRIPTION_FALLBACK_PROVIDER` | `none` | the fallback's key | `openai`, `gemini` (must differ from the primary) |
| Scoring (the evaluator) | `EVALUATION_PROVIDER` | `anthropic` (model `ANTHROPIC_EVALUATION_MODEL`, default `claude-opus-5-5`) | `ANTHROPIC_API_KEY` | `gemini` (model `GEMINI_EVALUATION_MODEL`, default `gemini-3.8-flash`); `mock` (development only, refused in production) |
| Audio step (pronunciation, pausing) | `AUDIO_ASSESSMENT` | `auto`: Gemini when `GEMINI_API_KEY` is set and the evaluator is not the mock, else off | `GEMINI_API_KEY` | `gemini` (always), `off` (pronunciation "not assessed") |

**Scoring switches to Gemini with `EVALUATION_PROVIDER=gemini`** (and `GEMINI_API_KEY`). Speech-to-text switches with
`TRANSCRIPTION_PROVIDER=gemini`. Only the selected providers' keys are needed. The production setup below sets both to
`gemini`, so production needs only `GEMINI_API_KEY`.

**On Vercel both must be set explicitly.** The defaults above apply only off Vercel (local development, tests, a
self-hosted server). On Vercel (Production, Preview and Development: whenever `VERCEL` is set) a missing or empty
`TRANSCRIPTION_PROVIDER` or `EVALUATION_PROVIDER` is a configuration problem (`validateExplicitProviders` in
`src/server/config/provider-config.ts`), so a variable that was not ticked for an environment can never switch it to
another provider silently. At start-up the server logs, for each one:

```
{"level":"error","message":"must be set explicitly on Vercel: TRANSCRIPTION_PROVIDER=openai or TRANSCRIPTION_PROVIDER=gemini. The local default is not used there. Set it for this environment in the Vercel project settings.","variable":"TRANSCRIPTION_PROVIDER",…}
{"level":"error","message":"must be set explicitly on Vercel: EVALUATION_PROVIDER=gemini or EVALUATION_PROVIDER=anthropic. The local default is not used there. Set it for this environment in the Vercel project settings.","variable":"EVALUATION_PROVIDER",…}
{"level":"error","message":"Server not configured: API routes, the app's pages and /api/health refuse until this is fixed","variables":["EVALUATION_PROVIDER",…]}
```

and then refuses like any other configuration problem: every API route 503, the app's pages 500, `/api/health` 503, so
the production pipeline's post-deploy health check fails. It does **not** crash the server at start-up: a throwing
start-up hook makes Next.js answer 500 on every route, which would also take down the pages that need no
configuration (the `?mock=1` pages, the `/result` prototype). The defaults themselves are unchanged.

### One-time setup

Required:

1. **Create the Turso database** and a token for it (Turso dashboard or CLI). Treat the token as a password.
2. **GitHub → Settings → General → Default branch**: `main` (after `main` exists, see the first-rollout sequence).
3. **GitHub → Settings → Environments → New environment** `production`:
   - *Deployment branches and tags*: **Selected branches → `main`** only. This is what keeps every other branch (and any
     workflow edited on one) away from the secrets.
   - *Environment secrets* (not repository secrets, which every workflow can read):

     | Secret | Value |
     |---|---|
     | `TURSO_DATABASE_URL` | `libsql://<name>-<org>.turso.io` |
     | `TURSO_AUTH_TOKEN` | the Turso token, with write access |
     | `VERCEL_TOKEN` | a Vercel token (vercel.com → Account Settings → Tokens), scoped to the team that owns the project |
     | `VERCEL_ORG_ID` | the team/org id (the team's *Settings → General*; starts with `team_`) |
     | `VERCEL_PROJECT_ID` | the project id (*Project → Settings → General*) |

   Never paste them into a chat, an issue or a commit. GitHub masks them in logs, and the workflow passes them only to the
   steps that need them.
   - *Repository variable* (*Settings → Secrets and variables → Actions → Variables*; not a secret):
     `CEFRO_VERCEL_PROJECT_REPO` = `<owner>/<repo>` of this repository, **after** confirming in Vercel (*Project → Settings →
     Git*) that the project is connected to exactly that repository. See "Is it the right Vercel project?" below.
4. **Vercel → project → Settings**:
   - *Environments → Production → Branch Tracking*: `main`.
   - *Environment Variables*: `GEMINI_API_KEY`, `TRANSCRIPTION_PROVIDER=gemini`, `EVALUATION_PROVIDER=gemini`, `AUTH_SECRET`
     (32+ random characters, `openssl rand -base64 48`), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Tick
     `TRANSCRIPTION_PROVIDER` and `EVALUATION_PROVIDER` for every environment you deploy (Production and Preview): on
     Vercel they have no default (see "AI providers"). Mark the secrets
     *Sensitive*; never prefix any with `NEXT_PUBLIC_`. **Tick only *Production* for the two `TURSO_*` variables** (untick
     Preview and Development; edit them if they were set for all environments).
   - *Git → Deploy Hooks*: none.

Optional improvements:

- Protect `main` (*Settings → Branches*): require a pull request and the *Validate* checks, so the pipeline cannot be
  skipped by pushing straight to `main`, and so a migration's review line (see below) is a real review.
- *Required reviewers* on the `production` environment: a person approves each stage of each production run.
- A second Turso database for Previews (above).
- A Turso backup or point-in-time restore point before the first migration, if the database holds data.

Keep **Fluid Compute** enabled (default for new projects): the processing routes declare a 300-second limit.

### Is it the right Vercel project?

The Vercel project and organisation ids are secrets, so a wrong value would deploy this code into another project. The
preflight reads the project from the Vercel API and compares its Git link (`link.repoId`, or `link.org` + `link.repo`) with
this GitHub repository: a different repository is refused. **Not verified:** whether the real API response carries those
fields. Absence is never treated as success. If the response does not name the repository, the pipeline stops, unless the
repository variable `CEFRO_VERCEL_PROJECT_REPO` equals `<owner>/<repo>`, which records that you confirmed the connection in
the Vercel dashboard (the run then shows a warning saying it relies on that confirmation). The check cannot prove more than
the API shows: if you set the variable without looking, nothing can catch it.

### First rollout (safe sequence)

Do this once. Each step stops at the first problem and nothing after it has happened.

1. **Get the commits onto `main` while the pipeline is unarmed.** The push runs nothing (no CI, no migration, no deployment),
   and `vercel.json` stops Vercel from deploying `main` by itself. Do not push any other branch.
2. Do the one-time setup above (it can also be done before step 1).
3. **Run the workflow, stage `check`.** It verifies the preflight (secrets, Vercel project, production branch, credential
   scope), the connection, the token, and that the database is empty or already CEFRO's. Expected:
   `connected (read-only). 0 of 5 migrations applied, 5 pending`. It writes nothing.
4. **Back up if the database holds data.** The check stage refuses a database that has tables but no CEFRO migration history,
   so a database it accepts is either empty or already CEFRO's; for a CEFRO database with data, take a Turso backup first.
5. **Run stage `migrate`.** Expected: `db:migrate: OK. 5 migrations applied, foreign key check clean`. This is the first
   write to the database and is a single transaction.
6. **Run stage `deploy`.** It first confirms the database is fully migrated, deploys exactly the run's commit, and checks
   `/api/health` on the production domain.
7. Open the production URL and run through "How to validate" below.
8. **Arm the pipeline:** set `CEFRO_AUTO_DEPLOY` to `true`. From here on, every push to `main` runs the whole pipeline.

### When a deployment fails

The migration runs before the new release is live, so for a while the **previous release** runs on the **new** schema.

- **Migration succeeded, deployment failed:** Vercel keeps serving the previous production deployment, which now runs on
  the migrated database. This is safe only if the migration was backward compatible (see below). The pipeline run is red;
  fix the problem and run stage `deploy` (or push again). The migration is not repeated.
- **The health check failed:** the new release is live but cannot use its database (for example the credentials in Vercel
  point at a different database than the one the pipeline migrated, or the release is broken). **Nothing is rolled back,
  neither the release nor the database.** Restore the previous release with `vercel rollback` (or *Instant Rollback* in
  the Vercel dashboard). The previous release keeps working on the migrated database if the migration was backward
  compatible. The database stays migrated; rolling a schema back is a deliberate manual operation, never automatic.
- `GET /api/health` returns only `{"status":"ok"}` (200) or `{"status":"unavailable"}` (503). It needs no sign-in, shows no
  error text, version, address or data, and caches its answer for 5 seconds.

### Migration rules (the old release runs against the new schema)

Migrations are *backward compatible*: add tables, columns (nullable or with a default) and indexes first; remove or rename
things in a later release, once no running code uses them. CI helps (`scripts/ci/check-migrations.mjs`):

- applied migrations (0000–0004 and every later one once merged) are immutable; editing or deleting one fails the check,
- timestamps in `meta/_journal.json` must increase (Drizzle would silently skip an older one),
- a new migration containing `DROP`, `RENAME`, `DELETE FROM`, `TRUNCATE`, `PRAGMA foreign_keys`, `ADD … NOT NULL` without a
  default, `UPDATE`, `CREATE UNIQUE INDEX`, `CREATE TRIGGER` or a `CHECK` constraint fails unless it carries a
  `-- cefro:reviewed: <reason>` line.

**This is a text scan, not proof.** It cannot know what the running release reads or writes, how large the tables are, how
long a statement locks them, or whether existing rows break a new constraint. A file that passes is not thereby backward
compatible, and a review line is only as good as the review behind it (protect `main` so that a person actually gives
it). Treat the check as a tripwire that makes someone look at the risky kinds of change.

Migrations are tracked by Drizzle, so running the pipeline again re-applies nothing. The pending migrations run in one
transaction: a failed run leaves them unapplied. No step resets or deletes data.

### Running the migration by hand (rarely needed)

From a trusted machine, with the values exported in your shell (the script never prints them), and not while the pipeline
is running:

```bash
export TURSO_DATABASE_URL='libsql://<name>-<org>.turso.io'
export TURSO_AUTH_TOKEN='<token>'
npm run db:migrate -- --check --require-remote     # read-only report
npm run db:migrate -- --require-remote             # apply
```

On failure it prints the underlying reason (authentication, permission, network, address, database error) with
credentials redacted.

### What can still bypass the pipeline

- A person clicking *Redeploy*/*Promote* in Vercel, running `vercel --prod`, or creating a Deploy Hook (the pipeline
  refuses to continue if hooks exist, but cannot prevent someone creating one afterwards).
- Vercel's production branch set to something other than `main` (the pipeline checks and refuses to continue, but a push to
  that other branch would already have been deployed by Vercel).
- Pushing straight to `main` (the pipeline still runs and gates the deployment; protect the branch to require review).
- Running `npm run db:migrate` by hand with the production credentials.
- Two pipeline-external migrations at once: GitHub serialises the pipeline's runs, not a hand-run. A conflicting schema
  change then fails and rolls back, but a migration that only moves data could be applied twice.

## How it works on Vercel

| Concern | Behaviour |
|---|---|
| Database | `@libsql/client/web` over HTTPS (no native module, no websocket), one request timeout of `DATABASE_TIMEOUT_MS`. Drizzle schema and migrations are the same as local SQLite. |
| Selection | Both Turso variables set → hosted. Neither → local SQLite file (development). Only one → configuration error. On Vercel the hosted database is mandatory (the boot check and the build say so). |
| Recordings | Stored in table `recording_blobs` behind the `AudioStorage` interface; served only through the ownership-checked `/api/speaking/attempts/:id/audio`. No dependency on any function's filesystem. |
| Migrations | `npm run db:migrate` (`scripts/migrate.mjs`), run by the pipeline's *Migrate* job after the checks and before the deployment; idempotent; includes `PRAGMA foreign_key_check`; refuses to run in a Vercel Preview build. Running instances only verify the schema is current. |
| Errors | An unreachable or timed-out database is a retryable `503 database_unavailable`, never `404 attempt_not_found`. Database credentials are redacted from errors and logs. |
| Speech guard | Unchanged. ffmpeg comes from the `ffmpeg-static` binary, traced into the two processing routes. It runs before every Gemini transcription and fails closed. |
| Processing | The submit route stores the recording, then processing continues after the response (`after()`); the browser polls. No slow provider call runs inside a database transaction. |

## Real Turso validation: NOT RUN

The development environment had no Turso credentials and no outbound access to Turso, so the following has **not** been
observed and must not be assumed:

- the web client against the real service (authentication, latency of an attempt's ~20 statements),
- migrations 0000–0004 on the hosted engine, including the table rebuild in 0002 and `foreign_key_check`,
- foreign-key enforcement on hosted connections (the code relies on constraints; check with step 4 below),
- writing and reading a ~2 MB blob,
- contention between simultaneous instances.

Everything else is covered by tests that run the same code on local libSQL files (two connections to one file stand in for
two instances) and on a fake HTTP endpoint (client initialisation, bearer header, timeouts, redaction).

### How to validate once the variables are in Vercel

1. Follow the first-rollout sequence above: stage `check`, then `migrate` (it must print `db:migrate: OK. 5 migrations applied, foreign key check clean`), then `deploy` (it must print the production URL and `post-deploy-check: OK`).
2. Open the deployment URL, record an answer of at least ~30 seconds, and watch it complete. The function logs show
   `Provider configuration OK`, the database kind (`turso`), `Speech activity checked`, then completion.
3. Cross-instance check: submit several attempts, reload the page and open the history (requests land on different
   instances); play the recording back; sign up, sign out, sign in. Nothing may be "not found".
4. Foreign keys and blob integrity, from your own machine with the credentials exported in your shell (the commands do not
   print them):

   ```bash
   export TURSO_DATABASE_URL=...   # not in a file that is committed
   export TURSO_AUTH_TOKEN=...
   npm run db:migrate                      # idempotent: reports 5 migrations, foreign key check clean
   # In the Turso shell (turso db shell <name>):
   PRAGMA foreign_key_check;                                   -- expect no rows
   SELECT count(*), sum(size_bytes) FROM recording_blobs;      -- matches the number of attempts you made
   SELECT length(data) = size_bytes FROM recording_blobs;      -- all 1
   ```
5. Compare the first-byte time of an attempt submission and of a status poll with local development; hosted latency adds
   a round trip per statement.

If any step fails, send the error text (the app already redacts credentials) rather than the credentials.

## Platform limits to know

- Vercel rejects request bodies over **4.5 MB**. A browser recording of the 2-minute answer is well under that in
  Opus/WebM or AAC; a much longer or higher-bitrate recording is refused by the platform before the app sees it.
- The Speech Activity Guard needs no external service. Its decode adds about 0.1 to 0.5 seconds per attempt.
- Gemini is called from the function with the key from the environment; keys are never sent to the browser.
- Login rate limits are in memory per instance, so they are weaker across several instances.
- Recordings in the database add ~2 MB per attempt. Moving them to object storage later means adding another
  `AudioStorage` implementation and setting `AUDIO_STORAGE_PROVIDER`; nothing else changes.
