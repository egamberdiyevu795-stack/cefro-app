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
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CEFRO_TEST_PART3_LIVE: "1",
      TRANSCRIPTION_PROVIDER: "mock",
      DATABASE_PATH: `./data/e2e/${runId}-p3-${NO_KEY ? "nokey" : "scored"}.db`,
      AUDIO_STORAGE_DIR: `./data/e2e/${runId}-p3-${NO_KEY ? "nokey" : "scored"}-audio`,
      // An empty key counts as missing (getEnv): scoring cannot run, recording and transcription still can.
      ...(NO_KEY ? { EVALUATION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" } : { EVALUATION_PROVIDER: "mock" }),
    },
  },
});
