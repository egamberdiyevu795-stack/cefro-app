import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * The real Part 3 flow (record, upload, score, stored result, History) in a browser at 390 px. Part 3 is not live
 * (`PART_LIVE["3"]` is false), so this runs on its own `next dev` servers with the test-only switch
 * CEFRO_TEST_PART3_LIVE=1 (src/config/features.ts; ignored in production builds and on Vercel). Two variants, run in turn:
 *   - scored (default):  the mock transcriber and the Part 3 mock evaluator (no model is ever called);
 *   - E2E_P3_VARIANT=nokey:  EVALUATION_PROVIDER=anthropic with no key, so AI scoring cannot run: the recording is kept
 *              and the page says "AI score not ready yet" (Part 3 and Part 2).
 * Throwaway databases. `npm run test:e2e:part3` runs both.
 */
const NO_KEY = process.env.E2E_P3_VARIANT === "nokey";
// Parts 1.1 and 3 are live by default since 2026-11-15. These suites test them closed (Part 3 opens by its test switch
// where a suite needs it); set here too so the specs, which read PART_LIVE themselves, agree with the server.
process.env.PART_1_1_LIVE = "false";
process.env.PART_3_LIVE = "false";
const PORT = Number(process.env.E2E_P3_PORT ?? (NO_KEY ? 3161 : 3160));
const runId = (process.env.E2E_RUN_ID ??= String(Date.now()));
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e",
  testMatch: ["part3-real.spec.ts"],
  // One variant per run (next dev allows one server per directory): `npm run test:e2e:part3` runs both in turn.
  grep: NO_KEY ? /@nokey/ : /@scored/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    launchOptions: { executablePath, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  webServer: {
    // scripts/ci/start-dev-server.mjs: waits for the port to be free, trims a runaway dev cache, then runs `next dev`.
    command: `node scripts/ci/start-dev-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // A cold start takes about 10 s; a slow disk was seen to take far longer, so allow five minutes.
    timeout: 300_000,
    env: {
      PART_1_1_LIVE: "false",
      PART_3_LIVE: "false",
      CEFRO_TEST_PART3_LIVE: "1",
      TRANSCRIPTION_PROVIDER: "mock",
      DATABASE_PATH: `./data/e2e/${runId}-p3-${NO_KEY ? "nokey" : "scored"}.db`,
      AUDIO_STORAGE_DIR: `./data/e2e/${runId}-p3-${NO_KEY ? "nokey" : "scored"}-audio`,
      // An empty key counts as missing (getEnv): scoring cannot run, recording and transcription still can.
      ...(NO_KEY ? { EVALUATION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" } : { EVALUATION_PROVIDER: "mock" }),
    },
  },
});
