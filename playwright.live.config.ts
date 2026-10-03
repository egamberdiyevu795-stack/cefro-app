import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * REAL-provider browser validation (manual; costs one OpenAI speech request, one transcription and one evaluation).
 * Never part of `npm run test:e2e` or CI. Run with `npm run test:e2e:live` (needs OPENAI_API_KEY and the evaluation
 * provider's key in the environment; they are passed only to the local server process and never written anywhere).
 *
 * Chromium's fake microphone plays a WAV file instead of a beep, so the REAL browser recording path runs
 * (getUserMedia → MediaRecorder → WebM/Opus → upload) on audio that contains actual speech. The speech is
 * synthetic (text-to-speech): see test/live/audio.ts for what that does and does not prove.
 */
const PORT = Number(process.env.E2E_LIVE_PORT ?? 3101);
const runId = Date.now();
export const MIC_FILE = path.join(process.cwd(), "eval-audio", "browser-answer.wav");
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e-live",
  globalSetup: "./e2e-live/global-setup.ts",
  timeout: 6 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath,
      // %noloop: play the speech once, then silence (the file is created by the global setup before the browser starts).
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC_FILE}%noloop`],
    },
    permissions: ["microphone"],
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // The real providers come from the caller's environment; only the throwaway storage paths are set here.
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_PATH: `./data/e2e-live/${runId}.db`,
      AUDIO_STORAGE_DIR: `./data/e2e-live/${runId}-audio`,
    },
  },
});
