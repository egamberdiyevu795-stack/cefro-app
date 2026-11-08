import { expect, test, type Page } from "@playwright/test";

/**
 * Part 1 question-by-question player on the dev page (docs/part1-plan.md §1). Timings are shortened with the dev
 * page's timeScale (0.05: 30 s → 1.5 s) so a whole part runs in a few seconds; the content timings themselves are
 * checked in unit tests and shown on the page.
 */
const SCALE = 0.05;

async function readOffsets(page: Page): Promise<number[]> {
  await expect(page.getByTestId("dev-result")).toBeVisible({ timeout: 30_000 });
  return JSON.parse((await page.getByTestId("offsets").textContent()) ?? "[]") as number[];
}

/** Duration of the one recording as the browser decodes it (Chrome's WebM needs a seek to report it). */
async function recordingSeconds(page: Page): Promise<number> {
  const audio = page.locator("audio").first();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => (Number.isFinite(el.duration) ? el.duration : -1)), { timeout: 15_000 })
    .toBeGreaterThan(0);
  return audio.evaluate((el: HTMLAudioElement) => el.duration);
}

test("Part 1.1: three questions in one recording, paused during question audio and chime", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`/dev/part1-player?task=a2-part1-1-daily-life&timeScale=${SCALE}`);
  await expect(page.getByTestId("content-timings")).toContainText("30 s · 30 s · 30 s (preparation 0 s · 0 s · 0 s)");

  await page.getByRole("button", { name: "Start" }).click();
  const card = page.getByTestId("sequence-question");
  const texts = ["What do you usually do at the weekend?", "What is your favourite food? Why?", "Who do you spend the most time with in your family?"];

  for (const [i, text] of texts.entries()) {
    await expect(page.getByTestId("question-counter")).toHaveText(`Question ${i + 1} of 3`);
    await expect(page.getByTestId("question-text")).toHaveText(text);
    // Question audio: recorder not recording (not started yet for Q1, paused afterwards).
    if (i > 0) {
      await expect(card).toHaveAttribute("data-step", /prompt|chime/);
      await expect(card).toHaveAttribute("data-recorder-state", "paused");
    }
    // At the chime the countdown starts and the recorder runs.
    await expect(card).toHaveAttribute("data-step", "speaking");
    await expect(card).toHaveAttribute("data-recorder-state", "recording");
    await expect(page.getByRole("timer")).toBeVisible();
    // The question text stays on screen while speaking (decision 18).
    await expect(page.getByTestId("question-text")).toHaveText(text);
  }

  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
  expect(offsets[0]).toBe(0);
  for (const [i, gap] of [offsets[1]! - offsets[0]!, offsets[2]! - offsets[1]!].entries()) {
    expect(gap, `gap ${i}`).toBeGreaterThan(1300);
    expect(gap, `gap ${i}`).toBeLessThan(1900);
  }
  // 3 × 1.5 s of speech. Had the recorder kept running through the three 1 s question files and the 0.4 s chimes,
  // the file would be over 8 s long.
  const seconds = await recordingSeconds(page);
  expect(seconds).toBeGreaterThan(3.5);
  expect(seconds).toBeLessThan(6);
  await expect(page.getByTestId("audio-failures").locator("li")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a question audio that fails: the text stays, the countdown starts anyway, the failure is reported", async ({ page }) => {
  await page.route("**/part1-1-q2.wav", (route) => route.abort());
  await page.goto(`/dev/part1-player?task=a2-part1-1-daily-life&timeScale=${SCALE}`);
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByTestId("question-counter")).toHaveText("Question 2 of 3", { timeout: 15_000 });
  await expect(page.getByTestId("question-text")).toHaveText("What is your favourite food? Why?");
  await expect(page.getByTestId("audio-failed-note")).toBeVisible();
  await expect(page.getByTestId("sequence-question")).toHaveAttribute("data-step", "speaking");
  await expect(page.getByTestId("question-text")).toHaveText("What is your favourite food? Why?");
  await expect(page.getByTestId("audio-failures")).toContainText("Q2 question: load_error");

  // The part goes on to the end.
  await expect(page.getByTestId("question-counter")).toHaveText("Question 3 of 3");
  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
});

test("a chime that fails still starts the countdown", async ({ page }) => {
  await page.route("**/chime.wav", (route) => route.abort());
  await page.goto(`/dev/part1-player?task=a2-part1-1-daily-life&timeScale=${SCALE}`);
  await page.getByRole("button", { name: "Start" }).click();
  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
  await expect(page.getByTestId("audio-failures").locator("li")).toHaveCount(3);
});

test("Part 1.2: 45 + 30 + 30 s from the content, offsets follow", async ({ page }) => {
  await page.goto(`/dev/part1-player?task=b1-part1-2-shopping&timeScale=${SCALE}`);
  await expect(page.getByTestId("content-timings")).toContainText("45 s · 30 s · 30 s (preparation 0 s · 0 s · 0 s)");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("question-text")).toHaveText("Look at the two pictures. Describe them and say how they are different.");
  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
  expect(offsets[1]! - offsets[0]!).toBeGreaterThan(2050); // 45 s × 0.05 = 2.25 s
  expect(offsets[1]! - offsets[0]!).toBeLessThan(2650);
  expect(offsets[2]! - offsets[1]!).toBeGreaterThan(1300); // 30 s × 0.05 = 1.5 s
  expect(offsets[2]! - offsets[1]!).toBeLessThan(1900);
});
