# Architecture decisions (Stage 3 foundation)

Decisions taken in the foundation/hardening stage that followed `STAGE_3_PRE_DEVELOPMENT_AUDIT.md`. The
stage added **no product feature**: no Part 1/3, no login, no dashboard, no mock tests, no UI redesign, and
no change to what the Gemini evaluator is asked or how its results are judged.

Each decision lists what was decided, why, and what is **intentionally deferred**. Where this document and
the code disagree, the code wins; please fix the document.

| # | Decision | Section |
|---|---|---|
| 1 | Tasks declare a type and a rubric; the rubric is not derived from the level | [1](#1-taskrubric-boundary-audit-b1) |
| 2 | Practice sessions group responses; the attempt stays the response | [2](#2-sessionresponse-boundary-audit-b2) |
| 3 | `users.id` is the canonical identity; merging is a tested, tombstoned operation | [3](#3-identity-boundary-audit-b3) |
| 4 | Server-issued session ids correlate analytics | [4](#4-analytics-session-correlation) |
| 5 | Database-backed usage limits and a restart cap | [5](#5-cost-and-abuse-protection) |
| 6 | Provider configuration is validated at boot and before accepting an upload | [6](#6-provider-configuration) |
| 7 | One processing run has a wall-clock budget below every platform limit | [7](#7-processing-lifecycle) |
| 8 | Storage and deployment limits stay documented, not solved | [8](#8-storage-and-deployment-limits) |
| 9 | Migration strategy, foreign keys and the migration harness | [9](#9-migration-strategy) |
| 10 | What was deliberately left out | [10](#10-intentionally-deferred) |
| 11 | Identity and accounts (Stage 4): one canonical user, library-managed sessions, conversion by merge | [11](#11-identity-and-accounts-stage-4) |

Also in this stage (small, no separate decision): upload bodies are counted as they stream in
(`readBodyWithLimit`, `server/http.ts`); `prompt_hash` covers the whole prompt template (see
[AI_EVALUATION_QUALITY.md](AI_EVALUATION_QUALITY.md#prompt-hash)); baseline security headers
(`src/security-headers.ts`); CI for the normal suite (`.github/workflows/ci.yml`).

---

## 1. Task/rubric boundary (audit B1)

**Decision.** A `SpeakingTask` (`domain/speaking/task.ts`) now declares:

- `taskType`: what kind of response it asks for. Only `"long_turn"` exists (one question, several task
  points, one extended answer: B2 Part 2).
- `rubricId`: which rubric scores it (`"b2-long-turn"`).

together with the `level` and `part` it already had. `getSpeakingRubric(task)` looks the rubric up by
`task.rubricId` (`server/evaluation/rubrics/index.ts`) and refuses a task whose rubric targets a different
level. Previously it was `getSpeakingRubric(level)`, so two parts of the same level could not have different
rubrics.

**Why this much and no more.** The audit's problem was that the rubric was selected from the level alone and
the task had no type. Adding the two fields and routing the lookup through the task removes that coupling
without designing Part 1 or Part 3. `TaskType` and `RubricId` are closed unions with one member each: adding a
member is a compile-time prompt to also add content, rubric and evaluator contract, which is where the real
design work for a new part belongs.

**Compatibility (verified).**

- The rubric text and version (`b2-speaking-rubric/1.0.0`) are unchanged. A regression test pins SHA-256
  digests of the rubric, the full system prompt and the full user message for a fixed B2 Part 2 input. They
  were captured from the pre-change commit (`7001248`) and compared byte for byte with the new code, so the
  model receives exactly what it received before.
- No migration was needed. Stored attempts and evaluations are untouched. Task snapshots in `speaking_tasks`
  written earlier simply lack the two new keys; nothing reads snapshot content, and a task is still keyed by
  `(id, version)`. The task version stays 1 because nothing the student sees changed.
- The evaluator version stays `speaking-evaluator/2.4.0`: no behaviour changed.

**Deferred.** The result schema (five fixed criteria, `task_coverage` by prompt, wording that says "B2" and
"2-minute") is still the long-turn contract. A part with different criteria needs either schema v3 plus a
`stored.ts` upgrade or a separate evaluator; that is a decision for the stage that introduces such a part. Also
deferred: an `exam` field (the registry is the only exam today), per-part metrics, and task content from a CMS.

---

## 2. Session/response boundary (audit B2)

**Decision.** Two levels, no renaming:

```
users 1 ──< practice_sessions 1 ──< speaking_attempts 1 ──1 recordings
                                          │             ├──< transcripts
                                          │             └──< evaluations
                                          └── previous_attempt_id → speaking_attempts   (retry chain)
```

| Entity | Responsibility | Lifecycle |
|---|---|---|
| `practice_sessions` | One sitting of practice; the grouping key for responses and for analytics events. `kind` is `single_task` today. | Created by the server (`POST /api/sessions` when a practice page opens, or implicitly when a recording arrives without a valid session). Never updated or deleted. |
| `speaking_attempts` | **The response**: one answer to one task, with its processing state, metrics and retry link. It keeps its name because a student answers the same task repeatedly. | `uploaded → processing → transcribing → evaluating → completed | failed` (unchanged). `session_id` is set at creation. |
| `recordings`, `transcripts`, `evaluations` | Unchanged. | Unchanged. |

**What this supports later without another structural change.**

- *Part 2 response*: a session with one attempt (today's flow). A retry stays in the same session when the
  client sends the same session id, so "Retry this task" is one sitting.
- *Part 3 response*: the same shape with another `task_id`.
- *Part 1 (several answers)*: a session containing several attempts, each for its own question. This works if
  each question is addressable as a task. If Part 1 should instead be one task with an ordered list of
  questions, `recordings_attempt_uq` (one recording per attempt) must be revisited at that point.
- *Full mock session*: a session with a new `kind` and the attempts of its parts. Ordering, timing and
  roll-up rules belong to that stage.

**Why this model.** Attempts already carry everything per-response (status, failure, metrics, retry link) and
the whole pipeline is keyed on them, so renaming or splitting that table would be a broad refactor with no
benefit. A session only adds what attempts cannot express: "these responses belong together". It has no
columns other than its owner, kind and creation time: no status, end time, scoring or ordering yet, because
none of that is needed or yet known.

**Existing data.** Attempts created before this stage keep `session_id = NULL`. Every code path treats that as
"no session"; they are not back-filled with invented sessions. New attempts always have one.

**Deferred.** Session completion/abandonment, ordering within a session, per-session scoring, a `task_type`
or `part` on the session, and the Part 1 question model. Do not add them until a feature needs them.

---

## 3. Identity boundary (audit B3)

> **Superseded in part by [section 11](#11-identity-and-accounts-stage-4).** This section was written before login
> existed. Stage 4 implemented it, and changed one rule for security reasons: **a tombstoned anonymous cookie no longer
> resolves to the account** (the paragraph "What a merge does" below says the opposite and is kept as history of the
> decision). Everything else here still holds. Where the two sections differ, section 11 wins.

No login existed when this was written. This section fixed the rules so that adding it later is a bounded piece of work.

**Canonical identity.** `users.id` is the single identity every other table references (attempts, sessions,
and later subscriptions). It is an opaque random UUID and never an email, provider id or cookie secret. Code
obtains it only from `getCurrentUser()` / `getOrCreateCurrentUserId()` (`server/identity/current-user.ts`), which
returns the canonical id of the caller. Nothing else reads the cookies.

**Anonymous identity.** A `users` row with `kind = 'anonymous'`, created on a browser's first visit. Its id is
held in the httpOnly cookie `cefro_uid`. It is deliberately **low-trust**: the cookie value is the credential,
anyone holding it can read that history, and a visitor can discard it to become a new identity. Therefore:
nothing of financial or third-party value (subscriptions, teacher/student data) may ever attach to an anonymous
user, and cost protection must not rely on it (see section 5, which has an identity-independent ceiling).

**Attaching anonymous history to an account (future).**

1. The sign-in flow creates or finds the account's `users` row (a new `kind`, e.g. `registered`, added when
   login is built) plus an `auth_identities` table keyed by provider and subject. Both belong to the login
   stage and are not created now.
2. If the browser has an anonymous cookie, `mergeUsers(db, { fromUserId: anonymous, intoUserId: account })`
   (`server/identity/merge-users.ts`) moves the history in one transaction.
3. The cookie is replaced by an account session credential (also a login-stage decision). The old anonymous
   cookie keeps working because of the tombstone below.

**What a merge does** (implemented and tested, though nothing calls it yet):

- Moves `speaking_attempts`, `practice_sessions` and `analytics_events` to the surviving user.
- Leaves the merged row in place with `merged_into_user_id` set (a tombstone). *(Stage 3 intended an old anonymous
  cookie to follow the tombstone to the account. Stage 4 reverses that: see section 11, "The anonymous cookie".
  Tombstones are now lineage and what makes a retried merge a no-op.)* Multiple devices work because each
  device's anonymous row is merged once, the first time that device signs in.
- Refuses to merge a user into itself, into a user that was itself merged, or from a user that is not
  anonymous or was already merged. An account can therefore never be merged away.
- Needs no file moves: audio keys embed the old user id but are stored on each recording row.

**Collisions and attempt numbers.** `attempt_number` is unique per `(user, task)`. Two anonymous histories
for the same task would both have an "attempt 1". The merge:

1. parks the incoming rows on negative numbers so the move cannot violate the unique index,
2. moves them,
3. renumbers every affected task into one gapless sequence 1..n ordered by creation time (ties by id), using
   temporary distinct negative numbers so no intermediate state collides.

Numbers may therefore change for attempts that were merged. This is intended: the UI labels attempts
"Attempt N" only within one task and one user. Retry links (`previous_attempt_id`) are by id and unaffected, so
the retry chain and "compare with the previous attempt" keep their meaning.

**Subscriptions (future).** A subscription belongs to a registered user's canonical `users.id`. An anonymous
user cannot hold one. Merging only moves practice history; it never moves, creates or merges entitlements.
If two registered accounts ever need merging (support case), that is a separate, explicit operation, not
`mergeUsers`.

**Authorization.** Every read and write of user data is scoped by the canonical user id obtained from the
identity function, never from a request field. Ownership is checked in the service layer
(`getOwnedAttempt`, the retry check in `createAttempt`, `resolveOwnedSessionId`), and unowned resources are
reported as "not found". A client-supplied session id grants nothing: it is used only if it belongs to the
caller, otherwise ignored. When teachers or organisations arrive, access must go through one explicit
policy function rather than additional inline comparisons.

**Schema change made in Stage 3.** Only `users.merged_into_user_id` (nullable, foreign key to `users.id`).

**Deferred then** (status now): login and account tables (done in Stage 4), credential rotation (the library
rotates sessions on every sign-in), retention of tombstones, merge of two registered accounts, an audit log of
merges, and moving the anonymous bearer credential out of the primary key (still open).

---

## 4. Analytics session correlation

**Decision.** `analytics_events.session_id` (nullable text; no index until a query needs one). Session ids are generated by the server
(`POST /api/sessions`, or at attempt creation). The browser keeps the id it was given and attaches it to
events and to the recording upload.

**Trust rules.**

- A session id arriving on an event is stored **only if it belongs to the calling user**
  (`ownedSessionIds`). Anything else (another user's id, an unknown or malformed id, a missing id) is stored
  as no session; the event itself is still recorded and the request still succeeds. Analytics must never break
  the product.
- `user_id` still comes only from the cookie, never from the payload.
- Server events (`recording_submitted`, `transcription_*`, `evaluation_*`, `retry_completed`) take the session
  from the attempt row, so they cannot disagree with it.
- The column has no foreign key (analytics rows are append-only and must survive other data changes).
- A session id carries no personal information; event properties are unchanged and still never contain
  transcripts or audio.

Existing event names and the anonymous flow are unchanged. Events tracked before the session id arrives are
attached when it does. If the session request fails, the practice flow still works and the server creates a
session when the recording is submitted.

**Deferred.** Session start/end events, a platform/app-version dimension, client event ids for de-duplication,
and an `occurred_at` index (add when a dashboard needs it).

---

## 5. Cost and abuse protection

**Decision.** Server-enforced limits, evaluated from the database before audio is stored or a provider is
called (`server/limits/usage-limits.ts`). Nothing depends on a client-supplied value. Defaults are in
`server/config/env.ts` and can be overridden with environment variables.

| Limit | Default | Error (stable code) | Reason |
|---|---|---|---|
| Submissions per user per hour | 15 | 429 `hourly_limit_reached` | One answer takes about 1 min preparation + up to 2 min speaking + processing; 15 per hour is more than continuous real practice allows. |
| Submissions per user per day | 60 | 429 `daily_limit_reached` | Caps a determined single identity. |
| Answers being processed at once, per user | 2 | 429 `too_many_in_progress` | Stops parallel floods; a student normally waits for feedback. Stalled runs do not count, so a crash cannot lock someone out. |
| Submissions, everyone, per hour | 600 | 503 `capacity_reached` | **Identity-independent backstop**: an anonymous visitor can discard the cookie to evade per-user limits; this bounds total spend regardless. Tune it to the provider budget. |
| Processing runs per attempt | 3 | 429 `restart_limit_reached` | Initial run + manual restarts + stalled re-claims. Enforced atomically in the claim `UPDATE`, so it cannot be raced; the route pre-checks it only to return a clear error. |
| Practice sessions per user per hour | 30 | 429 `session_rate_limited` | Cheap rows, but unbounded inserts are still abuse. |
| Analytics events per user per minute | 300 | 429 `rate_limited` | Stops table flooding; real use is a few events per page. |

Errors carry `Retry-After`, plain-language student messages (`HttpError.publicMessage`), and refuse
**before** anything is stored, so a refused submission costs nothing. The client shows the message in the
existing upload-failure panel; no UI was changed.

**Why a database, not a distributed limiter.** The attempt counts are exact, survive restarts and need no new
infrastructure, using indexes added for this query (`(user_id, created_at)`, `(created_at)`). The two cheap
endpoints (sessions, analytics) use a small in-memory fixed window (`FixedWindowLimiter`), which is per process
and resets on restart. That matches the single-host deployment assumption (section 8) and is not suitable for
several instances.

**Authenticated users later.** The limits key on the canonical `users.id`, so signed-in users use the same code.
Different tiers (plans) would change the numbers per user, not the mechanism.

**Not covered.** No per-IP limit (`X-Forwarded-For` is spoofable without a trusted proxy configuration, which
does not exist yet), no bot detection or CAPTCHA, and no dollar-based budget. Abandoned provider calls (a run
that hits its budget) may still be billed (see section 7).

---

## 6. Provider configuration

**Decision.** Configuration is validated offline, without any provider call and without printing a secret.

- `validateProviderConfig(env)` (`server/config/provider-config.ts`) returns problems naming the variable only:
  a missing key for the selected real provider, or a mock provider in production.
- `describeProviderMode(env)` distinguishes **`real`** (both providers real) from **`development_mock`** (any
  mock). Mock providers remain refused when `NODE_ENV=production`.
- At server start (`src/instrumentation.ts` → `boot-check.ts`, skipped during `next build`): in production a
  problem makes registration throw, so Next.js reports "Failed to prepare server" and every request returns
  500 (verified with `next start`); health checks fail and a bad deploy is visible. The process itself stays up
  because Next does not exit on an instrumentation error. In development and tests it only logs, so mock mode
  and test overrides keep working.
- `POST /api/speaking/attempts` repeats the check and returns 503 `service_not_configured` before buffering or
  storing anything. The browser keeps the recording and the existing "try sending again" path works once the
  server is fixed. The response carries no variable names.

The lazy checks in `getEvaluationModel()` / `getTranscriptionProvider()` stay as the last line of defence.

---

## 7. Processing lifecycle

**What the audit found, traced.** One processing run is transcription then evaluation (up to two model calls),
started with `after()`.

- Transcription: one `fetch` with a 90 s timeout and no retries.
- Evaluation: up to two model calls (the second only after a rejected draft). Each call has a 180 s timeout,
  and both SDKs are configured to retry transient failures (Gemini `retryOptions.attempts = 3`, Anthropic
  `maxRetries = 2`). Whether each retry restarts the 180 s clock was not verified, so the exact worst case is
  not known; it is at least `90 + 2 × 180 = 450 s` and could be several times that.
- The routes declare `maxDuration = 300`; an attempt is reported *stalled* (and restartable) after
  `PROCESSING_STALE_AFTER_MS = 360 s` without progress.

So a legitimate but very slow run could (a) be killed by a platform that enforces `maxDuration`, leaving the
attempt at `evaluating` until it is declared stalled, and (b) still be running when the UI offered "restart",
letting a second paid pipeline start for the same attempt. Observed latency is far below all of this (about
15 s average, 32 s maximum in the live runs), so these were edge cases, not routine failures.

**Decision.** Give each run an explicit budget that is below both limits (`PROCESSING_BUDGET_MS`, default
270 s, capped at 290 s by the schema):

- Transcription and evaluation are each raced against the run's deadline (`attempts/deadline.ts`). If the
  deadline passes, the run ends with a stored, restartable `provider_timeout` failure instead of hanging.
- A regeneration is not started if fewer than 40 s of budget remain (`evaluateSpeaking` option
  `deadlineAt`), because it could not finish; the previous rejection is reported instead. With ample budget the
  behaviour is exactly as before.
- Ordering is enforced by a test: budget (270 s) < `maxDuration` (300 s) < stalled threshold (360 s), at
  least 60 s apart.

**Limitations (be explicit about them).**

- The deadline stops *waiting*; the provider interfaces take no abort signal, so the underlying HTTP request
  is not cancelled and may still complete and be billed. Its result is discarded.
- `after()` is not a durable job queue. It runs in the web process for at most the platform's `maxDuration`
  (and on serverless needs the platform's `waitUntil`). If the process is restarted or killed mid-run, the
  attempt stays "in progress" until it is declared stalled after 6 minutes, then the student can restart it
  (which counts toward the run cap). A durable worker/queue with retries is required before production
  scale; it is not built here.
- A run that times out spends one of the attempt's three processing runs.

---

## 8. Storage and deployment limits

Superseded for hosting by section 12 (hosted libSQL/Turso plus recordings in the database). Still true for the local
fallback: a SQLite file and local-disk audio require a single Node host with a persistent disk and do not work on
ephemeral or serverless filesystems. Migrations are applied on first
database use from `src/server/db/migrations` located via `process.cwd()`, which assumes the source tree is
present at runtime. In-memory limiters are per process. For production, see the audit (section 7): a hosted
database or a backed-up volume, object storage behind `AudioStorage`, migrations in the deploy pipeline, and a
real worker queue. The `AudioStorage` interface and the `{provider, key}` stored per recording are the seams
for that.

---

## 9. Migration strategy

- **History is append-only.** Applied migrations are never edited or deleted; a test pins the first two.
  Migration `0002_stage3_foundation` adds sessions, the merge tombstone, `analytics_events.session_id`, the
  new indexes and the foreign keys below.
- **Foreign keys added** (all relationships that were unambiguous):
  `speaking_attempts.previous_attempt_id → speaking_attempts.id`,
  `speaking_attempts.(task_id, task_version) → speaking_tasks.(id, version)`,
  `speaking_attempts.session_id → practice_sessions.id`,
  `practice_sessions.user_id → users.id`, `users.merged_into_user_id → users.id`. (The other foreign keys
  already existed.)
- **How, and why it is safe.** SQLite can only add a foreign key to an existing table by rebuilding it. The
  rebuild is the one `drizzle-kit` generated, hand-edited in two places (commented in the file): a dangling
  `previous_attempt_id` (pointing at a non-existent attempt) is set to NULL, because the new foreign key
  could not otherwise hold, and `session_id` is NULL for existing rows. Foreign-key enforcement is switched
  **off while migrating** (`migrateDatabase`, `server/db/client.ts`), because the `PRAGMA` inside drizzle's own
  transaction is ignored; afterwards `PRAGMA foreign_key_check` runs over the whole database and the process
  fails with a clear error if anything dangles, and only then is enforcement turned on. A migration can
  therefore never silently leave broken references.
- **Constraints not added.** Same-user/same-task integrity of a retry link (`previous_attempt_id`) cannot be a
  foreign key; it stays enforced by `createAttempt`. `analytics_events` and `analytics_events.session_id` stay
  unconstrained on purpose. Unrepairable data (an attempt for a task version with no snapshot) makes the
  migration fail loudly rather than being altered.
- **Harness** (`src/server/db/migrations.test.ts`, part of `npm test` and CI): the journal is consistent and
  complete; a fresh database builds the full schema with the expected tables, foreign keys and indexes;
  migrating twice is a no-op; a database built from migrations `0000`+`0001` with realistic data (including a
  dangling retry link) upgrades with every row, child record and unique rule intact and no foreign-key
  violation; the application's repository code reads and writes it afterwards; and a migration that would
  leave a dangling reference fails loudly. When you add a migration, extend this file.

---

## 10. Intentionally deferred

Not built, on purpose: Part 1 and Part 3 (content, rubrics, evaluator contract, UI), any login or account
tables, subscriptions and entitlements, teacher/organisation features, dashboard and progress views, mock
tests, a durable job queue and distributed rate limiting, object storage and a hosted database, per-IP
limits and bot defence, a nonce-based Content-Security-Policy (the current policy allows inline scripts
because Next.js emits them and the home page is static), `exam`/format fields beyond task type and rubric id,
and any change to the Gemini evaluation methodology. The real-provider gaps are unchanged: OpenAI
transcription, the Anthropic evaluator and the full microphone → OpenAI → Gemini pipeline are not
real-validated.

---

## 11. Identity and accounts (Stage 4)

Stage 4 adds registration, sign-in and sign-out on top of the Stage 3 identity boundary. It adds identity
infrastructure only: no profile, roles, billing, password reset, social login or account settings.

### The model

| Term | What it is |
|---|---|
| **Canonical user** | A row in `users`. `users.id` is the **only** id that owns data (sessions, attempts, recordings, analytics, and later subscriptions). Authorization compares it and nothing else. |
| **Anonymous identity** | A `users` row with `kind = 'anonymous'`, no email and no credentials. It is "anonymous" because nothing proves who holds it: its id sits in the `cefro_uid` cookie, and whoever presents that value acts as it. Low-trust by design. |
| **Account identity** | A `users` row with `kind = 'registered'`, a unique lower-cased `email`, and a credential row in `auth_accounts` (password hash). It is "authenticated" only while the caller holds a valid, unexpired **login session** (`auth_sessions` row + signed cookie). Possessing the account's id proves nothing. |

**Account and user are the same entity, not two.** There is no separate account id: registering creates a `users`
row of kind `registered`, and `auth_accounts.user_id` / `auth_sessions.user_id` point at it. One id, so no id can
drift out of sync or be confused with another. (The auth library's own user model is mapped onto `users`.)

### Mechanism

The maintained **`better-auth`** library (pinned, 1.7.7) provides password hashing (scrypt), session tokens,
cookie signing, input validation and the three endpoints; nothing cryptographic is written in this repository.
It is isolated behind `server/auth/auth.ts` (configuration + the conversion hook) and `server/identity/current-user.ts`
(the only place that asks who the caller is). `app/api/auth/[...all]/route.ts` exposes exactly
`POST /api/auth/sign-up/email`, `/sign-in/email` and `/sign-out`; every other library endpoint answers 404.
Chosen over a hand-written scheme or Auth.js because it fits the Drizzle/SQLite stack with server-side sessions
(logout is immediate) and ships the password and cookie handling that must not be home-grown.

Rejected alternatives: *Auth.js with JWT sessions* (stateless: logout cannot revoke); *Lucia* (retired);
*hand-rolled scrypt + tokens* (explicitly out of scope).

### Who is the caller? (`getCurrentUser`)

1. If a login-session cookie is present, the library verifies its signature, expiry and the `auth_sessions` row. Valid
   and the row is a live `registered` user → **authenticated**, `userId` = that account.
2. Otherwise the anonymous cookie is honoured only for an **active anonymous** user:
   - unknown well-formed id → that anonymous user is created (as before);
   - the id of a **registered** user, or of a **tombstoned** (merged) anonymous user → **not honoured**; the browser
     gets a fresh anonymous identity and cookie;
   - malformed → fresh anonymous identity.
3. While authenticated, the anonymous cookie is ignored.

Request bodies, query strings and headers are never a source of identity.

### The anonymous cookie, and what changed from Stage 3

Stage 3 planned for an old anonymous cookie to follow the merge tombstone to the account. **That is reversed.** An
anonymous cookie is a bearer credential held by an unauthenticated browser, so letting it resolve to an account
would let anyone who ever held or stole it read (and, later, act on) the account's data, including everything added
after sign-up. So: after conversion the anonymous cookie is **cleared**, and a browser that still has an old
anonymous cookie simply becomes a *new* anonymous visitor. Its history is not lost: it is in the account, reached by
signing in. A registered user's id presented through the anonymous cookie is likewise refused.

### Registration, sign-in, sign-out

- **Sign-up** creates the `users` row (kind `registered`, email lower-cased, unverified), the credential, and a
  session, and signs the user in. Duplicate emails (any case) are refused by the library and by a unique index.
- **Sign-in** verifies the password and creates a **new** session token every time; a token chosen by the client is
  never adopted (no session fixation). Wrong password and unknown email give the same answer.
- **Sign-out** deletes the session row and clears the cookie; a replayed old cookie no longer authenticates.
- Successful sign-in/sign-up answers `{"ok": true}` only: no session token and no user record in the body.

### Converting anonymous history (the most important part)

After a successful sign-up or sign-in the library's `after` hook calls `mergeAnonymousCookieIdentity`
(`server/identity/convert-anonymous.ts`) with **the request's anonymous cookie** and **the account the library just
authenticated**: `mergeUsers` then moves everything in one transaction.

| Question | Answer |
|---|---|
| What moves? | `speaking_attempts` (and, through them, recordings, transcripts, evaluations: no row is copied or rewritten), `practice_sessions`, `analytics_events.user_id`. Audio files do not move (keys are stored per recording). |
| Who may be merged away? | Only an **active anonymous** user. A registered user's id or an already-merged id in the cookie is ignored, so presenting someone else's identity cannot move their data. An id supplied in a body is never read. |
| Authorization-safe? | The target is the freshly authenticated account; the source is whatever anonymous identity the caller *holds*. Holding it is the only authority anonymous data ever had. |
| Transactional? | Yes: all moves, the renumbering and the tombstone happen in one SQLite transaction, or none. |
| Idempotent / safe to retry? | Yes. A source already merged into the same account is a no-op (`alreadyMerged`). If the merge fails, the sign-in still succeeds, the anonymous cookie is **kept**, nothing is half-moved, and signing in again completes it. |
| Account already has data for the same task? | Attempts are renumbered into one gapless chronological sequence per task (rules in section 3). Retry links are by id and survive. |
| Two anonymous identities, one account? | Each merges once, the first time its browser signs in (several devices, several visits). |
| Same account on several devices? | Each device has its own login session; all resolve to the same canonical id. |
| What is the anonymous row afterwards? | A tombstone (`merged_into_user_id` = the account). It is never deleted and never accepted as an identity again. |
| What happens to the cookie? | Cleared in the sign-in/sign-up response. |
| Subscriptions later? | Belong to a registered user's `users.id`. Merging never moves entitlements; an anonymous user cannot hold one. |

### Authorization

`server/identity/authorization.ts` (`ownsResource`, `assertOwnedOrNotFound`) is the one place ownership is decided:
the caller's canonical id must equal the resource's `userId`. A resource owned by someone else is reported as "not
found", exactly like a missing one. It guards attempts, audio, restarts, history, retries and (via ownership-filtered
queries) sessions and analytics session ids. Tests exercise another signed-in user, an anonymous visitor, spoofed
ids in bodies/queries/headers, replayed cookies and the auth library's other endpoints (closed). Account-only
endpoints use `requireAuthenticated()` (401). Future roles must extend this module.

### Session and cookie security

- Login cookie `cefro.session_token` (`__Secure-cefro.session_token` in production): **HttpOnly**, **SameSite=Lax**,
  `Path=/`, **Secure** in production (verified against a production build), signed, 7-day expiry sliding daily.
  Sessions are rows: logout and expiry are enforced on every request (no signed-cookie cache).
- A new token on every sign-in; client-chosen tokens ignored; no token in a URL or response body.
- **CSRF / login CSRF:** `POST /api/auth/*` refuses any request whose `Origin` is not the app's own, or that a browser
  marks cross-site (`Sec-Fetch-Site`); requests with neither header (non-browser clients) are allowed. The library's own
  check runs only for requests that already carry cookies, so this is not left to it. Other state-changing routes rely
  on SameSite=Lax cookies.
- Credentials in bodies only; bodies over 8 KB are refused before parsing (also without a Content-Length).
- Passwords: 8-128 characters; stored only as the library's salted scrypt hash. Neither passwords nor tokens are
  logged (a test captures all console output). The session cookie secret is `AUTH_SECRET` (required, 32+ characters,
  in production; the boot check refuses a missing or the public development value) and `APP_URL` (https) is required
  in production for the origin check.
- Analytics carry no credentials, emails or session tokens.

### Abuse limits (in-memory, per process)

Sign-in counts **failures** per email (8 / 15 min) and per client IP (30 / 15 min), and refuses further attempts with
`login_rate_limited` (429, `Retry-After`) while a limit is hit, even for a correct password. Sign-up is limited per IP
(10 / hour) and in total (100 / hour): `registration_rate_limited`. All overridable by environment
(`LIMIT_LOGIN_FAILURES_*`, `LIMIT_REGISTRATIONS_*`). The library's own limiter is also on (30 / minute per path).
Limits: the client IP comes from `X-Forwarded-For`, which a client can forge unless a trusted proxy sets it; the
counters are per process, reset on restart and are not shared between instances (not a distributed limiter); an
attacker can lock a known email out for the window by failing on purpose.

### Schema (migration `0003_stage4_auth`, additive)

`users` gains `email` (unique, nullable), `name`, `image`, `email_verified`, `updated_at`; `kind` gains `registered`.
New tables `auth_sessions`, `auth_accounts` (credential: password hash), `auth_verifications` (the library requires
it; nothing writes to it because no email is sent). Foreign keys to `users` follow the existing convention. The
migration contains no table rebuild and no data change, so existing anonymous users and their data are untouched
(tested: upgrade from the previous schema with data, conversion on the upgraded database, idempotence, and that a failing
migration batch rolls back completely).

### Known limitations (not production-scale)

- **Email is not verified and there is no password reset** (nothing can send email). A forgotten password means a
  lost account; an address can be registered by someone who does not own it (no takeover path, since there is no reset, but
  squatting is possible). Registration reveals whether an email exists.
- Sign-in/registration limits are in-memory and per process; with several instances or a restart they are weaker.
- The in-memory login limiters are per process (section 8); the session table itself is in the shared database (section 12).
- A session slides for as long as it is used; there is no absolute maximum lifetime and no "sign out everywhere".
- Merge trusts possession of the anonymous cookie, as all anonymous data always has: stealing an anonymous cookie
  lets the thief attach that anonymous history to their own new account.
- The password hashing and session logic are the library's; they were not independently audited here.
- No MFA, no account deletion, no account settings.

---

## 12. Persistent storage: Turso/libSQL (hosting)

**Problem.** On Vercel each function instance has its own `/tmp`. A SQLite file and recordings there are invisible to
other instances and are wiped on cold starts and redeploys, so attempts "disappeared" (the API answered 404 for an
attempt created moments earlier).

**Decision.** One data layer for both situations, the official Drizzle + libSQL stack:

- *Same schema, same migrations.* The Drizzle `sqlite-core` schema and the SQL migrations are unchanged in kind
  (migration 0004 adds `recording_blobs`). libSQL is SQLite-compatible, so there is no second database design.
- *Chosen at runtime from configuration alone* (`src/server/db/target.ts`): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
  both set select the hosted database over HTTPS (`@libsql/client/web`: no native module, no websocket, one bounded
  `fetch` per request with `DATABASE_TIMEOUT_MS`); neither set selects a local SQLite file through the node libSQL
  client (single connection, operations serialised by a small FIFO lock, WAL, foreign keys on). Only one of the two is a
  configuration error, never a silent fallback. On Vercel the hosted database is mandatory.
- *Everything is asynchronous.* Every repository and service function awaits its queries. `.changes` became
  `rowsAffected`; the attempt claim is still one conditional `UPDATE` whose `rowsAffected === 1` decides the winner.
  Multi-row writes (attempt + recording, transcript, evaluation + completion) are `db.transaction` blocks that contain
  only database calls; slow provider calls (transcription, evaluation) never run inside a transaction, because hosted
  transactions are HTTP streams that expire after a short idle time and hold a write lock.
- *Recordings live in the database* (`recording_blobs`, bytes + content type + size) behind the unchanged `AudioStorage`
  interface (`DatabaseAudioStorage`). A recording is about 2 MB and the database is the one thing all instances share.
  Access is only through the ownership-checked audio route. `AUDIO_STORAGE_PROVIDER` can select `local` (development) or
  a future object-storage implementation (Vercel Blob, R2) without touching callers. Upload path: browser → route
  (Vercel's 4.5 MB body limit applies) → recording stored in the database → Speech Activity Guard → Gemini
  transcription → Gemini evaluation → completed.
- *Migrations are a pipeline stage*, not part of the build and not run by whichever instance starts first.
  `npm run db:migrate -- --require-remote` (`scripts/migrate.mjs`: Drizzle's libSQL migrator in one transaction, then
  `PRAGMA foreign_key_check`) is run by the GitHub Actions *Migrate* job (`.github/workflows/deploy.yml`) after the
  checks pass and before the deployment, one run at a time, followed by a read-only *Verify* (`--check --require-current`)
  and, after the deployment, a health check of `GET /api/health`. The script fails closed: missing credentials, an
  `http://` address, a Preview build, a database without CEFRO's migration history, or a history this code does not know
  all stop it before any write; `--check` is strictly read-only. Manual runs pick one stage (`check` is the default and
  writes nothing; `migrate` never deploys; `deploy` never migrates and requires a fully migrated database).
  The Vercel build is only `next build`, so a build never depends on the database. Vercel's own Git deployment of `main`
  is switched off in `vercel.json`, so the workflow is the only production deployer. Preview deployments keep Vercel's Git
  integration and must not hold the production credentials: the pipeline's preflight verifies the variable scoping and the
  production branch through the Vercel API (failing closed), and the running app itself refuses to open Turso in a Preview
  unless `CEFRO_ALLOW_PREVIEW_TURSO=true`. Because the migration precedes the deployment, migrations must be backward
  compatible with the previous release (expand, then contract). CI keeps applied migrations immutable and flags the
  risky kinds of statement for explicit review; that is a text scan and does not prove compatibility. A failed health check
  does not roll back the release or the database; the runbook is `vercel rollback`. A failure prints the underlying cause
  with credentials redacted. A running hosted instance only checks that the schema is current and reports a clear error
  otherwise. Local files are migrated when opened, as before.
- *Infrastructure errors are not "not found".* A database that cannot be opened or reached becomes
  `DatabaseUnavailableError` and a retryable `503 database_unavailable`; only a genuinely missing or foreign attempt is
  `404 attempt_not_found`. Credentials never appear in errors or logs (message redaction in the database layer and in
  the logger).
- *Credentials are server-only.* They are read in `src/server/config/env.ts` (a `server-only` module), never use the
  `NEXT_PUBLIC_` prefix and are checked absent from the client bundle by the build verification.

**Not verified here.** No real Turso database could be reached from the development environment, so behaviour that
depends on the hosted service has not been observed: latency of the ~20 statements of one attempt, behaviour of
migration 0004 and the BLOB round trip on the hosted engine, foreign-key enforcement defaults on hosted connections,
and write contention between simultaneous instances. Tests use the same code against local libSQL files (including two
connections to one file standing in for two instances) and a fake HTTP server for client initialisation. The exact
steps to validate against a real database are in `docs/DEPLOY_VERCEL.md`.

**Risks and later options.** Recordings in the database grow it by ~2 MB per attempt (move to object storage when
volume matters); login rate limiters remain per instance; each request pays hosted-database latency.
