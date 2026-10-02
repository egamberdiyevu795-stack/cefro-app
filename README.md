# CEFRO

CEFR / Multilevel speaking preparation. This repository currently contains the
first vertical slice:

**B2 Part 2 task → preparation → recording → speech-to-text → AI evaluation →
personalised feedback → retry → attempt comparison.**

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it is built and why.

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
EVALUATION_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

All variables are documented in [`.env.example`](.env.example). They are read
server-side only.

## Scripts

| Command               | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Development server                                   |
| `npm run build`       | Production build                                     |
| `npm run start`       | Serve the production build                           |
| `npm run check`       | Lint + typecheck + tests (run before pushing)        |
| `npm test`            | Unit and integration tests (Vitest)                  |
| `npm run db:generate` | Generate a SQL migration after editing the DB schema |

## Deployment notes

The slice uses SQLite and local-disk audio storage, so it needs a Node.js host
with a **persistent disk** (a VPS, Railway, Fly.io, Render with a volume, …).
It will not keep data on serverless platforms with ephemeral filesystems
(e.g. Vercel) until the database and audio storage are switched to hosted
services — see "Replacing providers" in the architecture doc.
