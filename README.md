# CEFRO

CEFR / Multilevel speaking preparation. This repository currently contains the
first vertical slice:

**B2 Part 2 task → preparation → recording → speech-to-text → AI evaluation →
personalised feedback → retry → attempt comparison.**

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it is built and why,
[`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) for the foundation decisions (tasks and
rubrics, sessions, identity, usage limits, migrations), and
[`docs/AI_EVALUATION_QUALITY.md`](docs/AI_EVALUATION_QUALITY.md) for how AI feedback
quality is checked and validated.

## Quick start

Requirements: Node.js ≥ 20.9 (developed on 22), npm.

```bash
npm install
cp .env.example .env.local     # then edit
npm run dev                    # http://localhost:3000
```

Without any Turso variables the app uses a local SQLite file (`./data/cefro.db`, created and migrated automatically on
the first request) and stores recorded audio under `./data/audio`. Nothing about local development needs a hosted
database. With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set (hosting, see below) it uses the hosted database instead.

### Running without API keys

Set both providers to `mock` in `.env.local`:

```bash
TRANSCRIPTION_PROVIDER=mock
EVALUATION_PROVIDER=mock
```

The mock transcriber returns a canned learner answer (it does not listen to the
audio), and the mock evaluator uses simple heuristics. Results from the mock
evaluator are clearly labelled in the UI. Both are refused when
`NODE_ENV=production`.

### Accounts

Practice works without an account. `/register` and `/login` add optional accounts (email + password, via the
`better-auth` library); what an anonymous visitor practised is attached to the account when they register or sign in.
In production set `AUTH_SECRET` (32+ random characters) and `APP_URL` (https): the server refuses to start healthy
without them. Email is not verified and there is no password reset yet. Design and limits:
[`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md#11-identity-and-accounts-stage-4).

### Trying it on a public URL (Vercel)

See [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md): four environment variables and a project import. It is a test deployment
with temporary storage, not production.

### Running with real providers

```bash
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
EVALUATION_PROVIDER=gemini        # or: anthropic
GEMINI_API_KEY=...                # or: ANTHROPIC_API_KEY=sk-ant-...
```

Only the selected provider's key is needed. Transcription supports OpenAI and Gemini
(`TRANSCRIPTION_PROVIDER=gemini`, temporary, validated on synthetic speech only;
see `docs/AI_EVALUATION_QUALITY.md`). Real providers run the Speech Activity Guard, which needs ffmpeg
(on `PATH`, `FFMPEG_PATH`, or the bundled `ffmpeg-static`).

With real providers the server checks its configuration when it starts (production refuses to come up
healthy with a missing key or a mock provider) and refuses uploads with a 503 if it is misconfigured; it never
prints key values.

All variables (including model, effort, timeouts and usage limits) are documented in
[`.env.example`](.env.example). They are read server-side only. Before relying on
real feedback, run the validation steps in `docs/AI_EVALUATION_QUALITY.md` §6.

## Scripts

| Command               | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Development server                                   |
| `npm run build`       | Production build                                     |
| `npm run start`       | Serve the production build                           |
| `npm run check`       | Lint + typecheck + tests (run before pushing)        |
| `npm test`            | Unit and integration tests (Vitest)                  |
| `npm run test:e2e`    | Browser tests (Playwright, mock providers, fake mic) |
| `npm run eval:live`   | Run the Part 2 band anchors (exact 0–5 band) on the REAL evaluator chosen by `EVALUATION_PROVIDER` (costs money) |
| `npm run eval:transcription` | Transcribe real recordings in `local-samples/` |
| `npm run eval:transcription:controlled` | Real OpenAI transcription of generated test audio (needs `OPENAI_API_KEY`, ffmpeg) |
| `npm run eval:pipeline` | Real audio → OpenAI → Gemini → gate → database, with persistence and evidence checks |
| `npm run test:e2e:live` | One real-provider browser flow (fake microphone playing speech) |
| `npm run stats`       | Latency, token and quality-gate summary          |
| `npm run db:generate` | Generate a SQL migration after editing the DB schema |

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and as the first stage of every production deploy (in one job): lint, typecheck, unit and integration tests
(including the migration tests), the production build, and the browser tests (mock providers, fake
microphone). It uses no secrets and makes no real provider call. The real-Gemini validation is a separate,
manual workflow (`live-evaluation.yml`) because it spends API budget; `live-pipeline.yml` is the manual workflow for real OpenAI transcription and the full pipeline (needs the `OPENAI_API_KEY` and `GEMINI_API_KEY` secrets).

## Deployment notes

The app is ready for serverless hosting (Vercel) once two variables are provided:

- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` select the hosted libSQL (Turso) database. Attempts, accounts, sessions
  **and the recordings** (table `recording_blobs`, behind the `AudioStorage` interface) live there, so every function
  instance sees the same data. They are server-only variables.
- Deployment is automatic: a push to `main` runs `.github/workflows/deploy.yml` (checks → migrate the hosted database →
  verify → `vercel deploy --prod` → health check at `/api/health`) once the repository variable `CEFRO_AUTO_DEPLOY=true`
  arms it after the first, manual, rollout. The Vercel build itself (`next build`) never connects to the database, and Preview
  deployments never migrate anything. One-time setup and the safety rules: `docs/DEPLOY_VERCEL.md`.
- Without those variables (local development, tests, a host with a persistent disk) the app uses a SQLite file and
  local audio, as before.

Step by step, and what has and has not been verified against a real Turso database: `docs/DEPLOY_VERCEL.md`.
