import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATA_DIR, querySql } from "./db";

/*
 * Profile (/profile) and Settings (/settings): mock mode with the demo student (nothing sent, every link keeps
 * ?mock=1), the real pages for an account (name, exam date, level, Change password, Sign out, Delete my account with
 * the audio files checked on disk), the microphone test (Chromium's fake microphone; a blocked microphone), a slow
 * connection, and at 390 px: one black control, the current tab grey, no horizontal scroll, no text under 11 px,
 * text contrast AA.
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";
const BLACK = ":is(a, button).bg-primary.text-on-primary";
const DEMO = "Demo mode. Changes are not saved.";
const PASSWORD = "correct horse battery staple";
const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
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
async function auditPhone(page: Page, current: "Account" | "Settings") {
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
  test("Profile: the demo student; name and exam date change on the page only; nothing is sent; links keep ?mock=1", async ({ page }) => {
    const api = watchApi(page);
    await page.goto("/profile?mock=1");
    await expect(page.getByText(DEMO)).toBeVisible();
    await expect(page.getByTestId("profile-name")).toHaveText("Student");
    await expect(page.getByTestId("profile-email")).toHaveText("student@example.com");
    await expect(page.getByTestId("profile-member-since")).toHaveText(/^Member since \d\d\.\d\d\.\d\d$/);
    await expect(page.getByTestId("profile-attempts")).toHaveText("6 practice attempts");
    await expect(page.getByTestId("profile-level")).toHaveText(/^(Below B1|B1|B2|Above B2)$/);
    await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
    await expect(page.getByText(/Coming soon|Target level|Change email|Notifications/)).toHaveCount(0);
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

  test("Settings: Change password and Delete my account show their screens but change nothing; nothing is sent", async ({ page }) => {
    const api = watchApi(page);
    await page.goto("/settings?mock=1");
    await expect(page.getByText(DEMO)).toBeVisible();
    await expect(page.getByText(/Coming soon|Target level|Change email|Language|Notifications/)).toHaveCount(0);
    await expectMockLinks(page);
    await auditPhone(page, "Settings");

    await page.getByLabel("Current password").fill("anything at all");
    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByTestId("password-done")).toHaveText("Demo mode. Your password was not changed.");

    await page.getByRole("button", { name: "Delete my account" }).click();
    const list = page.getByTestId("delete-list").getByRole("listitem");
    await expect(list).toHaveText([
      "Your practice attempts and their results",
      "Your recordings and transcripts",
      "Your exam date",
      "Your account: name, email and password",
    ]);
    const confirm = page.getByRole("button", { name: "Delete everything" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(confirm).toBeEnabled();
    await auditPhone(page, "Settings"); // the confirmation screen too
    await confirm.click();
    await expect(page.getByTestId("delete-done")).toHaveText("Demo mode. Nothing was deleted.");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Demo mode. Sign-in is off, so there is nothing to sign out of.")).toBeVisible();
    expect(api).toEqual([]);
  });

  test("navigation: the gear opens Settings, the person tab's Profile opens Profile, both keep ?mock=1", async ({ page }) => {
    await page.goto("/dashboard?mock=1");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\?mock=1$/);
    await page.getByTestId("account-status").getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile\?mock=1$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });
});

test.describe("microphone test", () => {
  test("records up to 3 s and plays it back; nothing is uploaded", async ({ page }) => {
    const api = watchApi(page);
    const uploads: string[] = [];
    page.on("request", (r) => {
      if (r.method() !== "GET") uploads.push(r.url());
    });
    await page.goto("/settings?mock=1");
    await page.getByRole("button", { name: "Test microphone" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    // Stops by itself after 3 s.
    await expect(page.getByRole("button", { name: "Test again" })).toBeVisible({ timeout: 8_000 });
    const audio = page.getByTestId("mic-test").locator("audio");
    await expect(audio).toHaveCount(1);
    expect(await audio.getAttribute("src")).toMatch(/^blob:/);
    await auditPhone(page, "Settings");
    expect(api).toEqual([]);
    expect(uploads).toEqual([]);
  });

  test("a blocked microphone says so clearly", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await page.goto("/settings?mock=1");
    await page.getByRole("button", { name: "Test microphone" }).click();
    await expect(page.getByTestId("mic-error")).toHaveText(/Your microphone is blocked for CEFRO\. Allow the microphone for this site/);
  });
});

test.describe("real account", () => {
  test.skip(PREVIEW, "a Preview has no database: the real pages refuse (mock-mode.spec.ts)");

  test("Profile and Settings for a new account, then Change password, Sign out, and Delete my account (audio files gone)", async ({ page }) => {
    const email = uniqueEmail("profile");
    await register(page, email);

    // No answer yet: "No level yet" with a link to Part 2; no exam date: "Not set · Add exam date".
    await page.goto("/profile");
    await expect(page.getByTestId("profile-email")).toHaveText(email);
    await expect(page.getByTestId("profile-level")).toHaveText("No level yet");
    await expect(page.getByRole("link", { name: "Go to Part 2" })).toHaveAttribute("href", "/#part-2");
    await expect(page.getByText("Not set")).toBeVisible();
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
    await page.goto("/settings");
    await auditPhone(page, "Settings");
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

    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page.getByTestId("delete-done")).toHaveText("Your account and everything in it were deleted.");

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

  test("Sign out ends the session", async ({ page }) => {
    await register(page, uniqueEmail("signout"));
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/settings");
    await expect(page.getByText("Sign in to change your password")).toBeVisible();
  });

  test("slow connection: Change password and Delete my account wait until the page is ready", async ({ page }) => {
    await register(page, uniqueEmail("slow"));
    await page.goto("/settings"); // compiled once, so only the delay below is slow
    await page.route("**/_next/static/chunks/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    const navigations: string[] = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest()) navigations.push(r.url());
    });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Test microphone" })).toBeDisabled();
    // Enter in a password field before the scripts run sends nothing (the only submit button is disabled).
    await page.getByLabel("Current password").fill("typed early");
    await page.getByLabel("Current password").press("Enter");
    await expect(page.getByRole("button", { name: "Change password" })).toBeEnabled({ timeout: 30_000 });
    expect(navigations).toHaveLength(1);
    expect(page.url()).not.toContain("typed");
    await page.unroute("**/_next/static/chunks/**");
  });
});
