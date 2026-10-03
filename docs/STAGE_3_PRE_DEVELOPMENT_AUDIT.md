# Stage 3 pre-development audit

Read-only audit of the repository at commit `a94ce16` (evaluator `speaking-evaluator/2.4.0`), done before any
Stage 3 work. Nothing in the product was changed: no feature, schema, evaluator, UI or configuration edit. Every
claim below cites a file, and where something could not be verified it says so.

How to read the ratings:

- **Stable** = works, tested, and safe to build on as it is.
- **Incomplete** = works for the current slice but is missing something later stages need.
- **BLOCKING / IMPORTANT / DEFERRED** are defined in section 11.

---

## 1. Executive summary

CEFRO is a small (about 12k lines including tests and docs), clean, well-layered vertical slice: **B2 Part 2 task →
preparation → recording → speech-to-text → AI evaluation → feedback → retry → comparison**, with one task, one
rubric, one recording per attempt, SQLite plus local-disk storage, and anonymous cookie identity.

What is solid:

- **Layering is real.** `domain/` (pure) → `server/` (providers, DB, pipeline) → `features/` (UI) → `app/` (thin
  routes). Providers sit behind interfaces; nothing else imports an SDK.
- **The evaluation pipeline is the strongest part.** Shared parse → schema → quality gate → one regeneration →
  versioned storage, real-validated on Gemini (14/14, section 5).
- **Failure handling is deliberate**: atomic claim of an attempt, restartable processing, transcript reuse, audio
  written before the DB row, stalled-attempt detection.
- **Quality bar of tests**: 159 unit tests (in-memory SQLite, fake providers, real-output regression cases), 5
  browser tests, and a separate live harness.

What is not ready to be extended blindly. The slice is Part 2-shaped **in the data model and in the evaluation
contract**, not just in the content:

1. A "task" is one question + prompts answered in **one recording**; there is no task type, no parent session, and
   the rubric is looked up by **level only** (`getSpeakingRubric(level)`) and written as a "long-turn / Part 2
   style" rubric.
2. Identity is a bearer cookie (`cefro_uid`) with a `users.kind` enum of one value. Attempt numbering is unique per
   `(user, task)`, which makes merging an anonymous history into an account a data-migration problem, not a
   column addition.
3. Nothing models a *session* (a sequence of tasks) or a *response* (one answer within an attempt), which Part 1 and
   mock tests need.

Short answer to the critical question (end of section 12): **yes, building Part 1, Part 3, auth, dashboard, progress and
mock tests directly on this codebase would create significant debt, but only if done in the wrong order.** Three
specific seams (task/rubric shape, session/response entity, identity merge) should be settled first; they are
small, and the rest of the architecture can be extended as is.

Verification at audit time: lint, typecheck, build, 159 unit tests and 5 browser tests all pass (section 10).
`npm audit --omit=dev` reported 0 vulnerabilities.

---

## 2. Current architecture

### 2.1 Map

| Area | Where | What exists | Stable | Incomplete | Later features depending on it |
|---|---|---|---|---|---|
| App/routing | `src/app` | `/` (static task list), `/practice/speaking/[taskId]` (dynamic), 6 API routes, `proxy.ts` | Routes are thin and typed (`RouteContext`, `PageProps`) | Single route shape `speaking/[taskId]`; header has only a logo (`layout.tsx`); no history/dashboard/settings routes | Navigation, dashboard, mock tests, auth pages |
| Components | `src/features/speaking-practice/components` (19), `src/components/ui` (5) | Presentational panels per phase; `PracticeExperience` (380 lines) wires state, side effects and analytics | UI primitives (`Button`, `Card`, `Badge`, `Alert`, `Spinner`) are small and token-based | Feature components assume 5 fixed criteria and one question + prompts | Part 1/3 UI, shared design system |
| Hooks | `features/.../hooks` | `useAudioRecorder`, `useAudioLevel`, `useDeadline`, `useAttemptPolling` | Recorder/deadline hooks are generic | Polling is per attempt with a fixed interval | Mock tests (timers, many recordings) |
| State | `lib/practice-machine.ts` | Pure reducer, deadlines stored as absolute `endsAt`, 5 reducer tests | Good model for one task | Models exactly one task in one phase; no multi-task sequence | Mock tests, timed practice |
| API client | `lib/api-client.ts` | Typed fetch with timeouts and error kinds | Stable | Cookie only (`credentials: same-origin`) | Auth |
| Domain | `src/domain` | CEFR scale, criteria, evaluation schema v1/v2 + stored-version upgrade, metrics, comparison, attempt types, analytics names | Pure, framework-free, well tested (comparison 14, metrics 6) | `SPEAKING_CRITERIA` and schema v2 are a fixed 5-criterion contract | Part 1/3 rubrics, progress |
| Server | `src/server` | attempts (repo/service/processing/views), evaluation, transcription, storage, db, identity, analytics, logging, config | See per-area rows below | See below | everything |
| Providers | `server/evaluation`, `server/transcription`, `server/storage` | Interfaces plus implementations, test overrides (`set…ForTesting`) | Evaluation: Gemini real-validated. Interfaces are clean | OpenAI STT and Anthropic not real-validated; only `local` storage | Deployment, STT validation |
| Database | `server/db` | Drizzle + better-sqlite3, 2 migrations, runtime migrate on first use | Conventions are consistent (UUID ids, ISO timestamps, JSON for payloads) | SQLite only; migrations located via `process.cwd()` | Accounts, progress, subscriptions |
| Storage | `server/storage` | `AudioStorage` interface, `LocalAudioStorage` (atomic write, key allow-list) | Interface is the right seam | One implementation | Production deployment |
| Identity | `server/identity`, `proxy.ts` | Random UUID cookie, `users` row created on first API call | Ownership checks are consistent (`getOwnedAttempt`) | Bearer cookie, no accounts (section 6) | Auth, subscriptions, teachers |
| Analytics | `domain/analytics`, `server/analytics`, `features/.../lib/analytics.ts` | 11 client + 8 server events into `analytics_events` | Allow-listed names, cookie-derived user id, size-limited properties | No session id, best-effort client delivery (section 8) | Funnels, streaks, subscriptions |
| Errors | `server/errors.ts`, `server/http.ts` | `ProviderError` → stored failure code → friendly copy; `HttpError`; `withErrorHandling` | Good: no technical detail reaches the browser | Failed evaluations record no token usage (section 5) | Cost control |
| Config | `server/config/env.ts` | Zod-validated env, lazy | Clear, documented in `.env.example` | Provider keys are checked only when an attempt is processed (section 11) | Deployment |
| Tests | `src/**/*.test.ts`, `test/`, `e2e/` | See section 10 | Strong at domain/evaluation | No route-level, migration or component tests; no CI for the normal suite | All stages |
| Deployment | `next.config.ts`, `docs/ARCHITECTURE.md` | Node host with persistent disk assumed and documented | Honest documentation | Not deployable on serverless as is (section 7) | Production |

### 2.2 Request flow (verified in code)

`POST /api/speaking/attempts` validates (Content-Length pre-check, MIME allow-list, magic-byte sniff, 20 MB) → saves
audio → inserts attempt + recording in one transaction → `claimAttempt` (conditional `UPDATE`) → `after(() =>
runClaimedAttempt)` → client polls `GET /api/speaking/attempts/:id`. `runClaimedAttempt` reuses a stored transcript
when one exists, never throws, and stores failures as `failure_stage` + `failure_code`.

---

## 3. Data model

Schema: `src/server/db/schema.ts`; migrations `0000_initial` and `0001_stage2_quality_observability`. The audit
asked about a `model_calls` table: **there is none.** `model_calls` is an integer column on `evaluations`. Per-call
detail lives inside the `quality_report` JSON. There are exactly **seven tables**: `users`, `speaking_tasks`,
`speaking_attempts`, `recordings`, `transcripts`, `evaluations` and `analytics_events`.

### 3.1 Tables

| Table | Purpose | Important fields | Relationships | Indexes / constraints |
|---|---|---|---|---|
| `users` | One row per identity | `id`, `kind` (enum: `anonymous` only), `created_at` | Referenced by `speaking_attempts.user_id` | PK only |
| `speaking_tasks` | Snapshot of each task version that was attempted (content authored in `src/content`) | `id`, `version`, `level`, `part`, `title`, `content` (full task JSON, including `evaluatorGuidance`) | **No foreign key points to it**; attempts hold `task_id` + `task_version` as plain columns | Unique `(id, version)` |
| `speaking_attempts` | One attempt at one task | `user_id`, `task_id`, `task_version`, `attempt_number`, `previous_attempt_id`, `retry_focus` (JSON), `status`, `failure_stage/code`, `processing_*`, `metrics` (JSON) | `user_id → users`; `previous_attempt_id` is **not** a foreign key | Unique `(user_id, task_id, attempt_number)`; index `(user_id, task_id)` |
| `recordings` | Reference to stored audio | `storage_provider`, `storage_key`, `mime_type`, `size_bytes`, `duration_ms` | `attempt_id → attempts` | Unique `(attempt_id)` → **one recording per attempt** |
| `transcripts` | STT output | `provider`, `model`, `text`, `language`, `latency_ms` | `attempt_id → attempts` | Index `attempt_id` (1:N allowed) |
| `evaluations` | Versioned AI result | `evaluator_version`, `rubric_version`, `schema_version`, `prompt_hash`, `provider`, `model`, `model_config`, `model_calls`, `quality_report`, `overall_level`, `result` (JSON), `latency_ms`, token counts | `attempt_id`, `transcript_id` | Index `attempt_id` (1:N allowed; latest by `created_at` is shown) |
| `analytics_events` | Append-only events | `name`, `source`, `user_id`, `task_id`, `attempt_id`, `properties` (JSON), `occurred_at` | None enforced (ids stored as plain text) | Indexes on `name` and `user_id` |

Things that are sound and worth keeping: versioning columns on every evaluation, task snapshots (what the student
actually saw), JSON only for payloads that are never filtered on, `overall_level` promoted to a real column, and
transcripts/evaluations being 1:N so re-evaluation is possible without migration.

### 3.2 Can the structure support the future?

| Future feature | Verdict | Evidence and what would change (future migrations only; **none made now**) |
|---|---|---|
| **Part 1** (several short questions) | **Not as is** | `recordings` is unique per attempt and an attempt targets one `task_id`. Needs a per-answer entity (e.g. `responses`: attempt → question index → recording/transcript), or one task that contains an ordered list of questions with one recording per question. |
| **Part 3** (discussion/opinion) | **Mostly** | One question + prompts + one recording fits the table shape. The problem is the evaluation contract and rubric (section 4), not the tables. |
| **Full mock tests** | **No** | No parent entity. Needs e.g. `practice_sessions` (id, user, kind, status, started/finished) and `session_id` on attempts; ordering and timing rules live there. |
| **Attempt history** | **Yes for one task**, partial overall | `listAttemptsForUserTask` only; no query across tasks. Add index `(user_id, created_at)` before a history page. |
| **Progress tracking** | **Mostly** | Scores and levels exist per evaluation. `overall_level` is queryable; per-criterion scores are inside JSON (fine for display, awkward for trends). Cross-version comparability of scores is a known limitation (evaluator 2.1.0 to 2.4.0 changed behaviour). Likely needs a derived `attempt_scores` table or view. `level`/`part` are not columns on attempts (only on the snapshot, with no foreign key). |
| **User accounts** | **No (needs a data migration, not just columns)** | See section 6: unique attempt numbering and the one-value `kind` enum. |
| **Subscriptions** | **Not present** | No plan/entitlement/usage tables. Usage metering needs token and call counts, but **failed evaluations store no usage** (only the success path writes `input_tokens`/`output_tokens`). |
| **Teacher functionality** | **No** | No organisation/class/ownership tables, and every read is a hard-coded `attempt.userId !== userId` check (`attempt-service.ts`, also inside `createAttempt` for retries). Teachers need an authorization layer, not more `if`s. |

### 3.3 Specific data-model findings

- `speaking_attempts.task_id/task_version` has **no foreign key** to `speaking_tasks`, and `previous_attempt_id` has
  none to `speaking_attempts`. SQLite foreign keys are on (`client.ts`), so adding them later needs a table
  rebuild. Cheap to fix before real data exists.
- `ensureTaskSnapshot` uses `onConflictDoNothing`. If a task is edited without bumping `version`, the stored
  snapshot silently keeps the **old** content. Nothing detects this.
- The retry check in `createAttempt` says the previous attempt must be "evaluated", but the code only checks
  ownership and task; when there is no evaluation, `retryFocus` is silently `null`.
- Attempt number is `max + 1` inside a transaction; the unique index protects correctness, but a concurrent insert
  would surface as a 500 rather than a clean conflict. Low risk at current scale.

---

## 4. Practice-engine extensibility

**Verdict: content-driven for tasks of the same shape, hard-wired to the long-turn shape everywhere else.** Adding a
second B2 Part 2 task is a data change (one file in `src/content/speaking`, one line in the registry
`content/speaking/index.ts`). Adding Part 1 or Part 3 is not, for the reasons below.

### 4.1 Where the shape is fixed (evidence)

| Assumption | Where |
|---|---|
| A task = one `question` + `prompts[]` + one `speakingSeconds`. No type discriminator. | `domain/speaking/task.ts` |
| Rubric lookup is by **level only**; one rubric whose text says "long-turn / Part 2 style tasks" | `server/evaluation/rubrics/index.ts` (`getSpeakingRubric(level)`, `RUBRICS: Record<level, Rubric>`) |
| Prompt template: "CEFR ${level} Speaking Part ${part}" is interpolated, but the whole methodology (task points → `task_coverage`, "your next 2-minute answer", "realistic B2 level") is long-turn and B2 | `prompts/speaking-evaluation-v2.ts`; `domain/evaluation/schema.ts` (`describe(...)` strings say "B2" and "2-minute") |
| Fixed 5 criteria in the result contract | `domain/evaluation/criteria.ts`, `schema.ts` (`criteria: {…5 keys}`), `comparison.ts` |
| Score → level table duplicated | `quality-gate.ts:406` (`SCORE_LEVELS`), `mock-evaluation-model.ts:187`, plus the rubric text band table |
| One recording per attempt; metrics computed against `task.speakingSeconds` | `recordings_attempt_uq`; `computeSpeechMetrics(text, durationMs, task.speakingSeconds)` |
| Single-task UI machine | `practice-machine.ts` (`PracticePhase` for one task) |
| B2/Part 2 copy in the UI | `ProcessingPanel.tsx:10` ("Evaluating against the B2 rubric"), `ReviewPanel.tsx:30` ("At B2, examiners expect…"), `PracticeExperience.tsx:30` (comment) |
| URL space | `/practice/speaking/[taskId]` (works, but the home page lists every task flat: `app/page.tsx`) |

### 4.2 Can the architecture support each capability?

| Capability | Today | Gap |
|---|---|---|
| Part 1 | No | Multi-question, short answers: needs a response entity and a rubric for short turns |
| Part 2 | Yes | none |
| Part 3 | Partly | Same tables; needs rubric and prompt for opinion/discussion, probably different criteria emphasis |
| Other CEFR levels | Partly | `TargetLevel` already includes A2/B1/B2/C1, and `getSpeakingRubric` throws clearly for a missing level; but rubric text, prompt wording and schema descriptions say "B2" |
| Different task types | No | No `type` on `SpeakingTask`, no per-type rubric, no per-type UI |
| Timed practice | Yes | Preparation and speaking times are task data; the deadline model is sound |
| Mock exams | No | No session entity, no multi-task state machine, no scoring roll-up |
| Retry sessions | Yes | Works end to end, tested live and in the browser |
| Multiple attempts | Yes | Numbering and history work per task |
| Task-specific rubrics | No | Rubric keyed by level; needs `(level, part/format)` and a version recorded per task |

### 4.3 What is genuinely good here

`SpeakingTask` already versions content, separates `evaluatorGuidance` from the public task (`toPublicTask`
destructures explicitly), and `content/speaking/index.ts` is documented as the seam for a CMS or DB. The rubric
version is stored on every evaluation. The practice machine is pure and tested. These do not need rework.

---

## 5. Evaluation architecture (after 2.4.0)

### 5.1 Components

| Piece | Where | State |
|---|---|---|
| `EvaluationModel` interface | `server/evaluation/types.ts` | Clean. `evaluate(prompt, input)` returns **raw** output; everything after is shared |
| Gemini | `gemini-evaluation-model.ts`, `gemini-json-schema.ts` | **Real-validated** (5 live runs, 14 synthetic answers each). Pinned `gemini-3.8-flash`. 24 + 5 unit tests with a fake HTTP layer |
| Anthropic | `anthropic-evaluation-model.ts` | Implemented, 6 unit tests, **not real-validated**. It is also the **default** `EVALUATION_PROVIDER` in `env.ts` |
| OpenAI (transcription) | `transcription/openai-transcription.ts` | Implemented, 6 unit tests, **not real-validated** (no key; `test/live/transcription.live.test.ts` exists and is unrun) |
| Mock | `mock-evaluation-model.ts`, `mock-transcription.ts` | Refused when `NODE_ENV=production`; results labelled in UI |
| Schema | `domain/evaluation/schema.ts` | v2 current; v1 upgraded for display by `stored.ts` (4 tests) |
| Quality gate | `quality-gate.ts` (417 lines) | 38 tests (incl. calibration cases from verbatim Gemini output). Provider-independent |
| Regeneration | `speaking-evaluator.ts` | `MAX_MODEL_CALLS = 2`; for schema-invalid, provider-reported unusable, and gate-rejected drafts |
| Versioning | `versions.ts`, `evaluations` columns | Evaluator, rubric, schema, `prompt_hash`, provider, actual model, `model_config`, `model_calls` |
| Comparison | `domain/speaking/comparison.ts` | Pure, 14 tests. "Clear" needs a 2+ point criterion change |
| Retry focus | schema `retry_focus` (+ `addresses_issue`), gate link checks, `retry_review` repair against metrics | Real-validated; the numeric repair fired live in run 5 |

### 5.2 Architectural risks for future evaluator changes

1. **`prompt_hash` covers less than it implies.** It is `sha256(EVALUATOR_VERSION + system prompt)`
   (`speaking-evaluator.ts`). The rubric is inside the system prompt, so rubric edits are caught, but the **user
   message template and the task's `evaluatorGuidance`** are not hashed. A change to either is invisible unless
   someone remembers to bump `EVALUATOR_VERSION`.
2. **The result contract is welded to Part 2.** Schema v2 (five fixed criteria, `task_coverage` by prompt, B2 wording
   in field descriptions that are sent to the model), the gate (`taskPromptCount`, example-length rules) and the
   comparison all assume it. A new part with different criteria means schema v3 plus `stored.ts` upgrade plus gate
   and UI changes, or a parallel evaluator. The architecture allows both (schema versioning is already designed
   for it); it just has not been decided.
3. **No `part`/format in the rubric key** (section 4): two parts at the same level cannot have different rubrics
   without changing `getSpeakingRubric`'s signature and every caller.
4. **Failed evaluations leave no trace in the database.** Rejected drafts are attached to the thrown `ProviderError`
   `details` and deliberately not logged, so for a production failure they are lost; tokens spent on failed or
   regenerated-then-failed calls are not recorded anywhere (`saveEvaluationAndComplete` is the only writer). That
   matters for cost accounting and for debugging gate regressions on real traffic.
5. **Score comparability across evaluator versions.** Scores from 2.1.0 to 2.4.0 are stored with their version,
   but a progress chart that mixes them will show methodology noise as progress. `comparison.ts` already exposes
   `methodologyChanged`; any future aggregate view needs the same discipline.
6. **Duplicated provider knowledge.** `DEVELOPMENT_PROVIDERS = new Set(["mock"])` in `attempt-views.ts` repeats what
   `EvaluationModel.isDevelopmentProvider` already says; the flag is not stored on the evaluation row.
7. **Default provider is the unvalidated one.** `EVALUATION_PROVIDER` defaults to `anthropic` and the default model
   is `claude-opus-5-5` (`env.ts`), while the real-validated path is Gemini.
8. **Gate thresholds were tuned on Gemini output only** (documented in `AI_EVALUATION_QUALITY.md`); a different
   model may need recalibration.
9. **Pipeline timing is not self-consistent in the worst case.** Defaults: transcription 90 s +
   `2 × 180 s` evaluation calls = up to 450 s. The route's `maxDuration` is 300 s and an attempt is declared
   stalled after 6 minutes (`PROCESSING_STALE_AFTER_MS = 360 s`), after which a second run may claim it. Observed
   latency (about 15 s average, 32 s worst) is far below this, so it is a theoretical edge, but the numbers should
   be made consistent when timeouts are next touched.

None of these require changing evaluator behaviour now.

---

## 6. Identity and authentication

### 6.1 What exists

`proxy.ts` sets a random UUID in the httpOnly, `SameSite=Lax`, 1-year cookie `cefro_uid` on page loads;
`getOrCreateCurrentUserId` (`server/identity/anonymous-user.ts`) validates it, inserts a `users` row, and every
route handler calls it. All attempt access goes through `getOwnedAttempt` (other users' attempts are "not found",
tested). The identity seam is a single function, and the code comments say so.

### 6.2 Can it migrate cleanly?

| Need | Assessment |
|---|---|
| Google login / email or magic link | Needs new tables (identities/credentials, sessions) and a new `getCurrentUser`. The single seam makes the swap cheap. |
| Persistent accounts | `users.kind` is `enum ["anonymous"]`; a new kind and a way to attach an identity to an existing row is required. The design comment ("accounts attach to these rows rather than replace them") is sound for the **first** device. |
| Multiple devices | The hard case. A user who practised anonymously on a phone and on a laptop has **two `users` rows**. Merging them collides on `unique(user_id, task_id, attempt_number)` (both will have an attempt 1 for the same task) and on the derived "attempt N-1" comparison logic. Needs a renumbering or "merge" migration plus a policy for `previous_attempt_id` chains. Audio keys embed the old `user_id` (`speaking/${userId}/…`) but are stored in the DB, so they survive a merge. |
| Subscription ownership | Must attach to an account, not to an anonymous cookie id. Nothing exists. |
| Progress sync | Follows from the merge: once histories are merged, reads are by `user_id` and already work. |
| Security properties | **The cookie UUID is the credential**: anyone who obtains the value owns that history for up to a year. Fine for anonymous practice, not for paid or teacher data. |

### 6.3 Verdict

Migratable, but **the merge strategy must be decided before accounts are built**, not during. That is a design
decision plus one migration, not a rewrite. Authorization is currently scattered equality checks, so teacher
access should come with a small policy function rather than more inline comparisons.

---

## 7. Storage and deployment

| Question | Answer (evidence) |
|---|---|
| Is SQLite suitable only for local/single-server use? | **Yes.** `better-sqlite3` is a native, synchronous, file-based driver (`server/db/client.ts`, `serverExternalPackages` in `next.config.ts`). WAL helps single-host concurrency; it does not give multi-instance writes. Drizzle supports Postgres, but repositories use the synchronous `.run()/.get()/.all()` API, so a port means awaiting every call and converting the transaction usage. |
| Do recordings need a persistent disk? | **Yes.** `AUDIO_STORAGE_PROVIDER` accepts only `local` (`env.ts`), `LocalAudioStorage` writes under `AUDIO_STORAGE_DIR`. |
| What breaks on serverless/ephemeral hosting? | (1) The database file and audio vanish between invocations. (2) `MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations")` assumes the source tree exists at runtime; this is **not verified** on any platform, but it will not hold in a trimmed output bundle. (3) `after()` only lives as long as the platform's `maxDuration` (Next docs: `after` "will run for the platform's default or configured max duration of your route"); on serverless it additionally needs the platform's `waitUntil`. (4) The native SQLite module needs a build for the target OS. |
| Needed for a real production deployment | Hosted relational DB (or a single node with a backed-up volume), object storage behind `AudioStorage` (S3/R2/GCS), a migration step in the deploy pipeline instead of first-request migration, provider key presence checks at boot, rate limits, security headers, backups, log shipping. |
| Should object storage be introduced? | **Yes, before production**, not before Stage 3 features. The interface (`save/read(key)`) is the right shape; storing `{provider, key}` per recording means old rows keep working. It currently reads whole files into memory (`Buffer`), acceptable for 20 MB. |
| Can the pipeline work asynchronously? | **It already is asynchronous** for the browser (upload returns 201, client polls), and claim/restart is idempotent, so it is safe to re-run. But the worker is the web process (`after()`), with no queue, no retry policy, and recovery only by manual "restart" or the stalled check. For production with several instances or unreliable hosts, move `runClaimedAttempt` behind a job queue (as `ARCHITECTURE.md` already says). |

Other deployment-relevant observations:

- **Upload memory cap is only a header check.** `POST /api/speaking/attempts` rejects on `Content-Length`, but when
  the header is absent the declared length is read as 0 and `request.formData()` buffers the whole body before
  the 20 MB check in `createAttempt`. Not verified against Next's own body limits for route handlers; treat it as a
  gap to close with a streaming size limit or reverse-proxy limit.
- **No rate limiting anywhere.** Attempt creation and `POST …/process` call paid APIs. An anonymous caller can
  discard the cookie to get a fresh identity, and a failed attempt can be restarted indefinitely
  (`claimAttemptForProcessing` has no cap on `processing_runs`).
- **No security headers or CSP** configured (`next.config.ts` is minimal).
- **No CI workflow for the normal suite**: `.github/workflows/` contains only `live-evaluation.yml`.

---

## 8. Analytics

### 8.1 What exists

`domain/analytics/events.ts` (11 client, 8 server names); names are allow-listed in the ingest route (the zod enum
is built from `CLIENT_EVENT_NAMES`, so adding a name is one line); user id comes from the cookie; properties are
flat scalars, at most 20 per event and strings ≤ 500 chars. Server events come from the pipeline; the `track`
function is the documented seam for forwarding to a hosted tool.

### 8.2 Coverage of the requested future events

| Future event | Existing | Gap |
|---|---|---|
| `onboarding_started/completed` | none | No onboarding exists |
| `practice_started` | `preparation_started` / `recording_started` | Naming only; no session |
| `answer_recorded` | `recording_completed` (client) and `recording_submitted` (server) | Naming only |
| `feedback_viewed` | yes | Add attempt number and level |
| `retry_started` / `retry_completed` | yes | `retry_started` carries the *previous* attempt id; completion is server-side only |
| `mock_started/completed`, `session_completed` | none | Needs a session id first |
| `streak_started/extended` | none | Needs a user-timezone concept and server-side derivation, not a client event |
| `subscription_started/cancelled` | none | Must be server-side from billing webhooks and tied to an account id |

### 8.3 Missing properties and structural gaps that will matter

- **No `session_id`** (or any grouping key) on events, so funnels across a multi-task session cannot be built.
- **No anonymous-to-account link.** `user_id` is the cookie id; after login the same person has events under two
  ids unless the merge (section 6) also rewrites or aliases them.
- **No `level`, `part`, `task_type`, attempt number or evaluator version as first-class columns** (some are inside
  `properties`, inconsistently between events).
- **No app version/platform/locale** on events.
- **Client delivery is best effort and lossy**: events are queued in memory, sent once (`sendBeacon`/`fetch`), and
  dropped on failure; there is no client event id, so de-duplication is impossible if retries are ever added.
  Client funnel counts will therefore under-report. Anything money-related must be server-side.
- **Indexes**: only `name` and `user_id`; no `occurred_at` index, which dashboards and retention queries will want.
- Ownership of client-supplied `attemptId` is not checked at ingest (events are advisory, so this is acceptable).
- Failed evaluations store no usage (section 5), so cost analytics based on events or rows would miss spend.

None of this is an architectural bug today; do not add events yet.

---

## 9. UI/UX architecture

No redesign proposed; observations only.

| Check | Finding |
|---|---|
| Design tokens | Good: palette and semantic colors are tokens in `app/globals.css` (`@theme inline`), and **no hex colors appear in components**. |
| Hard-coded colors | One leak: `components/ui/Button.tsx:11` uses `hover:bg-red-700` instead of a token. |
| Typography/spacing | No type-scale tokens; sizes and spacing are chosen ad hoc per component with Tailwind utilities. No arbitrary values (`text-[13px]`) were found, so drift is low today. |
| Dark mode | None (`dark:` not used). Not needed now; tokens make it feasible later. |
| Shared primitives | Only five (`Button`, `Card`, `Badge`, `Alert`, `Spinner`). Feature components such as `ScoreBar`, `LevelMeter`, `CountdownRing`, `TaskHeader`, `TaskQuestion` are generic enough to move to a shared layer when a second feature (dashboard) needs them. |
| Duplicated UI logic | Not evident at this size. The one large file is `PracticeExperience.tsx` (380 lines) that wires reducer, recorder, polling, history and analytics; it is the file most likely to be copied for Part 1/3, so extracting the generic "recording session" pieces would be sensible then. |
| Part 2 assumptions in copy | `ProcessingPanel.tsx:10`, `ReviewPanel.tsx:30`. |
| Navigation scalability | Header is a logo only (`layout.tsx`); home page is a flat task grid; there is no per-user history across tasks (history is inside the practice view). Will not scale to parts × levels × mock tests without a navigation model. |
| Accessibility | Positives: skip link, `lang`, visible focus styles, `prefers-reduced-motion` handling, `aria-*` in the progress/score/timer components. Gaps: `aria`/`role` appear in 12 files only, with no automated a11y check (no axe, no component tests); the countdown/timers' live-region behaviour and the recording controls with a screen reader were **not verified**. |
| Mobile | Covered by one e2e assertion (no horizontal scroll at phone width). No visual or interaction testing on small screens beyond that. |

---

## 10. Testing

### 10.1 Inventory

| Layer | Files / counts | Notes |
|---|---|---|
| Unit: domain | evidence 6, stored 4, comparison 14, metrics 6, practice-machine 5 | Pure, fast |
| Unit: evaluation | quality-gate 27 + calibration 11, evaluator 13, Gemini 24, Gemini schema 5, Anthropic 6, samples 5 | Fake HTTP layer for Gemini; no key needed |
| Integration (DB + pipeline) | `attempt-pipeline.test.ts`, 24 tests: in-memory SQLite, real migrations, fake providers, real `LocalAudioStorage` on a temp dir | Covers success, retry link, transcription/evaluation failure, transcript reuse, empty audio, malformed JSON, double claim, ownership, upload validation |
| Provider | OpenAI transcription 6 (fake HTTP), Gemini, Anthropic | Real calls are only in `test/live` |
| Browser | `e2e/practice-flow.spec.ts`, 5 tests | Full loop with mock providers and a fake microphone, mic denied, upload failure + resend, failed evaluation + restart, mobile overflow |
| Live (manual) | `eval:live` (4), `eval:transcription` (3, unrun) | Only the Gemini evaluation path has real runs |
| CI | none for the normal suite | Only `live-evaluation.yml` (manual) |

Results at audit time: **159/159 unit, 5/5 browser**; lint, typecheck and build pass.

### 10.2 Preserve before expanding

The in-memory-DB pipeline harness (`openDatabase(":memory:")` + `set…ForTesting` overrides), the fixtures in
`test/fixtures.ts`, the verbatim-real-output calibration cases, the Gemini fake-HTTP suite, the synthetic sample set
and the live harness with its report, the pure reducer tests, and the Playwright setup with mock providers and a
throwaway DB.

### 10.3 Missing categories

1. **Route-handler tests** (upload validation order, cookie handling, ownership 404, analytics ingest limits): the
   HTTP layer has no tests; only the service layer does.
2. **Migration tests** (apply `0000`→`0001`, and later, on a database with data). Every schema change in Stage 3
   needs this.
3. **Storage tests**: `LocalAudioStorage` key validation and atomic write are untested directly.
4. **Analytics ingest and `track` failure-swallowing** tests.
5. **Component tests and automated accessibility checks.**
6. **Auth/authorization tests** (a policy matrix test once teachers/accounts exist), **merge-migration tests**.
7. **Concurrency tests** (parallel attempt creation, claim races under load).
8. **Cross-version comparison/progress tests** once aggregates exist.
9. **CI** running lint, typecheck, unit and e2e on every push.
10. Real-provider validation for OpenAI transcription and the end-to-end pipeline remain outstanding.

---

## 11. Technical debt

Only items with evidence in the repository.

### BLOCKING (before the stages they gate; none blocks fixing or polishing the current slice)

| # | Issue | Evidence | Gates |
|---|---|---|---|
| B1 | Task/rubric/result contract is long-turn-shaped: no task type; rubric keyed by level only; schema v2 criteria and descriptions are B2/Part 2 | `task.ts`, `rubrics/index.ts`, `schema.ts`, `prompts/speaking-evaluation-v2.ts` | **Part 1, Part 3**, other levels |
| B2 | No session/response entities: one recording per attempt, attempt is the only unit, events have no session id | `recordings_attempt_uq`, `schema.ts`, `events.ts` | **Part 1, mock tests**, session analytics |
| B3 | Identity merge undefined: bearer-cookie identity, `kind` enum of one value, unique attempt numbering per user/task | `anonymous-user.ts`, `schema.ts` (`speaking_attempts_user_task_number_uq`) | **Accounts, multi-device, subscriptions, teachers** |

### IMPORTANT (before production)

| # | Issue | Evidence |
|---|---|---|
| I1 | No rate limit or spend cap; anonymous identity is resettable; unlimited restarts of a failed attempt | `attempts/route.ts`, `process/route.ts`, `claimAttemptForProcessing` |
| I2 | Upload size is checked from `Content-Length` only | `attempts/route.ts` |
| I3 | SQLite + local disk only; runtime migrations located via `process.cwd()`; `after()` as the only worker | `client.ts`, `env.ts`, `attempts/route.ts` |
| I4 | No CI for lint/typecheck/tests/e2e | `.github/workflows/` |
| I5 | Failed/rejected evaluations record no tokens or drafts; cost accounting incomplete | `attempt-processing.ts`, `speaking-evaluator.ts` |
| I6 | Provider keys are checked only when an attempt is processed, after the student has already recorded and uploaded | `evaluation/index.ts`, `transcription/index.ts` (no boot or health check) |
| I7 | Default `EVALUATION_PROVIDER` is the unvalidated Anthropic path; OpenAI STT unvalidated; full pipeline unvalidated | `env.ts`, quality doc |
| I8 | Worst-case pipeline time (450 s) exceeds `maxDuration` (300 s) and the stalled threshold (360 s) | `env.ts`, `route.ts`, `attempt-views.ts` |
| I9 | No FK from attempts to task snapshot or `previous_attempt_id`; snapshot not refreshed when content changes without a version bump | `schema.ts`, `ensureTaskSnapshot` |
| I10 | Cookie UUID is a bearer credential with 1-year life | `anonymous-user.ts` |
| I11 | No security headers/CSP | `next.config.ts` |
| I12 | `prompt_hash` omits the user template and task guidance | `speaking-evaluator.ts` |

### DEFERRED

- Per-criterion scores live only in JSON (fine until trend charts exist).
- Duplicated score→level tables and `DEVELOPMENT_PROVIDERS`.
- `Button.tsx` raw `red-700`; no type-scale tokens; no dark mode.
- Client analytics are lossy and have no event ids.
- Attempt-number race returns a 500 instead of a clean conflict.
- Meaning-check blind spot for very short originals (known, documented).
- `PracticeExperience.tsx` size; extraction can wait until Part 1/3 forces it.
- Gate thresholds tuned on one model; Uzbek-learner coverage limited to one sample (S14).
- Transcript-only evaluation (pronunciation not assessed).

---

## 12. Recommended next stages

Proposed from the actual code. This does **not** follow the old roadmap order (Part 1, Part 3, auth, dashboard,
mock tests), because three of those depend on seams that do not exist yet.

1. **Stage 3: Foundation for extension (small, no new product surface).** CI for the normal suite; migration test
   harness; decide and document the three seams: (a) task type + rubric key `(level, format)` + evaluation contract
   strategy (schema v3 vs per-type), (b) `practice_sessions` + per-answer `responses`, (c) identity-merge policy.
   Add the cheap integrity fixes while there is no real data (foreign keys, `session_id` on events, indexes).
   Close the cost-exposure items (rate limits, restart cap, upload cap, boot-time provider checks).
2. **Stage 4: Real end-to-end validation.** Validate OpenAI transcription on real learner speech
   (`eval:transcription`) and the full microphone → STT → evaluation pipeline, since both are unvalidated and every
   later stage depends on speech in. If no OpenAI key is available, decide explicitly whether a different STT
   provider should be evaluated (Gemini transcription was deliberately not added for fidelity reasons).
3. **Stage 5: Accounts.** Auth, anonymous-to-account merge, ownership policy, per-user quotas. Do this before a
   dashboard, so progress is attached to real users from the start.
4. **Stage 6: Part 3** (same single-recording shape) before **Part 1** (needs the response entity). Each part gets
   its rubric, calibration samples and live validation with the existing harness; do not ship a part without them.
5. **Stage 7: History/progress dashboard, then mock tests**, on top of sessions, with version-aware comparison.
   Subscriptions after accounts and quotas exist.

Production hosting (managed DB, object storage, queue) can be done in parallel with Stage 5 and must precede any
public launch; it is not a feature stage.

---

### The critical question (answer)

> If we now start adding Part 1, Part 3, authentication, dashboard, progress, and mock tests on top of the current
> codebase, are we likely to create significant architectural debt?

**Yes, if they are added in that order without first fixing three seams. No, if those seams are settled first.**
Concretely:

- **Part 1 / Part 3** would be built by copying Part 2 paths: a second `RUBRICS` entry cannot exist for the same
  level (`rubrics/index.ts`), schema v2 and the gate encode the long-turn contract (`schema.ts`, `quality-gate.ts`),
  and `recordings_attempt_uq` forbids per-question recordings. Without a design decision, the likely result is
  parallel `if (part === …)` branches in the prompt, gate, comparison and UI.
- **Authentication** added as "just another login method" would collide with
  `speaking_attempts_user_task_number_uq` the first time one person has two anonymous histories, and subscription or
  teacher data would hang off a bearer cookie.
- **Dashboard and progress** built now would mix scores from different evaluator versions, read per-criterion
  scores out of JSON, and lack a `(user_id, created_at)` index and any `level/part` columns.
- **Mock tests** have no entity to live in (no session, no ordering, no roll-up) and the UI machine models one task.
- **Analytics** would have no session key, so mock/session funnels could not be reconstructed later.

What does **not** need to change: the provider abstractions, the shared evaluation pipeline and gate, versioning,
the attempt claim/restart model, the storage interface, the design tokens and the testing approach. That is why
the recommendation is a short foundation stage, not a rewrite.

---

## 13. Explicit blockers

Unfinished decisions, not bugs; none stops work on the existing slice:

1. **B1**: task type, rubric key and evaluation-contract strategy for Part 1/Part 3.
2. **B2**: session and response entities.
3. **B3**: anonymous-to-account merge policy.
4. External: **no OpenAI key**, so transcription and the full pipeline cannot be real-validated; **no Anthropic
   validation**.

---

## 14. Known limitations of this audit

- Read-only: no running system, load, or deployment was exercised. Serverless behaviour (section 7) is derived from
  the code and the Next.js documentation shipped in `node_modules/next/dist/docs`, not from a deployment attempt.
- The upload-size gap (I2) was read from the code; Next's own body limits for route handlers were not tested.
- Accessibility was assessed by reading markup, not with assistive technology or an automated checker.
- Test counts are from the runs on this commit; coverage percentages were not measured.
- Only Gemini evaluation is real-validated, on 14 synthetic answers. **OpenAI transcription and the full
  microphone → OpenAI transcription → Gemini evaluation pipeline are NOT real-validated**, and the Anthropic
  evaluator is preserved but not real-validated. Nothing here claims production validation.
- `npm audit --omit=dev` returned 0 vulnerabilities; development-only dependencies were not separately reviewed.

### Appendix: files inspected

All of `src/` (app routes and API handlers, `proxy.ts`, `domain/*`, `server/*` including the schema, migrations,
repository/service/processing/views, evaluation providers, gate, prompt, rubric, versions, transcription, storage,
identity, analytics, config, logging, errors, http, `features/speaking-practice/*` state, hooks, lib and
components), `src/components/ui/*`, `src/content/*`, `test/*`, `e2e/*`, `scripts/processing-stats.mjs`,
`.github/workflows/live-evaluation.yml`, `package.json`, `next.config.ts`, `vitest*.mts`, `playwright.config.ts`,
`.env.example`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/AI_EVALUATION_QUALITY.md`, and
the Next.js `after` documentation.
