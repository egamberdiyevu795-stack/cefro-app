import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Exam laptop mode with a REAL database and two browsers (docs/v1-plan.md, step 7): two "laptops" signed in as the same teacher,
 * one class, two students with class PINs. The Teacher view is not live (`TEACHER_LIVE` is false), so this runs on its own
 * `next dev` server with the test-only switches CEFRO_TEST_TEACHER_LIVE=1 and CEFRO_TEST_FULL_MOCK_LIVE=1 (src/config/features.ts;
 * ignored in production builds and on Vercel). Mock transcriber and mock evaluator: no model is ever called. Throwaway database
 * (`./data/e2e/<run id>.db`, the one e2e/db.ts may open). `npm run test:e2e:exam-laptop`.
 */
const PORT = Number(process.env.E2E_EXAM_PORT ?? 3170);
const runId = (process.env.E2E_RUN_ID ??= String(Date.now()));
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e",
  testMatch: ["exam-laptop-real.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
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
      CEFRO_TEST_TEACHER_LIVE: "1",
      CEFRO_TEST_FULL_MOCK_LIVE: "1",
      CEFRO_TEST_CLIENT_IP: "1",
      TRANSCRIPTION_PROVIDER: "mock",
      EVALUATION_PROVIDER: "mock",
      DATABASE_PATH: `./data/e2e/${runId}.db`,
      AUDIO_STORAGE_DIR: `./data/e2e/${runId}-audio`,
    },
  },
});
