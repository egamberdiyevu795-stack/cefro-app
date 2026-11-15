import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/*
 * "Forgot password?" end to end, on a phone-sized screen: Sign in → Forgot password? → Send link → the link from the
 * email (the dev server writes emails to this run's outbox file instead of sending them, see playwright.config.ts) →
 * Choose a new password → Sign in with it. Plus the link working only once, and mock mode sending nothing.
 */

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new password 42";
const run = Date.now();
let counter = 0;
const uniqueEmail = (label: string) => `${label}-${run}-${++counter}@example.com`;

test.use({ viewport: { width: 390, height: 844 } });

function outboxFile(): string {
  const runId = process.env.E2E_RUN_ID;
  if (!runId || !/^\d{13}$/.test(runId)) throw new Error("E2E_RUN_ID is not set; run through playwright.config.ts");
  return path.join("data", "e2e", `${runId}-outbox.jsonl`);
}

/** The reset link of the newest email sent to `to`, as a path on the test server. */
async function resetLinkFor(to: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(() => {
      const file = outboxFile();
      if (!fs.existsSync(file)) return undefined;
      const emails = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { to: string; text: string });
      const mine = emails.filter((email) => email.to === to).at(-1);
      link = mine && /https?:\/\/[^\s]+\/reset-password\?token=[^\s]+/.exec(mine.text)?.[0];
      return link;
    })
    .toBeTruthy();
  const url = new URL(link!);
  return `${url.pathname}${url.search}`;
}

async function createAccount(page: Page, email: string) {
  const response = await page.request.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name: "" } });
  expect(response.ok()).toBe(true);
  await page.context().clearCookies(); // signed out again
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a student who forgot their password gets a link by email, chooses a new one and signs in with it", async ({ page }) => {
  const email = uniqueEmail("forgot");
  await createAccount(page, email);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("If an account uses this email, we have sent it a link.")).toBeVisible();
  await page.screenshot({ path: "test-results/forgot-password-sent.png" });

  const link = await resetLinkFor(email);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Use at least 8 characters.");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password is changed. Sign in with your new password.")).toBeVisible();
  await page.screenshot({ path: "test-results/forgot-password-done.png" });
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, email, PASSWORD);
  await expect(page.locator("main").getByRole("alert")).toHaveText("The email or password is not right.");
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
  expect((await (await page.request.get("/api/account/me")).json()).state).toBe("authenticated");

  // The same link a second time: it says so, and offers a new one.
  await page.context().clearCookies();
  await page.goto(link);
  await page.getByLabel("New password").fill("yet another password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("This link has expired or was already used. Ask for a new one.");
  await page.getByRole("link", { name: "Send a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("an unknown address gets the same answer, and a link with no token says it cannot be used", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("If an account uses this email, we have sent it a link.")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.locator("main").getByRole("alert")).toHaveText("This link has expired or was already used. Ask for a new one.");
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("mock mode: the whole flow is clickable and nothing is sent", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/account/")) requests.push(request.url());
  });
  await page.goto("/login?mock=1");
  await page.screenshot({ path: "test-results/forgot-password-login.png" });
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?mock=1$/);
  await page.screenshot({ path: "test-results/forgot-password-form.png" });
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByText("Demo mode: nothing was sent and no account was used.")).toBeVisible();

  await page.goto("/reset-password?mock=1");
  await page.screenshot({ path: "test-results/forgot-password-new.png" });
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password is changed.")).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\?mock=1$/);
  expect(requests).toEqual([]);
});
