import { expect, test, type Page } from "@playwright/test";
import { shortPartIntros } from "./short-intro";

// The Part 2 / Part 3 spoken introductions are shortened (e2e/short-intro.ts).
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
const BLACK = ".bg-primary.text-on-primary";
const resultHeading = (page: Page) => page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / });

/** Brief → preparation → recording → Finish anyway → the attempt's result page (mock providers). Returns its id. */
async function recordAnswer(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible(); // preparation has started
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
  return page.url().split("/result/")[1];
}

const historyRows = (page: Page) => page.getByRole("region", { name: "Your attempts" }).getByRole("listitem");

test("History: empty state, then the student's attempts newest first, retries, the part filter, the chart from 3 scored attempts, and the dashboard's Recent attempts", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  // Empty state, with the one black action.
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "No attempts yet" })).toBeVisible();
  await expect(page.getByRole("main").locator(BLACK)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Start your first practice" })).toHaveAttribute("href", TASK_URL);
  await expect(page.getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible(); // nothing scored: the first visit

  // Two attempts: a first one and its retry. Not enough scored attempts for the chart.
  await page.goto(TASK_URL);
  const first = await recordAnswer(page);
  await page.getByRole("button", { name: "Retry with this goal" }).click();
  // The retry brief is ready once its goal is shown (before that it offers no Start preparation).
  await expect(page.getByTestId("goal-card")).toContainText("Your goal:");
  const retry = await recordAnswer(page);

  await page.goto("/history");
  await expect(historyRows(page)).toHaveCount(2);
  await expect(historyRows(page).nth(0).getByRole("link")).toHaveAttribute("href", `/result/${retry}`);
  await expect(historyRows(page).nth(1).getByRole("link")).toHaveAttribute("href", `/result/${first}`);
  await expect(historyRows(page).nth(0)).toContainText("Retry");
  await expect(historyRows(page).nth(0)).toContainText(/Goal met|Not yet/);
  await expect(historyRows(page).nth(1)).not.toContainText("Retry");
  await expect(historyRows(page).nth(0)).toContainText(/Band [0-5] · /);
  await expect(page.getByRole("heading", { name: "Band over time" })).toHaveCount(0);
  await expect(page.getByRole("main").locator(BLACK)).toHaveCount(0);

  // The filter offers only the parts tried (Part 2 here).
  const filter = page.getByRole("navigation", { name: "Filter by part" });
  await expect(filter.getByRole("link")).toHaveText(["All", "Part 2"]);
  await filter.getByRole("link", { name: "Part 2" }).click();
  await expect(page).toHaveURL(/\/history\?part=2$/);
  await expect(filter.getByRole("link", { name: "Part 2" })).toHaveAttribute("aria-current", "true");

  // A row opens its result.
  await historyRows(page).nth(1).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/result/${first}$`));
  await expect(resultHeading(page)).toBeVisible();

  // A third scored attempt: the chart appears, with the target band.
  await page.goto(TASK_URL);
  const third = await recordAnswer(page);
  await page.goto("/history?part=2");
  await expect(historyRows(page)).toHaveCount(3);
  await expect(historyRows(page).nth(0).getByRole("link")).toHaveAttribute("href", `/result/${third}`);
  const chart = page.getByRole("region", { name: "Band over time" });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("Target · Band 3");
  await expect(chart.locator("table tbody tr")).toHaveCount(3);

  // Dashboard: the same rows, newest first, and See all leads here.
  await page.goto("/dashboard");
  const recent = page.getByRole("region", { name: "Recent attempts" });
  await expect(recent.getByRole("link", { name: /Advice from someone/ })).toHaveCount(3);
  await expect(recent.getByRole("link", { name: /Advice from someone/ }).first()).toHaveAttribute("href", `/result/${third}`);
  await recent.getByRole("link", { name: "See all attempts" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);

  // Another browser has none of these attempts.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/history");
  await expect(otherPage.getByRole("heading", { name: "No attempts yet" })).toBeVisible();
  expect(await otherPage.content()).not.toContain(first);
  await otherPage.goto("/dashboard");
  await expect(otherPage.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await other.close();

  // Phone: no horizontal scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  expect(errors).toEqual([]);
});
