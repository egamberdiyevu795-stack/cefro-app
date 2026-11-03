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
  await expectPlayableAudio(page, speakMs);
  await page.getByRole("button", { name: "Submit for feedback" }).click();
}

/**
 * The player must know the recording's real length (Chrome's MediaRecorder WebM has no duration in its header, which
 * showed as "0:00 / 0:00"), and the recording must be playable.
 */
async function expectPlayableAudio(page: Page, minMs: number) {
  const audio = page.locator("audio").first();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => (Number.isFinite(el.duration) ? el.duration : -1)), { timeout: 15_000 })
    .toBeGreaterThan(minMs / 1000 - 1);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.error)).toBeNull();
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
  // Part band only: "Part 2: N/5 · label", the B2 target, and never an overall exam level or a /10 score.
  await expect(page.getByTestId("band-headline")).toHaveText(/^Part 2: [0-5]\/5 · (Above B2|Higher B2|Lower B2|Higher B1|Lower B1|Below B1)$/);
  await expect(page.getByText(/^(Meets B2 target|Below B2 target \(need 3\+\))$/)).toBeVisible();
  await expect(page.getByText(/estimated level|\/10\b|Scores by criterion/)).toHaveCount(0);
  await expect(page.getByTestId("provisional-note")).toHaveText(/Provisional: pronunciation not assessed/);
  await expect(page.getByTestId("feature-pronunciation").getByText("Not assessed", { exact: true })).toBeVisible();
  for (const feature of ["grammar", "vocabulary", "fluency", "cohesion"]) {
    await expect(page.getByTestId(`feature-${feature}`).getByText(/^(Above B2|B2|B1|Below B1)$/)).toBeVisible();
  }
  // One 1-based numbering: the checklist names the questions as the task does.
  await expect(page.getByTestId("question-3")).toContainText("Question 3: Should schools limit the use of smartphones?");
  await expectPlayableAudio(page, 2500);

  // The retry CTA comes before the secondary detail (questions, features, transcript).
  const ctaBox = await page.getByRole("button", { name: "Retry this task" }).boundingBox();
  const featuresBox = await page.getByText("Your language, feature by feature").boundingBox();
  expect(ctaBox!.y).toBeLessThan(featuresBox!.y);

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

test("security headers are sent and nothing the app needs is blocked by them", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy|refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => violations.push(String(error)));

  const response = await page.goto(TASK_URL);
  const headers = response!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");

  // The API carries them too, and a practice session is issued by the server.
  const session = await page.request.post("/api/sessions");
  expect(session.status()).toBe(201);
  expect(session.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await session.json()).sessionId).toMatch(/^[0-9a-f-]{36}$/);

  // The recorder, blob: audio preview and polling all work under the policy.
  await recordAndSubmit(page);
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
  expect(violations).toEqual([]);
});

test("the browser sends its session id with the recording and its analytics events", async ({ page }) => {
  const sessionRequests: string[] = [];
  const eventBodies: { events: { sessionId?: string | null }[] }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/sessions")) sessionRequests.push(request.method());
    if (request.url().endsWith("/api/analytics/events")) eventBodies.push(request.postDataJSON());
  });
  // Playwright cannot read multipart bodies that contain a Blob, so record the text fields as they are appended.
  await page.addInitScript(() => {
    const fields: Record<string, string> = {};
    (window as unknown as { __formFields: Record<string, string> }).__formFields = fields;
    const original = FormData.prototype.append;
    FormData.prototype.append = function (this: FormData, name: string, value: string | Blob, ...rest: [string?]) {
      if (typeof value === "string") fields[name] = value;
      return (original as (...args: unknown[]) => void).call(this, name, value, ...rest);
    } as typeof FormData.prototype.append;
  });

  await page.goto(TASK_URL);
  await recordAndSubmit(page);
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000); // let the analytics batch flush

  // React strict mode (dev only) mounts effects twice, so more than one request is possible; the first is discarded.
  expect(sessionRequests.length).toBeGreaterThanOrEqual(1);
  expect(new Set(sessionRequests)).toEqual(new Set(["POST"]));
  const uploadSessionId = await page.evaluate(() => (window as unknown as { __formFields: Record<string, string> }).__formFields.sessionId);
  expect(uploadSessionId).toMatch(/^[0-9a-f-]{36}$/);
  const sessionIds = new Set(eventBodies.flatMap((body) => body.events.map((event) => event.sessionId)));
  expect(sessionIds).toEqual(new Set([uploadSessionId])); // every client event carries the same server-issued session
});
