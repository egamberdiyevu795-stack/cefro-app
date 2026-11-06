import { expect, test, type Page } from "@playwright/test";

const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";

/** Brief → preparation → recording → Finish. A short test answer opens the early-finish warning: "Finish anyway". */
async function recordAndSubmit(page: Page, speakMs = 2500) {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(speakMs);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
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

/** The new result page's headline, e.g. "Part 2 · Band 2 · Higher B1" (built from the stored attempt). */
const resultHeading = (page: Page) => page.getByRole("heading", { name: /^Part 2 · Band [0-5] · (Above B2|Higher B2|Lower B2|Higher B1|Lower B1|Below B1)$/ });

test("full loop on real attempts: record, upload, evaluate (mock providers), new result page, retry with goal, comparison, history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await page.getByText("Start practice").click();
  await expect(page.getByRole("heading", { name: "Advice from someone" })).toBeVisible();

  // Attempt 1: record → upload → Scoring… → the new result page, from the stored attempt.
  await recordAndSubmit(page);
  await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("development-evaluator")).toContainText("Development evaluator");
  // The new page's cards, and nothing from the old report.
  for (const title of ["Questions", "Biggest fix", "Skills", "Your answer"]) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("The biggest thing to fix")).toHaveCount(0);
  await expect(page.getByText(/estimated level|\/10\b|Scores by criterion/)).toHaveCount(0);
  await expect(page.getByText(/^Question [123]$/)).toHaveCount(3);
  await expect(page.getByText("Pronunciation wasn’t checked in this attempt.")).toBeVisible();
  await expectPlayableAudio(page, 2500); // the stored recording, from the API
  await expect(page.getByRole("button", { name: "Retry with this goal" })).toHaveClass(/bg-primary/);

  // Attempt 2: the retry carries the goal through every screen, and its result says whether it was met.
  await page.getByRole("button", { name: "Retry with this goal" }).click();
  await expect(page.getByTestId("goal-card")).toContainText("Your goal:");
  await recordAndSubmit(page, 3000);
  await expect(page.getByTestId("goal-card")).toBeVisible(); // on Scoring…
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^Band [0-5] → [0-5]$/)).toBeVisible();
  await expect(page.getByText(/^·?(Goal met|Not yet)/).first()).toBeVisible();

  // Comparison: identical mock answers must not be shown as progress.
  await page.getByRole("button", { name: "Compare with your last attempt" }).click();
  await expect(page.getByRole("heading", { name: "Attempt 1 vs Attempt 2" })).toBeVisible();
  await expect(page.getByText(/About the same|Slightly/)).toBeVisible();
  await expect(page.getByText("clearly better")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Practise next" })).toBeVisible();
  await page.getByRole("button", { name: "Back to attempt 2 result" }).click();
  await expect(resultHeading(page)).toBeVisible();

  // Reload: attempts persist and can be reopened on the new result page.
  await page.goto(TASK_URL);
  await expect(page.getByRole("button", { name: /Attempt 2/ })).toBeVisible();
  await page.getByRole("button", { name: /Attempt 1/ }).click();
  await expect(resultHeading(page)).toBeVisible();

  expect(errors).toEqual([]);
});

test("when the minute of preparation ends, recording starts by itself, with the beep and 'Speak now'", async ({ page }) => {
  // Count the beeps (Web Audio oscillators started) without playing anything.
  await page.addInitScript(() => {
    const w = window as unknown as { __beeps: number };
    w.__beeps = 0;
    const original = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, ...args: [number?]) {
      w.__beeps++;
      return original.apply(this, args);
    };
  });
  await page.clock.install();
  await page.goto(`${TASK_URL}?mock=1`);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBe(0);

  await page.clock.fastForward(59_000);
  await expect(page.getByRole("heading", { name: "Preparation" })).toBeVisible(); // not yet
  await page.clock.fastForward(1_500);

  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await expect(page.getByTestId("speak-now")).toHaveText("Speak now");
  await expect(page.getByRole("status").filter({ hasText: "Recording started. Speak now." })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBe(1);
  await page.clock.fastForward(5_000);
  await expect(page.getByTestId("speak-now")).toHaveCount(0);
});

/**
 * The task picture has loaded (a real image, not a broken one), carries the caption, and sits beside the questions
 * ("beside") or above them ("above").
 */
async function expectPicture(page: Page, layout: "beside" | "above" | "below") {
  const figure = page.getByTestId("task-picture");
  await expect(figure).toBeVisible();
  await expect(figure.getByText("You don't need to describe the picture")).toBeVisible();
  const img = figure.getByRole("img", { name: /older man .* teenage girl/ });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const pictureBox = (await img.boundingBox())!;
  const questionsBox = (await page.getByTestId("task-picture-layout").getByRole("list").boundingBox())!;
  expect(pictureBox.width).toBeGreaterThan(150);
  if (layout === "beside") {
    expect(pictureBox.x + pictureBox.width).toBeLessThanOrEqual(questionsBox.x); // picture on the left
    expect(Math.abs(pictureBox.y - questionsBox.y)).toBeLessThan(pictureBox.height); // same row
  } else if (layout === "above") {
    expect(pictureBox.y + pictureBox.height).toBeLessThanOrEqual(questionsBox.y); // picture above
  } else {
    expect(questionsBox.y + questionsBox.height).toBeLessThanOrEqual(pictureBox.y); // questions first
  }
}

test("the task picture loads beside the questions on every screen (desktop): brief, preparation, recording, retry", async ({ page }) => {
  const imageResponses: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/tasks/advice-from-someone.svg")) imageResponses.push(r.status());
  });
  await page.goto(TASK_URL);
  await expectPicture(page, "beside");
  expect(imageResponses).toContain(200);

  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await expectPicture(page, "beside");

  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await expectPicture(page, "beside");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Retry with this goal" }).click();
  await expect(page.getByTestId("goal-card")).toBeVisible();
  await expectPicture(page, "beside");
});

test("on a phone the picture is above the questions on the brief, below them while preparing", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
  const page = await context.newPage();
  await page.goto(TASK_URL);
  await expectPicture(page, "above");
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await expectPicture(page, "below");
  await context.close();
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
  await expect(page.getByText("iPhone or iPad (Safari)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await context.close();
});

test("no microphone found, and the permission prompt state while the browser asks", async ({ browser }) => {
  const none = await browser.newContext();
  await none.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Not found", "NotFoundError"));
  });
  let page = await none.newPage();
  await page.goto(`${TASK_URL}?mock=1`);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("No microphone found")).toBeVisible();
  await none.close();

  const asking = await browser.newContext();
  await asking.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  page = await asking.newPage();
  await page.goto(`${TASK_URL}?mock=1`);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("Allow microphone access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start preparation" })).toHaveCount(0);
  await asking.close();
});

test("finishing very early asks first; Keep speaking goes on recording", async ({ page }) => {
  await page.goto(`${TASK_URL}?mock=1`);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText(/^Finish already\?/)).toBeVisible();
  await page.getByRole("button", { name: "Keep speaking" }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
});

test("mock mode: the whole loop without API calls, and a retry's goal on every screen to 'Goal met'", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  await page.goto(`${TASK_URL}?mock=1`);
  await recordAndSubmit(page, 1000);
  await expect(page).toHaveURL(/\/result\?state=scoring/);
  await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Band 2/ })).toBeVisible({ timeout: 15_000 });

  // "Retry with this goal" carries the goal through brief, preparation, recording and Scoring… to the result.
  await page.getByRole("link", { name: "Retry with this goal" }).click();
  const goal = page.getByTestId("goal-card");
  await expect(goal).toContainText("Your goal:");
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(goal).toBeVisible();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(goal).toBeVisible();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByTestId("goal-card")).toBeVisible();
  await expect(page.getByText("Goal met")).toBeVisible({ timeout: 15_000 });
  expect(apiCalls).toEqual([]);
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
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
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
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
});

test("an attempt the server can no longer find stops polling and offers a new recording", async ({ page }) => {
  // Every status poll answers 404, as the server does for a missing (or another visitor's) attempt.
  let polls = 0;
  await page.route(/\/api\/speaking\/attempts\/[0-9a-f-]+$/, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    polls++;
    return route.fulfill({ status: 404, json: { error: { code: "attempt_not_found", message: "This attempt could not be found." } } });
  });
  await page.goto(TASK_URL);
  await recordAndSubmit(page, 1500);
  await expect(page.getByText("We couldn't find this answer")).toBeVisible({ timeout: 30_000 });
  const pollsWhenShown = polls;
  await page.waitForTimeout(3000);
  expect(polls).toBe(pollsWhenShown); // polling has stopped
  await page.getByRole("button", { name: "Record a new answer" }).click();
  await expect(page.getByRole("button", { name: "Start preparation" })).toBeVisible();
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
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
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
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000); // let the analytics batch flush

  // React strict mode (dev only) mounts effects twice, so more than one request is possible; the first is discarded.
  expect(sessionRequests.length).toBeGreaterThanOrEqual(1);
  expect(new Set(sessionRequests)).toEqual(new Set(["POST"]));
  const uploadSessionId = await page.evaluate(() => (window as unknown as { __formFields: Record<string, string> }).__formFields.sessionId);
  expect(uploadSessionId).toMatch(/^[0-9a-f-]{36}$/);
  const sessionIds = new Set(eventBodies.flatMap((body) => body.events.map((event) => event.sessionId)));
  expect(sessionIds).toEqual(new Set([uploadSessionId])); // every client event carries the same server-issued session
});

test("a missed question: the new result page shows it as not answered, with the model answer as the biggest fix", async ({ page }) => {
  // Rewrite the (mock) result the way a real evaluation of an answer that skips question 3 would look.
  await page.route(/\/api\/speaking\/attempts\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const result = body.attempt?.evaluation?.result;
    if (result?.kind === "multilevel") {
      result.assessment.questions[2] = {
        id: 3,
        status: "missing",
        evidence: "",
        note: "You did not say whether young people should always follow advice.",
        model_answer: "As for young people, I think they should listen to older people, but decide for themselves.",
      };
      result.scoring.biggest_fix = { kind: "question_coverage", question_id: 3 };
    }
    return route.fulfill({ response, json: body });
  });
  await page.goto(TASK_URL);
  await recordAndSubmit(page, 1500);
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText("Question 3 · Not answered")).toBeVisible();
  await expect(page.getByText("You didn't answer")).toBeVisible();
  await expect(page.getByText("As for young people, I think they should listen to older people")).toBeVisible();
  await expect(page.getByText("You did not say whether young people should always follow advice.")).toBeVisible();
  await page.screenshot({ path: "test-results/missed-question-result.png", fullPage: true });
});
