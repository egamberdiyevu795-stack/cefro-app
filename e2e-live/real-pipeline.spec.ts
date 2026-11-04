import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { evidenceViolations, wordErrorRate } from "../test/live/checks";
import { BROWSER_ANSWER_TEXT, LEAD_IN_SECONDS } from "./global-setup";
import type { EvaluationResult } from "../src/domain/evaluation/schema";

/**
 * One real-provider browser flow: the real recorder path → upload → real transcription → real evaluation →
 * feedback on screen, then the stored attempt read back through the API. Marked NOT RUN when keys are absent.
 */
const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
const wav = path.join(process.cwd(), "eval-audio", "browser-answer.wav");

test("browser → real recording path → real transcription → real evaluation → feedback", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("pageerror", (error) => consoleProblems.push(String(error)));
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text())) consoleProblems.push(m.text());
  });

  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", wav], { encoding: "utf8" });
  const speechSeconds = Number.parseFloat(probe.stdout);
  expect(speechSeconds).toBeGreaterThan(LEAD_IN_SECONDS + 10);

  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click(); // opens the (fake) microphone: playback starts now
  await expect(page.getByText("to prepare")).toBeVisible();
  await page.getByRole("button", { name: /start speaking/ }).click();
  await expect(page.getByRole("button", { name: "Finish answer" })).toBeVisible();
  // Preparation is skipped immediately, so recording starts about a second after playback began: wait for the speech to end.
  await page.waitForTimeout((speechSeconds + 1.5) * 1000);
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Finish answer" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page.getByRole("button", { name: "Submit for feedback" }).click();

  // Real transcription + real evaluation. Generous: observed ~15-45 s, regeneration possible.
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 4 * 60_000 });
  const endToEndMs = Date.now() - startedAt;
  await expect(page.getByText("Development evaluator")).toHaveCount(0); // not the mock

  // Read the stored attempt back through the API, the way the page does.
  const list = await (await page.request.get("/api/speaking/tasks/b2-part2-advice-from-someone/attempts")).json();
  expect(list.attempts).toHaveLength(1);
  const { attempt } = await (await page.request.get(`/api/speaking/attempts/${list.attempts[0].id}`)).json();

  expect(attempt.status).toBe("completed");
  expect(attempt.transcript.provider).toBe(process.env.TRANSCRIPTION_PROVIDER || "openai");
  expect(attempt.evaluation.meta.isDevelopmentProvider).toBe(false);
  expect(["gemini", "anthropic"]).toContain(attempt.evaluation.meta.provider);
  expect(attempt.evaluation.meta.evaluatorVersion).toMatch(/^speaking-evaluator\//);

  const wer = wordErrorRate(BROWSER_ANSWER_TEXT, attempt.transcript.text);
  expect(wer, "the transcript of what the browser recorded must correspond to the speech that was played").toBeLessThan(0.4);
  const violations = evidenceViolations(attempt.evaluation.result as EvaluationResult, attempt.transcript.text);
  expect(violations).toEqual([]);
  expect(attempt.metrics.wordCount).toBeGreaterThan(40);

  // Evidence for the report (no secrets in anything written here).
  fs.mkdirSync("eval-reports", { recursive: true });
  await page.screenshot({ path: "eval-reports/browser-real-feedback.png", fullPage: true });
  const summary = {
    transcription: { provider: attempt.transcript.provider, model: attempt.transcript.model },
    evaluation: attempt.evaluation.meta,
    wordErrorRate: Number(wer.toFixed(3)),
    words: attempt.metrics.wordCount,
    recordedSeconds: attempt.recordingDurationMs / 1000,
    endToEndSecondsAfterFinish: Number((endToEndMs / 1000).toFixed(1)),
    level: attempt.evaluation.result.overall_level,
  };
  fs.writeFileSync("eval-reports/browser-real-pipeline.json", JSON.stringify(summary, null, 2));
  console.log(`\nBROWSER REAL-PROVIDER RESULT ${JSON.stringify(summary)}\n`);
  expect(consoleProblems).toEqual([]);
});
