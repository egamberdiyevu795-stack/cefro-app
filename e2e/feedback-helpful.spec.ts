import { expect, test, type Page } from "@playwright/test";
import { querySql } from "./db";
import { shortPartIntros } from "./short-intro";

/*
 * "Was this feedback helpful?" on the result page: one tap, the answer is stored with the attempt, the question is
 * replaced by a thank-you, and a reload shows the stored answer. Demo results say thanks and send nothing. Phone
 * screenshots (390 px) for the design system: before and after the tap.
 */
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
const SHOTS = "docs/design-system";
const resultHeading = (page: Page) => page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / });

async function scoredAttempt(page: Page): Promise<string> {
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
  return page.url().split("/result/")[1];
}

test("real attempt (phone): Yes is stored with the attempt, the thank-you replaces the question, a reload shows the answer", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await shortPartIntros(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const id = await scoredAttempt(page);

  const card = page.getByTestId("feedback-helpful");
  await expect(card.getByRole("heading", { name: "Was this feedback helpful?" })).toBeVisible();
  const yes = card.getByRole("button", { name: "Yes", exact: true });
  const no = card.getByRole("button", { name: "No", exact: true });
  await expect(yes).toBeEnabled();
  // Quiet grey pills: the page's one black button is still "Retry with this goal".
  await expect(yes).toHaveClass(/bg-well/);
  await expect(no).toHaveClass(/bg-well/);
  await expect(page.getByRole("main").locator(":is(a, button).bg-primary.text-on-primary")).toHaveCount(1);
  // It comes right after the Biggest fix.
  const fixBottom = await page.getByRole("heading", { name: "Biggest fix", exact: true }).evaluate((el) => el.closest("section")!.getBoundingClientRect().bottom);
  const cardTop = await card.evaluate((el) => el.getBoundingClientRect().top);
  expect(cardTop).toBeGreaterThan(fixBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -260));
  await page.screenshot({ path: `${SHOTS}/feedback-helpful-before-phone.png` });

  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/speaking/attempts/${id}/feedback`) && r.request().method() === "POST");
  await yes.tap();
  expect((await saved).status()).toBe(200);
  await expect(page.getByTestId("feedback-helpful-thanks")).toHaveText("Thanks for telling us. Your answer helps us make the feedback better.");
  await expect(card.getByRole("button")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/feedback-helpful-after-phone.png` });

  const rows = await querySql("SELECT feedback_helpful AS helpful, feedback_helpful_at AS at FROM speaking_attempts WHERE id = ?", [id]);
  expect(rows).toHaveLength(1);
  expect(rows[0].helpful).toBe(1);
  expect(String(rows[0].at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  await page.reload();
  await expect(resultHeading(page)).toBeVisible();
  await expect(page.getByTestId("feedback-helpful-thanks")).toHaveText("You found this feedback helpful.");
  await expect(page.getByTestId("feedback-helpful").getByRole("button")).toHaveCount(0);
  expect(errors).toEqual([]);
  await context.close();
});

test("real attempt: a failed save keeps the question with a message, and No works on the next tap", async ({ page }) => {
  const id = await scoredAttempt(page);
  let fail = true;
  await page.route(`**/api/speaking/attempts/${id}/feedback`, (route) => (fail ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
  const card = page.getByTestId("feedback-helpful");
  await card.getByRole("button", { name: "No", exact: true }).click();
  await expect(card.getByTestId("feedback-helpful-error")).toHaveText("We couldn't save your answer. Please try again.");
  fail = false;
  await card.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.getByTestId("feedback-helpful-thanks")).toContainText("Thanks for telling us.");
  expect((await querySql("SELECT feedback_helpful AS helpful FROM speaking_attempts WHERE id = ?", [id]))[0].helpful).toBe(0);
});

test("demo result (mock mode): the thank-you appears and nothing is sent", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/feedback")) sent.push(r.url());
  });
  await page.goto("/result?mock=1");
  const card = page.getByTestId("feedback-helpful");
  await card.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByTestId("feedback-helpful-thanks")).toContainText("Thanks for telling us.");
  await page.goto("/result/part3?demo=p3.c1-part3-cars-in-city-centres.F1F2A1A2&mock=1");
  await page.getByTestId("feedback-helpful").getByRole("button", { name: "No", exact: true }).click();
  await expect(page.getByTestId("feedback-helpful-thanks")).toContainText("Thanks for telling us.");
  expect(sent).toEqual([]);
});
