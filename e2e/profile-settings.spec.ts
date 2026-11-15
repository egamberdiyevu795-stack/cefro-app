import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATA_DIR, querySql } from "./db";
import { shortPartIntros } from "./short-intro";

// The Part 2 / Part 3 spoken introductions are shortened (e2e/short-intro.ts).
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

/*
 * The Account page (/profile; /settings redirects to it): mock mode with the demo student (nothing sent, every link
 * keeps ?mock=1), the real page for an account (name, level, exam date, Change password, Sign out, Delete my account
 * with the audio files checked on disk), the practice brief's "Check microphone" (Chromium's fake microphone; a blocked
 * microphone), a slow connection, and at 390 px: exactly one black control, the grey current tab, no horizontal
 * scroll, no text under 11 px, text contrast AA.
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";
const BLACK = ":is(a, button).bg-primary.text-on-primary";
const DEMO = "Demo mode. Changes are not saved.";
const PASSWORD = "correct horse battery staple";
const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
const MOCK_TASK_URL = "/practice/speaking/b2-part2-a-tradition?mock=1";
const run = Date.now();
let counter = 0;
const uniqueEmail = (label: string) => `${label}-${run}-${++counter}@example.com`;

function watchApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(`${request.method()} ${url.pathname}`);
  });
  return calls;
}

/** At 390 px: one black control, the grey current tab, no horizontal scroll, no text under 11 px, text contrast AA. */
async function auditPhone(page: Page, current: "Account" | "Practice") {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("main").first()).toBeVisible();
  const black = await page.locator(BLACK).evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length);
  expect(black).toBe(1);
  const tab = page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]');
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute("aria-label", current);
  await expect(tab).toHaveClass(/bg-well/);
  await expect(tab).not.toHaveClass(/bg-primary/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const report = await page.evaluate(() => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) =>
      [r, g, b].map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const background = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0) return c;
      }
      return [255, 255, 255];
    };
    let smallest = Infinity;
    const failures: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, [disabled], .sr-only")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      smallest = Math.min(smallest, size);
      const [a, b] = [lum(parse(style.color)), lum(background(el))];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) failures.push(`${node.textContent.trim().slice(0, 40)}: ${ratio.toFixed(2)}`);
    }
    return { smallest, failures };
  });
  expect(report.smallest).toBeGreaterThanOrEqual(11);
  expect(report.failures).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function expectMockLinks(page: Page) {
  const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
}

async function register(page: Page, email: string) {
  // Its own client address, so the other spec files' sign-ups never put this one over the per-IP sign-up limit (10/hour).
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.77.${counter % 250}.${(run % 250) + 1}` });
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "authenticated");
}

async function practise(page: Page) {
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / })).toBeVisible({ timeout: 60_000 });
}

test.describe("mock mode (?mock=1)", () => {
  test("the Account page: the demo student in order; name and exam date change on the page only; nothing is sent", async ({ page }) => {
    const api = watchApi(page);
    await page.goto("/profile?mock=1");
    await expect(page.getByText(DEMO)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await expect(page.getByTestId("profile-name")).toHaveText("Student");
    await expect(page.getByTestId("profile-email")).toHaveText("student@example.com");
    await expect(page.getByTestId("profile-level")).toHaveText(/^(Below B1|B1|B2|Above B2)$/);
    await expect(page.getByTestId("profile-member-since")).toHaveText(/^Member since \d\d\.\d\d\.\d\d$/);
    await expect(page.getByTestId("profile-attempts")).toHaveText("6 practice attempts");
    await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
    // Section order: account, exam date, password and sign-out, delete last.
    const tops = await Promise.all(
      [page.getByTestId("profile-name"), page.getByTestId("exam-countdown"), page.getByRole("heading", { name: "Change password" }), page.getByRole("heading", { name: "Sign out" }), page.getByRole("heading", { name: "Delete my account" })].map(
        async (l) => (await l.boundingBox())!.y,
      ),
    );
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    await expect(page.getByText(/Coming soon|Target level|Change email|Notifications|Test your microphone/)).toHaveCount(0);
    await expectMockLinks(page);
    await auditPhone(page, "Account");

    // The email is shown, never editable.
    await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit name" }).click();
    await page.getByLabel("Name").fill("Aziza");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("profile-name")).toHaveText("Aziza");

    // Exam date: Edit → Remove date → "Not set · Add exam date".
    await page.getByRole("button", { name: "Edit exam date" }).click();
    await page.getByRole("button", { name: "Remove date" }).click();
    await expect(page.getByText("Not set")).toBeVisible();
    await expect(page.getByTestId("exam-add")).toBeVisible();

    expect(api).toEqual([]);
    await page.reload();
    await expect(page.getByTestId("profile-name")).toHaveText("Student"); // nothing was saved
    await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
  });

  test("Change password, Sign out and Delete my account show their screens but change nothing; nothing is sent", async ({ page }) => {
    const api = watchApi(page);
    await page.goto("/profile?mock=1");
    await page.getByLabel("Current password").fill("anything at all");
    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByTestId("password-done")).toHaveText("Demo mode. Your password was not changed.");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Demo mode. Sign-in is off, so there is nothing to sign out of.")).toBeVisible();

    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByTestId("delete-list").getByRole("listitem")).toHaveText([
      "Your practice attempts and their results",
      "Your recordings and transcripts",
      "Your exam date",
      "Your account: name, email and password",
    ]);
    const confirm = page.getByRole("button", { name: "Delete everything" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(confirm).toBeDisabled(); // the password is needed too
    await page.getByLabel("Your password").fill("anything");
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(confirm).toBeEnabled();
    await auditPhone(page, "Account"); // the confirmation screen too
    await confirm.click();
    await expect(page.getByTestId("delete-done")).toHaveText("Demo mode. Nothing was deleted.");
    expect(api).toEqual([]);
  });

  test("navigation: five tabs; the Account tab opens the page directly; /settings redirects, keeping ?mock=1", async ({ page }) => {
    await page.goto("/dashboard?mock=1");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.locator("a, button, [role=img]")).toHaveCount(5);
    // Every tab is a real link (Lessons too, since the launch cleanup).
    await expect(nav.locator("button")).toHaveCount(0);
    for (const name of ["Home", "Practice", "Lessons", "History", "Account"]) await expect(nav.getByRole("link", { name })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await nav.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/profile\?mock=1$/);
    await page.goto("/settings?mock=1");
    await expect(page).toHaveURL(/\/profile\?mock=1$/);
  });
});

test.describe("Check microphone on the practice brief", () => {
  test("grey, before Start preparation (the only black button); records up to 3 s and plays it back; nothing is uploaded", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET" || new URL(r.url()).pathname.startsWith("/api/")) sent.push(`${r.method()} ${r.url()}`);
    });
    await page.goto(MOCK_TASK_URL);
    const check = page.getByRole("button", { name: "Check microphone" });
    const start = page.getByRole("button", { name: "Start preparation" });
    await expect(check).toBeEnabled();
    await expect(check).not.toHaveClass(/bg-primary/);
    expect((await check.boundingBox())!.y).toBeLessThan((await start.boundingBox())!.y);
    await auditPhone(page, "Practice");

    await check.click();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible({ timeout: 8_000 }); // stopped by itself
    const audio = page.getByTestId("mic-check").locator("audio");
    await expect(audio).toHaveCount(1);
    expect(await audio.getAttribute("src")).toMatch(/^blob:/);
    await auditPhone(page, "Practice"); // still one black button with the player shown
    expect(sent).toEqual([]);

    // The practice itself still starts normally afterwards.
    await start.click();
    await expect(page.getByText("to prepare")).toBeVisible();
  });

  test("a blocked microphone says so clearly", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await page.goto(MOCK_TASK_URL);
    await page.getByRole("button", { name: "Check microphone" }).click();
    await expect(page.getByTestId("mic-error")).toHaveText(/Your microphone is blocked for CEFRO\. Allow the microphone for this site/);
  });
});

test.describe("real account", () => {
  test.skip(PREVIEW, "a Preview has no database: the real pages refuse (mock-mode.spec.ts)");

  test("the Account page for a new account, then Change password, and Delete my account (password + DELETE; audio files gone)", async ({ page }) => {
    const email = uniqueEmail("account");
    await register(page, email);

    // No answer yet: "No level yet" with a link to Part 2; no exam date: "Not set · Add exam date".
    await page.goto("/dashboard");
    await page.getByTestId("account-status").getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId("profile-email")).toHaveText(email);
    await expect(page.getByTestId("profile-level")).toHaveText("No level yet");
    await expect(page.getByRole("link", { name: "Go to Part 2" })).toHaveAttribute("href", "/practice#part-2");
    await expect(page.getByRole("region", { name: "Your exam date" }).getByText("Not set")).toBeVisible();
    await expect(page.getByTestId("profile-name")).toHaveText("Not set"); // no name typed at sign-up: none
    await expect(page.getByTestId("profile-attempts")).toHaveText("No practice attempts yet");
    await expect(page.getByTestId("demo-label")).toHaveCount(0);
    await auditPhone(page, "Account");

    // Name: saved, and still there after a reload.
    await page.getByRole("button", { name: "Edit name" }).click();
    await page.getByLabel("Name").fill("Aziza Karimova");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Name saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("profile-name")).toHaveText("Aziza Karimova");

    // One scored Part 2 answer: the level appears.
    await practise(page);
    await page.goto("/profile");
    await expect(page.getByTestId("profile-level")).toHaveText(/^(Below B1|B1|B2|Above B2)$/);
    await expect(page.getByTestId("profile-attempts")).toHaveText("1 practice attempt");
    await auditPhone(page, "Account");

    // Change password: the current one is needed.
    await page.getByLabel("Current password").fill("not my password");
    await page.getByLabel("New password").fill("another good password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Your current password is not right.");
    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByLabel("New password").fill("another good password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByTestId("password-done")).toHaveText("Your password was changed. Other devices were signed out.");

    // The audio file of the answer is on disk before the deletion.
    const rows = await querySql(
      "SELECT r.storage_key AS key, r.storage_provider AS provider FROM recordings r JOIN speaking_attempts a ON a.id = r.attempt_id JOIN users u ON u.id = a.user_id WHERE u.email = ?",
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("local");
    const file = path.join(E2E_DATA_DIR, `${process.env.E2E_RUN_ID}-audio`, String(rows[0].key));
    expect(fs.existsSync(file)).toBe(true);

    // A wrong password deletes nothing; the right one deletes everything.
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByLabel("Your password").fill("another wrong one");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Your password is not right.");
    expect(fs.existsSync(file)).toBe(true);
    await page.getByLabel("Your password").fill("another good password");
    await page.getByRole("button", { name: "Delete everything" }).click();
    // Signed out, on the home page (which has no Account menu), with the message.
    await expect(page).toHaveURL(/\/\?deleted=1$/);
    await expect(page.getByTestId("account-deleted")).toHaveText("Your account and all your data were deleted.");
    expect((await (await page.request.get("/api/account/me")).json()).state).toBe("anonymous");

    expect(fs.existsSync(file)).toBe(false);
    expect(await querySql("SELECT id FROM users WHERE email = ?", [email])).toEqual([]);
    await page.goto("/profile");
    await expect(page.getByText("Practising without an account")).toBeVisible();
    // The account is gone: neither password signs in.
    for (const password of [PASSWORD, "another good password"]) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("main").getByText("The email or password is not right.")).toBeVisible();
    }
  });

  test("Sign out ends the session; /settings opens the Account page", async ({ page }) => {
    await register(page, uniqueEmail("signout"));
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/profile");
    await expect(page.getByText("Practising without an account")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("slow connection: Change password, Delete my account and Check microphone wait until the page is ready", async ({ page }) => {
    await register(page, uniqueEmail("slow"));
    await page.goto("/profile"); // compiled once, so only the delay below is slow
    await page.goto(TASK_URL);
    await page.route("**/_next/static/chunks/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    const navigations: string[] = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest()) navigations.push(r.url());
    });
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();
    // Enter in a password field before the scripts run sends nothing (the only submit button is disabled).
    await page.getByLabel("Current password").fill("typed early");
    await page.getByLabel("Current password").press("Enter");
    await expect(page.getByRole("button", { name: "Change password" })).toBeEnabled({ timeout: 30_000 });
    expect(navigations).toHaveLength(1);
    expect(page.url()).not.toContain("typed");

    await page.goto(TASK_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Check microphone" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Check microphone" })).toBeEnabled({ timeout: 30_000 });
    await page.unroute("**/_next/static/chunks/**");
  });
});
