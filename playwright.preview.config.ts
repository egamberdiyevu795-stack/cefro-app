import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Mock mode on a production build started the way a Vercel Preview with no environment variables runs it:
 * NODE_ENV=production, VERCEL=1, VERCEL_ENV=preview, nothing else (no provider, key, database or auth secret).
 * The database path points at a place that cannot be created (like a Preview's read-only disk), so any page that
 * touched the database would fail. Runs e2e/mock-mode.spec.ts, the mock-mode parts of e2e/profile-settings.spec.ts, e2e/entry-pages.spec.ts, e2e/no-dead-controls.spec.ts, e2e/part1-practice.spec.ts, e2e/part3.spec.ts and e2e/consent-lock.spec.ts
 * (`npm run test:e2e:preview`, which builds first).
 */
// Parts 1.1 and 3 are live by default since 2026-11-15. These suites test them closed (Part 3 opens by its test switch
// where a suite needs it); set here too so the specs, which read PART_LIVE themselves, agree with the server.
process.env.PART_1_1_LIVE = "false";
process.env.PART_1_2_LIVE = "false";
process.env.PART_3_LIVE = "false";
const PORT = Number(process.env.E2E_PREVIEW_PORT ?? 3150);
process.env.E2E_PREVIEW = "1"; // read by the spec (the workers re-read this file)
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
// Under a file, so it can never be created (ENOTDIR at once), like the read-only disk of a Preview.
const NO_DISK = "/dev/null/cefro-preview-has-no-disk";

export default defineConfig({
  testDir: "e2e",
  testMatch: ["mock-mode.spec.ts", "profile-settings.spec.ts", "teacher-view.spec.ts", "entry-pages.spec.ts", "no-dead-controls.spec.ts", "part1-practice.spec.ts", "part3.spec.ts", "consent-lock.spec.ts", "exam-laptop.spec.ts"],
  timeout: 90_000,
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
    // `env -i`: only these variables reach the server, like a Preview with none set in the Vercel project.
    // PART_1_1_LIVE / PART_1_2_LIVE / PART_3_LIVE=false: those parts are live by default (2026-11-15, 1.2 since 2026-11-24); the specs test them closed.
    command: `env -i PATH="$PATH" HOME="$HOME" PART_1_1_LIVE=false PART_1_2_LIVE=false PART_3_LIVE=false NODE_ENV=production VERCEL=1 VERCEL_ENV=preview DATABASE_PATH=${NO_DISK}/cefro.db AUDIO_STORAGE_DIR=${NO_DISK}/audio npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/?mock=1`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
