import { expect, test, type Browser, type Page } from "@playwright/test";

const TASK = "b2-part2-technology-young-people";
const TASK_URL = `/practice/speaking/${TASK}`;
const PASSWORD = "correct horse battery staple";
const run = Date.now();
let counter = 0;
const uniqueEmail = (label: string) => `${label}-${run}-${++counter}@example.com`;

async function recordAndSubmit(page: Page, speakMs = 2500) {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await page.getByRole("button", { name: /start speaking/ }).click();
  await expect(page.getByRole("button", { name: "Finish answer" })).toBeVisible();
  await page.waitForTimeout(speakMs);
  await page.getByRole("button", { name: "Finish answer" }).click();
  await expect(page.locator("audio")).toBeVisible();
  await page.getByRole("button", { name: "Submit for feedback" }).click();
  await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible({ timeout: 60_000 });
}

const header = (page: Page) => page.getByTestId("account-status");

async function register(page: Page, email: string, next = "/") {
  await page.goto(`/register${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function newUserContext(browser: Browser) {
  const context = await browser.newContext({ permissions: ["microphone"] });
  return { context, page: await context.newPage() };
}

test("Journey A: an anonymous visitor practises and gets feedback without any account", async ({ page }) => {
  await page.goto("/");
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");
  await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.getByText("Start practice").click();
  await recordAndSubmit(page);
  await expect(page.getByText("Your focus for the next attempt")).toBeVisible();
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");
  expect((await (await page.request.get("/api/account/me")).json()).state).toBe("anonymous");
});

test.describe.serial("Journeys B and C: converting anonymous practice into an account, signing out, signing in", () => {
  const email = uniqueEmail("journey");

  test("B: practise anonymously, register, and the history is still there; practice continues on the account", async ({ page }) => {
    await page.goto(TASK_URL);
    await recordAndSubmit(page);
    const before = await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json();
    expect(before.attempts).toHaveLength(1);
    const firstAttemptId = before.attempts[0].id as string;

    await register(page, email, TASK_URL);
    await expect(page).toHaveURL(new RegExp(`${TASK_URL}$`));
    await expect(header(page)).toHaveAttribute("data-state", "authenticated");
    await expect(header(page)).toContainText(email);

    // The same attempt, now owned by the account.
    const after = await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json();
    expect(after.attempts.map((a: { id: string }) => a.id)).toEqual([firstAttemptId]);
    await page.getByRole("button", { name: /Attempt 1/ }).click();
    await expect(page.getByRole("heading", { name: "The biggest thing to fix" })).toBeVisible();

    // Continue practising as the account: the new attempt is number 2.
    await page.goto(TASK_URL);
    await recordAndSubmit(page, 3000);
    const now = await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json();
    expect(now.attempts.map((a: { attemptNumber: number }) => a.attemptNumber)).toEqual([2, 1]);
  });

  test("C: signing out removes the account state, and the account's history is no longer reachable from this browser", async ({ page }) => {
    // (Playwright gives this test a fresh browser context, so sign in first, then out.)
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(header(page)).toHaveAttribute("data-state", "authenticated");
    await page.goto(TASK_URL);
    await expect(page.getByRole("button", { name: /Attempt 2/ })).toBeVisible(); // the account's history, on a "new device"
    const attempts = (await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json()).attempts as { id: string }[];

    await header(page).getByRole("button", { name: "Sign out" }).click();
    await expect(header(page)).toHaveAttribute("data-state", "anonymous");
    expect((await (await page.request.get("/api/account/me")).json()).state).toBe("anonymous");
    await page.goto(TASK_URL);
    await expect(page.getByRole("button", { name: /Attempt \d/ })).toHaveCount(0); // the history was the account's
    for (const attempt of attempts) {
      expect((await page.request.get(`/api/speaking/attempts/${attempt.id}`)).status()).toBe(404);
      expect((await page.request.get(`/api/speaking/attempts/${attempt.id}/audio`)).status()).toBe(404);
    }
  });

  test("a wrong password is refused with a clear message, and the right one signs in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("The email or password is not right.");
    await expect(page).toHaveURL(/\/login$/);
    await expect(header(page)).toHaveAttribute("data-state", "anonymous");

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(header(page)).toHaveAttribute("data-state", "authenticated");
  });
});

test("registration rejects a too-short password and a duplicate email without signing anyone in", async ({ page }) => {
  const email = uniqueEmail("dupe");
  await register(page, email);
  await expect(header(page)).toHaveAttribute("data-state", "authenticated");
  await header(page).getByRole("button", { name: "Sign out" }).click();
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");

  await page.getByLabel("Email").fill(uniqueEmail("short"));
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");
});

test("the after-sign-in redirect never leaves the site", async ({ page }) => {
  await register(page, uniqueEmail("redirect"), "//evil.example/steal");
  await expect(header(page)).toHaveAttribute("data-state", "authenticated");
  expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL!).origin);
});

test("Journey D: one signed-in user cannot read, play or restart another user's attempt", async ({ browser }) => {
  const alice = await newUserContext(browser);
  const bob = await newUserContext(browser);
  try {
    await alice.page.goto(TASK_URL);
    await recordAndSubmit(alice.page);
    await register(alice.page, uniqueEmail("alice"), TASK_URL);
    await expect(header(alice.page)).toHaveAttribute("data-state", "authenticated");
    const aliceAttempt = (await (await alice.page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json()).attempts[0].id as string;
    expect((await alice.page.request.get(`/api/speaking/attempts/${aliceAttempt}`)).status()).toBe(200);
    expect((await alice.page.request.get(`/api/speaking/attempts/${aliceAttempt}/audio`)).status()).toBe(200);

    await register(bob.page, uniqueEmail("bob"));
    await expect(header(bob.page)).toHaveAttribute("data-state", "authenticated");
    for (const url of [`/api/speaking/attempts/${aliceAttempt}`, `/api/speaking/attempts/${aliceAttempt}/audio`]) {
      expect((await bob.page.request.get(url)).status(), url).toBe(404);
    }
    expect((await bob.page.request.post(`/api/speaking/attempts/${aliceAttempt}/process`)).status()).toBe(404);
    expect((await (await bob.page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json()).attempts).toEqual([]);

    // An anonymous visitor (no cookies at all) gets the same answer.
    const stranger = await newUserContext(browser);
    expect((await stranger.page.request.get(`/api/speaking/attempts/${aliceAttempt}`)).status()).toBe(404);
    await stranger.context.close();

    // Alice is unaffected.
    expect((await alice.page.request.get(`/api/speaking/attempts/${aliceAttempt}`)).status()).toBe(200);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
