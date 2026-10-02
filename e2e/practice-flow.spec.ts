import { expect, test, type Page } from "@playwright/test";

const TASK_URL = "/practice/speaking/b2-part2-technology-young-people";

async function recordAndSubmit(page: Page, speakMs = 2500) {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await page.getByRole("button", { name: /start speaking/ }).click();
  await expect(page.getByRole("button", { name: "Finish answer" })).toBeVisible();
  await page.waitForTimeout(speakMs);
  await page.getByRole("button", { name: "Finish answer" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page.getByRole("button", { name: "Submit for feedback" }).click();
}

test("full loop: prepare, record, feedback, retry with focus, honest comparison, history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await page.getByText("Start practice").click();
  await expect(page.getByRole("heading", { name: "Technology and young people" })).toBeVisible();

  // Attempt 1
  await recordAndSubmit(page);
  await expect(page.getByText("Preparing your feedback")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Development evaluator").first()).toBeVisible();
  await expect(page.getByText("Your focus for the next attempt")).toBeVisible();
  await expect(page.getByText("Did you answer every point?")).toBeVisible();
  await expect(page.getByText("Pronunciation").locator("..").getByText("Not assessed")).toBeVisible();

  // The retry CTA comes before the secondary detail (other issues, scores, transcript).
  const ctaBox = await page.getByRole("button", { name: "Retry this task" }).boundingBox();
  const scoresBox = await page.getByText("Scores by criterion").boundingBox();
  expect(ctaBox!.y).toBeLessThan(scoresBox!.y);

  // Attempt 2 (retry)
  await page.getByRole("button", { name: "Retry this task" }).click();
  await expect(page.getByRole("heading", { name: "Your focus" })).toBeVisible();
  await recordAndSubmit(page, 3000);
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Your focus this time")).toBeVisible();

  // Comparison — identical mock answers must not be shown as progress.
  await page.getByRole("button", { name: "Compare with attempt 1" }).click();
  await expect(page.getByRole("heading", { name: "Attempt 1 vs Attempt 2" })).toBeVisible();
  await expect(page.getByText(/About the same|Slightly/)).toBeVisible();
  await expect(page.getByText("clearly better")).toHaveCount(0);
  await expect(page.getByText("Practise next")).toBeVisible();

  // Reload: attempts persist and can be reopened.
  await page.goto(TASK_URL);
  await expect(page.getByRole("button", { name: /Attempt 2/ })).toBeVisible();
  await page.getByRole("button", { name: /Attempt 1/ }).click();
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("microphone permission denied shows guidance", async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  const page = await context.newPage();
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("Microphone access is blocked")).toBeVisible();
  await context.close();
});

test("upload failure keeps the recording and it can be resent", async ({ page }) => {
  let blockUpload = true;
  await page.route("**/api/speaking/attempts", (route) =>
    blockUpload && route.request().method() === "POST" ? route.abort("connectionreset") : route.continue(),
  );
  await page.goto(TASK_URL);
  await recordAndSubmit(page, 1500);
  await expect(page.getByText("Your recording wasn't sent")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download a copy" })).toBeVisible();
  blockUpload = false;
  await page.getByRole("button", { name: "Try sending again" }).click();
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
});

test("a failed evaluation shows a friendly message and can be retried without re-recording", async ({ page }) => {
  // Make the first status poll report an evaluation failure, as the server would.
  let failOnce = true;
  await page.route(/\/api\/speaking\/attempts\/[0-9a-f-]+$/, async (route) => {
    if (!failOnce || route.request().method() !== "GET") return route.continue();
    failOnce = false;
    const response = await route.fetch();
    const body = await response.json();
    body.attempt = { ...body.attempt, status: "failed", failure: { stage: "evaluation", code: "evaluation_quality_rejected" }, evaluation: null };
    return route.fulfill({ response, json: body });
  });
  await page.goto(TASK_URL);
  await recordAndSubmit(page, 1500);
  await expect(page.getByText("We couldn't prepare your feedback")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/quality|rejected|Error/i)).toHaveCount(0); // no technical details
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
});

test("mobile layout has no horizontal scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto(TASK_URL);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});
