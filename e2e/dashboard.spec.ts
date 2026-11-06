import { expect, test, type Page } from "@playwright/test";

const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
/** Black buttons and links (the goal bar's black check square is a glyph, not a button). */
const BLACK = ":is(a, button).bg-primary.text-on-primary";

/** "YYYY-MM-DD", `days` from today in Uzbekistan (the app's calendar). */
function dayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const shown = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(2, 4)}`;

async function recordAnswer(page: Page) {
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / })).toBeVisible({ timeout: 60_000 });
}

/** Black buttons in the page content (the active nav square is in the nav, outside <main>). */
const blacks = (page: Page) => page.getByRole("main").locator(BLACK);

test("new student: the first visit, with the exam date question; saving a date shows the countdown", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(blacks(page)).toHaveCount(1);
  await expect(page.getByTestId("part-tile")).toHaveCount(4);
  for (const tile of await page.getByTestId("part-tile").all()) await expect(tile.getByRole("link")).toHaveText("Start");
  await expect(page.getByRole("heading", { name: "Speaking progress" })).toHaveCount(0);

  // A date in the past can't be saved.
  const picker = page.getByLabel("When is your exam?");
  await picker.fill(dayFromToday(-3));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose today or a later date.");

  const exam = dayFromToday(23);
  await picker.fill(exam);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
  await expect(page.getByText(shown(exam))).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days"); // stored, not just on screen
  await expect(blacks(page)).toHaveCount(1);
});

test("Skip: the question is not asked again", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByLabel("When is your exam?")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(page.getByLabel("When is your exam?")).toHaveCount(0);
});

test("after answers: real level, skills, Practise next, exam parts, biggest fix and recent attempts; Edit the exam date", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await recordAnswer(page);
  await page.goto("/dashboard");

  // Level from the one scored answer.
  await expect(page.getByTestId("current-level")).toHaveText(/^(Below B1|B1|B2|Above B2)$/);
  await expect(page.getByTestId("level-basis").first()).toHaveText("Based on your last answer");
  await expect(page.getByText(/^\d of [45] skills at B2$/)).toBeVisible();
  await expect(page.getByText(/^Up from/)).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your level in each skill" })).toBeVisible();

  // Exam parts: Part 2 has a band, the others say Start.
  const tiles = page.getByTestId("part-tile");
  await expect(tiles.nth(2)).toContainText(/Band [0-5]/);
  await expect(tiles.nth(2).getByRole("link")).toHaveText("Practise");
  for (const i of [0, 1, 3]) await expect(tiles.nth(i).getByRole("link")).toHaveText("Start");

  // Biggest fix from that answer; with one answer there is nothing to compare ("Still in" hidden).
  const fix = page.getByRole("region", { name: "Biggest fix" });
  await expect(fix.getByRole("link", { name: "Start retry" })).toHaveAttribute("href", /\?retry=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("still-in")).toHaveCount(0);

  // Practise next: the one black button.
  await expect(blacks(page)).toHaveCount(1);
  const next = page.getByRole("region", { name: "Advice from someone" });
  await expect(next).toContainText("Practise next");
  await expect(next.locator(BLACK)).toHaveText("Start");

  // The exam date question is on the returning dashboard too.
  const exam = dayFromToday(10);
  await page.getByLabel("When is your exam?").fill(exam);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 10 days");
  await page.getByRole("button", { name: "Edit exam date" }).click();
  await page.getByLabel("Change your exam date").fill(dayFromToday(1));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 1 day");

  // Two more answers: based on the last 3, and "Still in" appears when the problem repeats.
  await recordAnswer(page);
  await recordAnswer(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("level-basis").first()).toHaveText("Based on your last 3 answers");
  await expect(page.getByRole("region", { name: "Recent attempts" }).getByRole("link", { name: /Advice from someone/ })).toHaveCount(3);
  await expect(blacks(page)).toHaveCount(1);

  // Another browser sees none of it.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/dashboard");
  await expect(otherPage.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(otherPage.getByTestId("exam-countdown")).toHaveCount(0);
  await other.close();

  // Phone: no horizontal scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
