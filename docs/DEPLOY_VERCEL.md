# Deploying CEFRO to Vercel

CEFRO keeps its data (attempts, sessions, accounts, **and the recordings**) in a hosted libSQL database (Turso), so every
serverless function instance sees the same data. Once `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in Vercel, the
deployed app uses Turso automatically; nothing else in the code needs to change.

> **Status: implemented and tested locally, not yet validated against a real Turso database.** See "Real Turso
> validation: NOT RUN" below for what that means and exactly how to do it.

## What you do (once)

1. **Create the database** (Turso dashboard or CLI): a database in a region close to your Vercel functions. Copy its
   URL (`libsql://<name>-<org>.turso.io`) and create an auth token for it. Treat the token as a password.
2. **Import the project** in Vercel (*Add New… → Project*, the GitHub repository). Framework, build command
   (`vercel-build`, which runs the migrations and then `next build`) and Node version come from the repository.
3. **Add the environment variables** (*Settings → Environment Variables*; mark the secrets *Sensitive*; never prefix any
   of them with `NEXT_PUBLIC_`):

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini API key |
   | `TRANSCRIPTION_PROVIDER` | `gemini` |
   | `EVALUATION_PROVIDER` | `gemini` |
   | `AUTH_SECRET` | a random string of 32+ characters (`openssl rand -base64 48`) |
   | `TURSO_DATABASE_URL` | `libsql://<name>-<org>.turso.io` |
   | `TURSO_AUTH_TOKEN` | the database auth token |

   Optional: `DATABASE_TIMEOUT_MS` (default 15000), `AUDIO_STORAGE_PROVIDER` (default `auto`: recordings in the database
   when Turso is configured), `APP_URL` (derived from Vercel's own variables unless you use a custom domain).
4. **Deploy.** The build runs `npm run db:migrate` against the hosted database first. If the variables are missing the
   build fails with a message naming them; if a migration fails (or leaves a foreign-key violation) the build fails and
   the previous deployment keeps serving. Credentials are never printed.

Keep **Fluid Compute** enabled (default for new projects): the processing routes declare a 300-second limit. A typical
attempt takes 15 to 30 seconds.

## How it works on Vercel

| Concern | Behaviour |
|---|---|
| Database | `@libsql/client/web` over HTTPS (no native module, no websocket), one request timeout of `DATABASE_TIMEOUT_MS`. Drizzle schema and migrations are the same as local SQLite. |
| Selection | Both Turso variables set → hosted. Neither → local SQLite file (development). Only one → configuration error. On Vercel the hosted database is mandatory (the boot check and the build say so). |
| Recordings | Stored in table `recording_blobs` behind the `AudioStorage` interface; served only through the ownership-checked `/api/speaking/attempts/:id/audio`. No dependency on any function's filesystem. |
| Migrations | Run by `vercel-build` (`scripts/migrate.mjs`), once per deployment, before the new code serves traffic; includes `PRAGMA foreign_key_check`. Running instances only verify the schema is current. |
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

1. Deploy and read the build log: it must contain `db:migrate: OK. 5 migrations applied, foreign key check clean`.
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
