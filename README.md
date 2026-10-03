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

The SQLite database (`./data/cefro.db`) is created and migrated automatically on
the first request. Recorded audio is stored under `./data/audio`.

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

### Running with real providers

```bash
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
EVALUATION_PROVIDER=gemini        # or: anthropic
GEMINI_API_KEY=...                # or: ANTHROPIC_API_KEY=sk-ant-...
```

Only the selected provider's key is needed. Transcription currently supports OpenAI only,
so with just a Gemini key you can validate evaluation (`npm run eval:live`) but not
real-speech transcription.

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
| `npm run eval:live`   | Run the evaluation sample set on the REAL evaluator chosen by `EVALUATION_PROVIDER` (costs money) |
| `npm run eval:transcription` | Transcribe real recordings in `local-samples/` |
| `npm run stats`       | Latency, token and quality-gate summary          |
| `npm run db:generate` | Generate a SQL migration after editing the DB schema |

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: lint, typecheck, unit and integration tests
(including the migration tests), the production build, and the browser tests (mock providers, fake
microphone). It uses no secrets and makes no real provider call. The real-Gemini validation is a separate,
manual workflow (`live-evaluation.yml`) because it spends API budget.

## Deployment notes

The slice uses SQLite and local-disk audio storage, so it needs a Node.js host
with a **persistent disk** (a VPS, Railway, Fly.io, Render with a volume, …).
It will not keep data on serverless platforms with ephemeral filesystems
(e.g. Vercel) until the database and audio storage are switched to hosted
services — see "Replacing providers" in the architecture doc.
