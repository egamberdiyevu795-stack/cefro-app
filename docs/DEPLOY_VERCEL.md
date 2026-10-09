# Deploying CEFRO to Vercel

CEFRO keeps its data (attempts, sessions, accounts, **and the recordings**) in a hosted libSQL database (Turso), so every
serverless function instance sees the same data. Once `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in Vercel, the
deployed app uses Turso automatically; nothing else in the code needs to change.

> **Status: implemented and tested locally, not yet validated against a real Turso database.** See "Real Turso
> validation: NOT RUN" below for what that means and exactly how to do it.

## Automatic deployment (GitHub Actions)

Nothing is deployed or migrated by hand. A push to `main` runs `.github/workflows/deploy.yml`:

```
push to main
  └─ Validate    lint, typecheck, tests (incl. migration tests), build, browser tests, migration safety   (CI, no secrets)
      └─ Preflight   secrets present · Vercel project settings safe · this commit is still the head of main
          └─ Migrate     npm run db:migrate against the production Turso database (idempotent, one run at a time)
              └─ Deploy      vercel deploy --prod of exactly this commit (Vercel builds it with `next build`)
```

Every stage needs the one before it. A failed check, a failed migration, a stale run or a bad Vercel setting stops
everything after it, so nothing is migrated before the checks pass and nothing is deployed before the migration succeeds.

**Production and Preview are separate.**

| | Production | Preview |
|---|---|---|
| Trigger | push to `main` (or a manual run of the workflow, which still only deploys the head of `main`) | any other branch and every pull request |
| Who deploys | the workflow, via the Vercel CLI | Vercel's Git integration, as before |
| Migrates the database | yes, in the *Migrate* job, after the checks | never (the build is `next build`; `db:migrate` refuses to run in a Vercel Preview build) |
| Has the Turso credentials | yes (Vercel: Production only; GitHub: the `production` environment only) | no. The workflow refuses to deploy if Vercel gives them to Preview or Development |
| Sees the GitHub secrets | yes | no (the workflow never runs for pull requests) |

`vercel.json` switches off Vercel's own automatic deployment of `main` (`git.deploymentEnabled.main = false`). Without
that, Vercel would build and publish every push to `main` on its own, immediately and unmigrated, regardless of the
workflow. With it, the workflow is the only thing that deploys production.

A Preview has no Turso credentials, so it shows the "database not configured" error instead of reading or writing real
data. That is deliberate. If you want working Previews, create a **second** Turso database for them, give Preview its own
`TURSO_*` values in Vercel, and set the repository variable `CEFRO_ALLOW_PREVIEW_TURSO=true` to tell the guard that the
Preview credentials are a different database. (Migrating that second database is then your decision; the pipeline does not
touch it.)

### One-time setup

1. **Create the Turso database** and a token for it (Turso dashboard or CLI). Treat the token as a password.
2. **Vercel project** (*Settings*):
   - *Environment Variables*: add `GEMINI_API_KEY`, `TRANSCRIPTION_PROVIDER=gemini`, `EVALUATION_PROVIDER=gemini`,
     `AUTH_SECRET` (32+ random characters, `openssl rand -base64 48`), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Mark the secrets
     *Sensitive*. Never prefix any of them with `NEXT_PUBLIC_`. **Tick only *Production* for the two `TURSO_*` variables**
     (untick Preview and Development); if they are already set for all environments, edit them.
   - *Git → Production Branch* (or *Environments → Production → Branch Tracking*): `main`.
   - Create a token: vercel.com *Account Settings → Tokens*, scope it to the team that owns the project.
   - Note the **Project ID** (*Settings → General*) and the **Team/Org ID** (the team's *Settings → General*, starts with `team_`).
3. **GitHub** (*Settings → Environments → New environment*): create `production`. Optionally add *Required reviewers* to
   approve each production deployment, and restrict *Deployment branches* to `main`. In that environment add these
   **environment secrets** (repository secrets of the same names also work, but are visible to every workflow):

   | Secret | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://<name>-<org>.turso.io` |
   | `TURSO_AUTH_TOKEN` | the Turso token |
   | `VERCEL_TOKEN` | the Vercel token |
   | `VERCEL_ORG_ID` | the Vercel team/org id |
   | `VERCEL_PROJECT_ID` | the Vercel project id |

   Never paste them into a chat, an issue or a commit. GitHub masks them in logs, and the workflow passes them only to the
   steps that need them.
4. **Recommended**: protect `main` (*Settings → Branches*): require a pull request and the *Validate* checks, so the
   pipeline cannot be skipped by pushing straight to `main`.
5. Get the code to `main` (merge the pull request). The first run migrates the database and deploys.

Keep **Fluid Compute** enabled (default for new projects): the processing routes declare a 300-second limit.

### Migration rules (the old release runs against the new schema)

The migration runs before the new release is live, so for a while the **previous release** runs against the **new**
schema (and for longer if the deployment fails after the migration). Therefore migrations are *backward compatible*:
add tables, columns (nullable or with a default) and indexes first; remove or rename things in a later release, once no
running code uses them. CI enforces it (`scripts/ci/check-migrations.mjs`):

- applied migrations (0000–0004 and every later one once merged) are immutable; editing or deleting one fails the check,
- timestamps in `meta/_journal.json` must increase (Drizzle would silently skip an older one),
- a new migration with `DROP`, `RENAME`, `DELETE FROM`, `TRUNCATE`, `PRAGMA foreign_keys` or `ADD … NOT NULL` without a
  default fails unless it carries a reviewed `-- cefro:destructive-approved: <reason>` line.

Migrations are tracked by Drizzle, so running the pipeline again re-applies nothing. The pending migrations run in one
transaction: a failed run leaves them unapplied. No step resets or deletes data.

### Running the migration by hand (rarely needed)

If you ever need to, from a trusted machine, with the values exported in your shell (the script never prints them):

```bash
export TURSO_DATABASE_URL='libsql://<name>-<org>.turso.io'
export TURSO_AUTH_TOKEN='<token>'
npm run db:migrate
```

Expect `db:migrate: OK. 5 migrations applied, foreign key check clean`. On failure it prints the underlying reason
(authentication, permission, network, address, database error) with credentials redacted. Do not run it while the
pipeline is running.

### What can still bypass the pipeline

- A person clicking *Redeploy*/*Promote* in Vercel, running `vercel --prod`, or creating a Vercel Deploy Hook.
- Vercel's production branch set to something other than `main` (the workflow checks and refuses to continue, but a push
  to that other branch would already have been deployed by Vercel).
- Pushing straight to `main` (the pipeline still runs and gates the deployment; protect the branch to require review).
- Running `npm run db:migrate` by hand with the production credentials.

Keep **Fluid Compute** enabled (default for new projects): the processing routes declare a 300-second limit. A typical
attempt takes 15 to 30 seconds.

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

1. Merge to `main`, open the *Deploy production* run in the Actions tab, and confirm the *Migrate* job printed `db:migrate: OK. 5 migrations applied, foreign key check clean` and *Deploy* printed the production URL.
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
