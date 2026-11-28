import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the practice loop. They run against `next dev` with the
 * development (mock) providers and a throwaway database, and use Chromium's
 * fake microphone. Real providers are validated separately (npm run eval:live).
 */
// Parts 1.1 and 3 are live by default since 2026-11-15. These suites test them closed (Part 3 opens by its test switch
// where a suite needs it); set here too so the specs, which read PART_LIVE themselves, agree with the server.
process.env.PART_1_1_LIVE = "false";
process.env.PART_1_2_LIVE = "false";
process.env.PART_3_LIVE = "false";
const PORT = Number(process.env.E2E_PORT ?? 3100);
// One id per run, shared with the test workers (they re-read this file), so a test can reach the run's database.
const runId = (process.env.E2E_RUN_ID ??= String(Date.now()));
// Use a system Chromium when the Playwright-managed browser is not installed (e.g. CI images).
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e",
  // Part 3's real flow needs PART_LIVE["3"] on: it runs on its own servers (playwright.part3.config.ts), so every
  // other spec keeps seeing Part 3 as "Coming soon".
  testIgnore: ["part3-real.spec.ts", "exam-laptop-real.spec.ts"],
  timeout: 90_000,
  // `next dev` compiles each route on first use. On a cold CI runner the first test waits for the account API to
  // compile, which can exceed the default 5 s assertion timeout (seen on CI as a failure of the very first test only).
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
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
      // Parts 1.1 and 3 are live by default (2026-11-15); this suite tests them closed, as the unit suite does.
      PART_1_1_LIVE: "false",
      PART_1_2_LIVE: "false",
      PART_3_LIVE: "false",
      TRANSCRIPTION_PROVIDER: "mock",
      EVALUATION_PROVIDER: "mock",
      DATABASE_PATH: `./data/e2e/${runId}.db`,
      AUDIO_STORAGE_DIR: `./data/e2e/${runId}-audio`,
      // Test runs only: lets a test choose its client address (x-forwarded-for) for the per-IP sign-up limit. Ignored
      // by production builds and on Vercel (src/server/auth/auth-limits.ts, clientIp).
      CEFRO_TEST_CLIENT_IP: "1",
      // "Forgot password" emails are not sent by the dev server: they are appended here (one JSON line each), and
      // e2e/forgot-password.spec.ts opens the link from this file.
      EMAIL_OUTBOX_FILE: `./data/e2e/${runId}-outbox.jsonl`,
    },
  },
});
