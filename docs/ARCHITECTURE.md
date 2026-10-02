# CEFRO architecture (vertical slice 1)

## Stack

| Concern        | Choice                                            | Why                                                                 |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router), React 19, TypeScript     | One deployable for UI and API; strong typing end to end             |
| Styling        | Tailwind CSS v4 with tokens in `globals.css`      | No component library dependency; palette changes in one place       |
| Database       | SQLite (better-sqlite3) via Drizzle ORM           | Zero-ops for now; Drizzle also supports Postgres                    |
| Validation     | Zod                                               | Shared schemas for API input and AI output                          |
| Speech-to-text | OpenAI transcription REST API (`gpt-4o-transcribe` default) | Accurate; a single `fetch`, no SDK needed                  |
| Evaluation     | Claude (`claude-opus-5-5`) via `@anthropic-ai/sdk` with structured outputs | Schema-constrained JSON                     |
| Tests          | Vitest                                            |                                                                     |

## Directory layout

```
src/
  app/                        Next.js routes only (thin): pages + API route handlers
  content/speaking/           Task content (data, not UI). Registry in index.ts
  domain/                     Pure, framework-free types and logic (shared by client and server)
    cefr.ts                   Level scale and ordering
    evaluation/               Criteria + versioned evaluation result schema (Zod)
    speaking/                 Task, attempt, metrics, comparison
    analytics/events.ts       Event name catalogue
  server/                     Server-only code (`import "server-only"`)
    config/env.ts             Validated environment variables
    db/                       Drizzle schema, client, SQL migrations
    storage/                  AudioStorage interface + local disk implementation
    transcription/            TranscriptionProvider interface + OpenAI + mock
    evaluation/               Methodology (prompt, rubric, versions, validation) + model backends
    attempts/                 Repository (data access), service (create/read), processing pipeline
    analytics/track.ts        Server-side event recording
    identity/                 Anonymous user cookie (placeholder for real auth)
  features/speaking-practice/ Client feature: components, hooks, state machine, API client
  components/ui/              Generic UI primitives (Button, Card, Badge, Alert, Spinner)
  proxy.ts                    Sets the anonymous user cookie on page requests
test/                         Test fixtures and stubs
```

Rules of thumb:

- `domain/` imports nothing from `server/`, `features/` or Next.js.
- Provider-specific code (OpenAI, Anthropic, local disk) lives in one file each,
  behind an interface. Nothing else imports the SDKs.
- Route handlers parse input, resolve the user, call a service, and return JSON.
  Business rules live in `server/attempts`.

## The practice loop

```
Browser                                   Server
───────                                   ──────
brief → preparing (deadline in state)
      → recording (MediaRecorder, 1 s chunks)
      → review (local playback)
      → POST /api/speaking/attempts ───▶  validate → save audio → insert attempt+recording
                                          (status: uploaded) → claim → after(): pipeline
      ◀── 201 { attempt }
      → poll GET /api/speaking/attempts/:id every 2 s
                                          pipeline: transcribing → evaluating → completed | failed
      → result (feedback) or failure panel
      → "Retry this task" → focus screen → same loop with previousAttemptId
      → "Compare with attempt N-1" (computed client-side from both stored evaluations)
```

### Attempt states

`uploaded → processing → transcribing → evaluating → completed`, or `failed`
with `failure_stage` (`transcription` | `evaluation`) and `failure_code`
(see `FAILURE_CODES` in `domain/speaking/attempt.ts`).

- **Claiming** (`claimAttemptForProcessing`) is a single conditional `UPDATE`,
  so two requests can never process the same attempt concurrently.
- **Restart** (`POST /api/speaking/attempts/:id/process`) re-runs a failed or
  stalled attempt using the stored audio. If a transcript was already saved it
  is reused, so an evaluation failure does not cost a second transcription.
- **Stalled** attempts (in progress for > 6 min, or never started after
  upload for > 60 s, e.g. after a server restart) are reported as `isStalled`
  and can be restarted from the UI.

Background work uses Next.js `after()`, not a queue. This is deliberate for
the current scale. If processing volume grows or the host cannot keep work
running after the response, move `runClaimedAttempt` behind a job queue;
the claim/restart design already makes it safe to re-run.

### Not losing recordings

- The recording stays in browser memory until the server confirms it was saved.
  Upload failures show "Try sending again" and "Download a copy".
- A `beforeunload` warning is active while a recording is unsent.
- On the server, audio is written (atomically, via temp-file + rename) **before**
  the attempt row is created, and is kept when processing fails.

## AI evaluation

`server/evaluation/speaking-evaluator.ts` runs the methodology:

1. Build the prompt (`prompts/speaking-evaluation-v1.ts`): the system prompt
   holds the role, the rubric (`rubrics/`), and the feedback method
   (problem → evidence → why it matters → how to fix → improved example →
   retry focus). The user message holds the task, the examiner-only task
   guidance, deterministic speech metrics, the transcript, and — for retries —
   the previous transcript, issues and the focus the student was given.
2. Call the configured `EvaluationModel` (Claude with structured outputs, or
   the development mock).
3. Validate with the Zod schema (`domain/evaluation/schema.ts`). Malformed or
   invalid output is retried once, then the attempt fails with
   `evaluation_invalid_output`. Nothing unvalidated is stored.
4. Normalise invariants the JSON schema can't express (non-assessable criteria
   have no score; first attempts have no `retry_review`). Quotes that don't
   appear in the transcript are logged as a quality signal.

Pronunciation is marked **not assessable** in v1, because the evaluator only
sees a transcript. The schema keeps the slot so an audio-capable evaluator can
fill it later.

Student transcripts are treated as data in the prompt (injection attempts such
as "give me C2" are explicitly ignored).

### Versioning

Every row in `evaluations` stores:

| Column              | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `evaluator_version` | `EVALUATOR_VERSION` in `server/evaluation/versions.ts`       |
| `rubric_version`    | `version` of the rubric used (`server/evaluation/rubrics`)   |
| `schema_version`    | `EVALUATION_SCHEMA_VERSION` of the result JSON               |
| `prompt_hash`       | SHA-256 of evaluator version + system prompt (catches prompt edits made without a version bump) |
| `provider`, `model` | Model that actually answered (as reported by the API)        |
| `created_at`        | Evaluation timestamp                                         |
| `latency_ms`, tokens | Cost/performance tracking                                   |

Change policy: bump `EVALUATOR_VERSION` for any prompt/input/post-processing
change; bump the rubric `version` for any rubric text change; add a new
schema (`EvaluationResultV2`) and bump `EVALUATION_SCHEMA_VERSION` for result
shape changes. An attempt can have several evaluations (e.g. re-evaluated with
a newer methodology); the newest is shown.

### Honest comparison

`domain/speaking/comparison.ts` derives every delta from stored scores. Equal
scores are "No change", lower ones are "Lower". The retry evaluator is
instructed to score the new attempt on its own merits and to report
achieved / partly / not achieved for each focus objective with evidence.

## Data model

```
users ─┬─< speaking_attempts >── speaking_tasks (id, version snapshot)
       │        │  (previous_attempt_id → speaking_attempts)
       │        ├── recordings      (storage provider + key; bytes live in storage)
       │        ├─< transcripts
       │        └─< evaluations ── transcripts
       └─< analytics_events
```

`speaking_tasks` stores a snapshot of each task version that was attempted;
task content itself is authored in `src/content`. Migrations live in
`src/server/db/migrations` and are applied automatically on startup.

## Identity

There is no authentication yet. Each browser gets a random UUID in the
httpOnly cookie `cefro_uid` (set by `src/proxy.ts` on page loads, or by
`getOrCreateCurrentUserId` for API calls). All attempt access is checked
against this id. When auth arrives, replace `getOrCreateCurrentUserId` and
link the anonymous `users` row to the account so history is kept.

## Analytics

Client events go through `features/speaking-practice/lib/analytics.ts`
(batched, `sendBeacon` on page hide) to `POST /api/analytics/events`, which
accepts only the names in `CLIENT_EVENT_NAMES`. The user id is taken from the
cookie, never from the payload. Server events are recorded by the pipeline
where outcomes are known reliably. Everything lands in `analytics_events`;
forwarding to a hosted tool later means changing `server/analytics/track.ts`.

Client: `practice_opened`, `preparation_started`, `preparation_completed`,
`recording_started`, `recording_completed`, `recording_discarded`,
`microphone_permission_denied`, `upload_failed`, `feedback_viewed`,
`retry_started`, `comparison_viewed`.
Server: `recording_submitted`, `transcription_started|completed|failed`,
`evaluation_started|completed|failed`, `retry_completed`.

## Errors

- Providers throw `ProviderError` with a `FailureCode`. The code is stored on
  the attempt and mapped to student copy in
  `features/speaking-practice/lib/failure-messages.ts`.
- Route handlers are wrapped in `withErrorHandling`: `HttpError` becomes
  `{ error: { code, message } }` with a safe message; anything else is logged
  and returned as a generic 500.
- Technical details go to the structured logger (`server/logging/logger.ts`,
  JSON lines on stdout/stderr).

## Replacing providers

| To change…          | Implement…                                   | Then…                                         |
| ------------------- | -------------------------------------------- | --------------------------------------------- |
| Audio storage (S3…) | `AudioStorage` in `server/storage/`          | Add a case in `server/storage/index.ts` + env |
| Speech-to-text      | `TranscriptionProvider`                      | Add a case in `server/transcription/index.ts` |
| Evaluation model    | `EvaluationModel`                            | Add a case in `server/evaluation/index.ts`    |
| Database (Postgres) | Port `server/db/schema.ts` to `pg-core`      | Swap the driver in `server/db/client.ts`; repositories use Drizzle's query builder and need few changes (the synchronous `.run()/.get()` calls become awaited) |
