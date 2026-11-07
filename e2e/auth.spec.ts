import { expect, test, type Browser, type Page } from "@playwright/test";

const TASK = "b2-part2-advice-from-someone";
const TASK_URL = `/practice/speaking/${TASK}`;
const PASSWORD = "correct horse battery staple";
const run = Date.now();
let counter = 0;
const uniqueEmail = (label: string) => `${label}-${run}-${++counter}@example.com`;

async function recordAndSubmit(page: Page, speakMs = 2500) {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByText("to prepare")).toBeVisible();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(speakMs);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click(); // a test answer is far under a minute
  await expect(resultHeading(page)).toBeVisible({ timeout: 60_000 });
}

/** The new result page's headline, e.g. "Part 2 · Band 2 · Higher B1". */
const resultHeading = (page: Page) => page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / });

/** The design-system Account menu or tab (data-state: anonymous / authenticated). */
const header = (page: Page) => page.getByTestId("account-status");

/** Who this browser is, from the server (the sign-in and Create account pages have no Account menu). */
async function accountState(page: Page): Promise<string> {
  return (await (await page.request.get("/api/account/me")).json()).state;
}

async function openAccount(page: Page) {
  await header(page).getByRole("button", { name: "Account" }).click();
}

/** Sign out from the Account page (the Account tab opens it directly). */
async function logOut(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

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
  await page.goto("/practice");
  await expect(header(page)).toHaveAttribute("data-state", "anonymous");
  await openAccount(page);
  await expect(header(page).getByText("Practising without an account")).toBeVisible();
  await expect(header(page).getByRole("menuitem", { name: "Sign in" })).toBeVisible();
  await expect(header(page).getByRole("menuitem", { name: "Create account" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /Advice from someone/ }).click();
  await recordAndSubmit(page);
  await expect(page.getByRole("button", { name: "Retry with this goal" })).toBeVisible();
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
    // The Account tab opens the Account page: the real account's email and its name.
    await header(page).getByRole("link", { name: "Account" }).click();
    await expect(page.getByTestId("profile-email")).toHaveText(email);
    await expect(page.getByTestId("profile-name")).toHaveText(email.split("@")[0]);
    await page.goto(TASK_URL);

    // The same attempt, now owned by the account.
    const after = await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json();
    expect(after.attempts.map((a: { id: string }) => a.id)).toEqual([firstAttemptId]);
    await page.getByRole("link", { name: /Attempt 1/ }).click();
    await expect(resultHeading(page)).toBeVisible();

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
    await expect(page.getByRole("link", { name: /Attempt 2/ })).toBeVisible(); // the account's history, on a "new device"
    const attempts = (await (await page.request.get(`/api/speaking/tasks/${TASK}/attempts`)).json()).attempts as { id: string }[];

    await logOut(page); // lands on /login, which has no Account menu
    expect(await accountState(page)).toBe("anonymous");
    await page.goto(TASK_URL);
    await expect(page.getByRole("link", { name: /Attempt \d/ })).toHaveCount(0); // the history was the account's
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
    expect(await accountState(page)).toBe("anonymous");

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(header(page)).toHaveAttribute("data-state", "authenticated");
  });
});

test("registration rejects a too-short password and a duplicate email without signing anyone in", async ({ page }) => {
  const email = uniqueEmail("dupe");
  await register(page, email);
  await expect(header(page)).toHaveAttribute("data-state", "authenticated");
  await logOut(page);
  expect(await accountState(page)).toBe("anonymous");

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  expect(await accountState(page)).toBe("anonymous");

  await page.getByLabel("Email").fill(uniqueEmail("short"));
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  expect(await accountState(page)).toBe("anonymous");
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

/**
 * A very slow connection: the HTML arrives, the page's scripts are held back until the test calls `release()`, so
 * nothing races the checks made before then. Returns every page the browser loads, so a test can tell a plain form
 * submit (a reload) from the app's own request.
 */
async function holdScripts(page: Page) {
  let held = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    held += 1;
    await gate;
    await route.continue();
  });
  const navigations: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  });
  return { navigations, held: () => held, release };
}

for (const mode of ["login", "register"] as const) {
  const submit = mode === "login" ? "Sign in" : "Create account";
  test(`slow connection: ${submit} waits until the page is ready; the password never goes into the address`, async ({ page }) => {
    await page.goto(`/${mode}`); // compiled once, so only the delay below is slow
    const slow = await holdScripts(page);
    // The form is in the HTML; the page's deferred scripts (held) would block "domcontentloaded".
    await page.goto(`/${mode}`, { waitUntil: "commit" });

    // Before the scripts run: the fields can be filled, but the form can't be sent (no plain GET with the password).
    // And if it ever were, it is a POST: the email and password would travel in the body, not the address.
    await expect(page.locator("form")).toHaveAttribute("method", "post");
    const button = page.getByRole("button", { name: submit });
    await expect(button).toBeDisabled();
    expect(slow.held()).toBeGreaterThan(0);
    const email = uniqueEmail(`slow-${mode}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Password").press("Enter"); // implicit submission: nothing, while the only submit button is disabled
    await button.click({ force: true }); // a tap does nothing either
    expect(slow.navigations.every((url) => !url.includes("password"))).toBe(true);
    await page.waitForTimeout(500); // a form sent the browser's way would have started loading by now
    expect(slow.navigations).toHaveLength(1);
    await expect(button).toBeDisabled();

    // Once ready, the same form is sent by the app: the values typed early are used.
    slow.release();
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await page.unroute("**/_next/static/chunks/**");
    await button.click();
    if (mode === "login") {
      await expect(page.getByText("The email or password is not right.")).toBeVisible(); // no such account: the app's own answer
    } else {
      await expect(page).toHaveURL(/\/dashboard$/); // the home page sends a signed-in visitor to the dashboard
      await expect(header(page)).toHaveAttribute("data-state", "authenticated");
    }
    expect(slow.navigations.every((url) => !url.includes("password"))).toBe(true);
  });
}
