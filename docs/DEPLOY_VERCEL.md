# Deploying CEFRO to Vercel (test deployment)

This puts the current B2 Part 2 vertical slice on a public URL so it can be tried from a browser. It is a **test
deployment, not a production setup**: see "What is temporary" below.

## What you do (once, about five minutes)

1. **Import the project.** vercel.com → *Add New… → Project* → pick the GitHub repository
   `egamberdiyevu795-stack/cefro-app` (the repository is private, so Vercel asks to install its GitHub app; allow it for
   this repository). Framework (Next.js), build command and Node version are detected from the repository; change nothing.
2. **Add four environment variables** (*Settings → Environment Variables*, tick all environments: Production, Preview,
   Development) and then deploy:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini API key (mark it *Sensitive*) |
   | `TRANSCRIPTION_PROVIDER` | `gemini` |
   | `EVALUATION_PROVIDER` | `gemini` |
   | `AUTH_SECRET` | a random string of 32+ characters (`openssl rand -base64 48`); required, the app refuses to start healthy without it |

   Nothing else is required. The database and recording paths and the public origin (`APP_URL`) are derived from
   Vercel's own variables (`src/server/config/env.ts`, `applyHostingDefaults`); set `APP_URL` yourself only if you use a
   custom domain or sign in on an alias URL.
3. **Open the deployment URL.** A push of this branch to a connected project creates a *Preview* deployment (its URL is
   on the project's Deployments tab). If you want the stable production URL to serve this branch:
   *Settings → Environments → Production → Branch Tracking* → set the branch to `claude/zen-darwin-5vgl0z`.
   If the preview asks you to log in to Vercel, *Settings → Deployment Protection* controls that.

Keep **Fluid Compute** enabled (the default for new projects). The processing routes declare a 300-second limit, which a
Hobby project only allows with Fluid Compute. A typical attempt takes 15 to 30 seconds.

## What was changed for Vercel

| Problem on Vercel | Change |
|---|---|
| The project directory is read-only; only `/tmp` is writable | On Vercel (`VERCEL` is set) `DATABASE_PATH` defaults to `/tmp/cefro/cefro.db` and `AUDIO_STORAGE_DIR` to `/tmp/cefro/audio`. Explicit values always win. |
| No ffmpeg on the function image, but the Speech Activity Guard needs a decoder | `ffmpeg-static` (a static ffmpeg binary) is a dependency. The guard uses `FFMPEG_PATH`, else the ffmpeg on `PATH`, else that binary. It is traced into the two routes that process an attempt (`outputFileTracingIncludes`). **The guard is unchanged and still runs before Gemini for every real-provider request**; it fails closed if no decoder works. |
| Files read at run time are not shipped unless traced | The SQL migrations (`src/server/db/migrations`) are included for every route; `better-sqlite3` and `ffmpeg-static` stay external packages. |
| `APP_URL` is required in production and unknown before the first deploy | Derived from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` when not set. |
| Native `better-sqlite3` needs a matching Node ABI | `engines.node` is `22.x` (what CI uses). |
| A build-time tracing warning would have pulled the whole project into the function | The runtime-chosen ffmpeg path is marked `turbopackIgnore`; the traced size of the processing routes is about 93 MB (Vercel's limit is 250 MB). |

The boot check logs a warning when the database or recordings are in `/tmp`, so it is visible in the function logs that
storage is temporary.

## What is temporary (and not production)

- **The database is SQLite in `/tmp`.** `/tmp` belongs to one function instance. It is wiped on cold starts (after
  idle time), on every redeploy, and is not shared between instances. For one person testing, sequential requests
  normally reach the same warm instance, so the flow works; but an attempt, a practice session, an account or a history
  can disappear at any time, and a request that lands on another instance sees an empty database ("not found").
- **Recordings are in `/tmp`** with the same lifetime. They are not backed up and cannot be replayed after a cold start.
- **Accounts do not survive** a cold start for the same reason.
- **Usage limits and rate limits are per instance** (in memory / per database).
- Production-grade options (not done, would be a deliberate change): move the database to a hosted SQL service
  (Turso/libSQL, Neon Postgres) with an asynchronous data layer (the repositories currently use the synchronous
  `better-sqlite3` API, so this is a real migration, not a setting) and the audio to object storage (Vercel Blob or
  S3-compatible), **or** run the unchanged app on a host with a persistent disk (a VM, Fly.io volume, Railway or Render
  disk), which keeps SQLite and local audio as they are.

## Platform limits to know

- Vercel rejects request bodies over **4.5 MB**. A browser recording of the 2-minute answer is well under that in
  Opus/WebM or AAC; a much longer or higher-bitrate recording would be refused by the platform before the app sees it.
- The Speech Activity Guard needs no external service. Its decode adds about 0.1 to 0.5 seconds per attempt.
- Gemini is called from the function with the key from the environment; the key is never sent to the browser.

## Checking a deployment

Function logs (Vercel → Deployment → Logs) show: `Provider configuration OK`, the temporary-storage warning, and per
attempt `Speech activity checked` (verdict, active seconds, decode time). A blocked recording logs
`Attempt processing failed … transcription_empty` and no Gemini request is made for it.
