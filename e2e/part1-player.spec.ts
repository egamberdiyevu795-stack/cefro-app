import { expect, test, type Page } from "@playwright/test";

/**
 * Part 1 question-by-question player on the dev page (docs/part1-plan.md §1). Timings are shortened with the dev
 * page's timeScale (0.05: 30 s → 1.5 s) so a whole part runs in a few seconds; the content timings themselves are
 * checked in unit tests and shown on the page.
 */
const SCALE = 0.05;

/**
 * The spoken introduction is real-time audio (about 17 s; timeScale doesn't shorten audio). Tests that are not about
 * it serve Question 1's short file in its place, so the part starts after a few seconds.
 */
async function shortIntro(page: Page) {
  await page.route("**/v1/intro.wav", async (route) => {
    const url = route.request().url().replace("/intro.wav", "/q1.wav").replace("/b1-part1-2-shopping/v1/q1.wav", "/b1-part1-2-shopping/v1/q4.wav");
    await route.fulfill({ response: await route.fetch({ url }) });
  });
}

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
  await shortIntro(page);
  await page.goto(`/dev/part1-player?task=a2-part1-1-daily-life&timeScale=${SCALE}`);
  await expect(page.getByTestId("content-timings")).toContainText("30 s · 30 s · 30 s (preparation 5 s · 5 s · 5 s)");

  await page.getByRole("button", { name: "Start" }).click();
  const card = page.getByTestId("sequence-question");
  const texts = ["What do you usually do at the weekend?", "What is your favourite food? Why?", "Who do you spend the most time with in your family?"];

  for (const [i, text] of texts.entries()) {
    await expect(page.getByTestId("question-counter")).toHaveText(`Question ${i + 1} of 3`);
    await expect(page.getByTestId("question-text")).toHaveText(text);
    // Question audio: recorder not recording (not started yet for Q1, paused afterwards).
    if (i > 0) {
      await expect(card).toHaveAttribute("data-step", /prompt|preparing|chime/);
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
  // 3 × 1.5 s of speech. Had the recorder kept running through Questions 2 and 3 (about 3.3 s each) and the chimes,
  // the file would be over 11 s long.
  const seconds = await recordingSeconds(page);
  expect(seconds).toBeGreaterThan(3.5);
  expect(seconds).toBeLessThan(6);
  await expect(page.getByTestId("audio-failures").locator("li")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a question audio that fails: the text stays, the countdown starts anyway, the failure is reported", async ({ page }) => {
  await page.route("**/a2-part1-1-daily-life/v1/q2.wav", (route) => route.abort());
  await shortIntro(page);
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

test("the chime is the code-made two-tone chime (no file): after the introduction, and at the start and end of each answer", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number[] };
    w.__tones = [];
    const originalStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      w.__tones.push(Math.round(this.frequency.value));
      return originalStart.apply(this, args);
    };
  });
  const audioFiles: string[] = [];
  page.on("request", (request) => {
    const file = new URL(request.url()).pathname;
    if (/\.(wav|mp3|ogg|m4a)$/.test(file)) audioFiles.push(file);
  });
  await shortIntro(page);
  await page.goto(`/dev/part1-player?task=a2-part1-1-daily-life&timeScale=${SCALE}`);
  await page.getByRole("button", { name: "Start" }).click();
  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
  expect(await page.evaluate(() => (window as unknown as { __tones: number[] }).__tones)).toEqual(Array(7).fill([659, 880]).flat()); // 1 sample + 3 × (start, time up)
  // Only the introduction and the three spoken questions are fetched; there is no chime file.
  expect(new Set(audioFiles.map((f) => f.split("/").pop()))).toEqual(new Set(["intro.wav", "q1.wav", "q2.wav", "q3.wav"]));
  await expect(page.getByTestId("audio-failures").locator("li")).toHaveCount(0);
});

test("Part 1.2: 45 + 30 + 30 s from the content, offsets follow", async ({ page }) => {
  await shortIntro(page);
  await page.goto(`/dev/part1-player?task=b1-part1-2-shopping&timeScale=${SCALE}`);
  await expect(page.getByTestId("content-timings")).toContainText("45 s · 30 s · 30 s (preparation 10 s · 5 s · 5 s)");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("question-text")).toHaveText("Look at the two pictures. Describe them and say how they are different.");
  const offsets = await readOffsets(page);
  expect(offsets).toHaveLength(3);
  expect(offsets[1]! - offsets[0]!).toBeGreaterThan(2050); // 45 s × 0.05 = 2.25 s
  expect(offsets[1]! - offsets[0]!).toBeLessThan(2650);
  expect(offsets[2]! - offsets[1]!).toBeGreaterThan(1300); // 30 s × 0.05 = 1.5 s
  expect(offsets[2]! - offsets[1]!).toBeLessThan(1900);
});
