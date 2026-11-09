import { expect, test, type Page } from "@playwright/test";
import { shortPartIntros } from "./short-intro";

// The Part 2 / Part 3 spoken introductions are shortened (e2e/short-intro.ts).
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

/*
 * Mock mode (`?mock=1`): the whole app clickable with demo data, no database, no API call, and every link keeps
 * ?mock=1. Runs with the usual browser tests (next dev) and, with `npm run test:e2e:preview`, against a production build
 * started like a Vercel Preview with no environment variables (playwright.preview.config.ts), where the real pages
 * must keep refusing.
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";
const DEMO_MODE = "Demo mode. Your answer won't be scored.";
const DEMO_RESULT = "Demo result. Your answer was not scored.";
const DEMO_DATA = "Demo mode. These are example attempts, not yours.";
const BLACK = ":is(a, button).bg-primary.text-on-primary";

/** Watches the page: no API call, and every page it loads is a mock-mode address. */
function watch(page: Page) {
  const apiCalls: string[] = [];
  const realPages: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiCalls.push(url.pathname);
    // Documents and the App Router's page fetches (RSC) both say which page is being opened. Link prefetches are left
    // out: Next.js fetches a page's shared shell for them without the query, and never renders the page with them.
    const headers = request.headers();
    const prefetch = "next-router-prefetch" in headers || "next-router-segment-prefetch" in headers;
    const isPage = request.isNavigationRequest() || (headers["rsc"] === "1" && !prefetch);
    if (isPage && url.searchParams.get("mock") !== "1") realPages.push(`${url.pathname}${url.search}`);
  });
  return { apiCalls, realPages };
}

/** Every internal link on the page keeps ?mock=1. */
async function expectMockLinks(page: Page) {
  const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
}

/** At 390 px: no horizontal scroll and no visible text under 11 px. Back to desktop after. */
async function auditPhone(page: Page) {
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const smallest = await page.evaluate(() => {
    let min = Infinity;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
    }
    return min;
  });
  expect(smallest).toBeGreaterThanOrEqual(11);
  if (desktop) await page.setViewportSize(desktop);
}

async function record(page: Page) {
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
}

test("mock mode: task list → brief → practice → result → retry → dashboard → History, all demo, all ?mock=1, no API call", async ({ page }) => {
  const seen = watch(page);
  const demo = page.getByTestId("demo-label");

  // Task list.
  await page.goto("/practice?mock=1");
  await expect(demo).toHaveText(DEMO_MODE);
  await expectMockLinks(page);
  await auditPhone(page);

  // Brief of another task than the demo result's, then the practice and the mock result.
  await page.getByRole("link", { name: /A happy day/ }).click();
  await expect(page).toHaveURL(/\/practice\/speaking\/b2-part2-happy-day\?mock=1$/);
  await expect(demo).toHaveText(DEMO_MODE);
  await expect(page.getByRole("main").locator(BLACK)).toHaveCount(1);
  await expectMockLinks(page);
  await record(page);
  await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
  await expect(demo).toHaveText(DEMO_RESULT);
  await expect(page.getByRole("heading", { name: /^Part 2 · Band / })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/result\?demo=answer\.b2-part2-happy-day&mock=1$/);
  await expect(page.getByText("A happy day").first()).toBeVisible(); // the task practised, not the saved runs' task
  await expect(page.getByText(/Advice from someone/)).toHaveCount(0);
  await expect(demo).toHaveText(DEMO_RESULT);
  await expectMockLinks(page);

  // Retry with the goal, to "Goal met".
  await page.getByRole("link", { name: "Retry with this goal" }).click();
  await expect(page.getByTestId("goal-card")).toContainText("Your goal:");
  await expect(demo).toHaveText(DEMO_MODE);
  await expectMockLinks(page);
  await record(page);
  await expect(page.getByText("Goal met")).toBeVisible({ timeout: 15_000 });
  await expect(demo).toHaveText(DEMO_RESULT);

  // Dashboard: the demo student.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/dashboard\?mock=1$/);
  await expect(demo).toHaveText(DEMO_DATA);
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
  await expect(page.getByRole("heading", { name: "Recent attempts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Biggest fix" })).toBeVisible();
  await expect(page.getByRole("main").locator(BLACK)).toHaveCount(1);
  await expectMockLinks(page);
  await auditPhone(page);

  // The exam date can be changed on the page; nothing is sent.
  await page.getByRole("button", { name: "Edit exam date" }).click();
  const in40 = await page.evaluate(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 40);
    return d.toISOString().slice(0, 10);
  });
  await page.getByLabel("Change your exam date").fill(in40);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 40 days");

  // History, its filter, and a row's demo result.
  await page.getByRole("link", { name: "See all attempts" }).click();
  await expect(page).toHaveURL(/\/history\?mock=1$/);
  await expect(demo).toHaveText(DEMO_DATA);
  await expect(page.getByRole("heading", { name: "Band over time" })).toBeVisible();
  await expectMockLinks(page);
  await auditPhone(page);
  await page.getByRole("navigation", { name: "Filter by part" }).getByRole("link", { name: "Part 2" }).click();
  await expect(page).toHaveURL(/\/history\?part=2&mock=1$/);
  // A demo attempt opens its own result: the retry of "A tradition" (goal met), and "Advice from someone".
  await page.getByRole("link", { name: /A tradition/ }).first().click();
  await expect(page).toHaveURL(/\/result\?demo=demo-6&mock=1$/);
  await expect(demo).toHaveText(DEMO_RESULT);
  await expect(page.getByText("A tradition").first()).toBeVisible();
  await expect(page.getByText("Goal met")).toBeVisible();
  await expect(page.getByText(/Advice from someone/)).toHaveCount(0);
  await expectMockLinks(page);
  await page.goBack();
  await page.getByRole("link", { name: /Advice from someone/ }).click();
  await expect(page).toHaveURL(/\/result\?demo=demo-1&mock=1$/);
  await expect(page.getByText("Who gave you the advice, and what situation were you in?").first()).toBeVisible();
  await expect(page.getByText(/A tradition/)).toHaveCount(0);

  // The navigation stays in mock mode too.
  await page.getByRole("link", { name: "Practice" }).first().click();
  await expect(page).toHaveURL(/\/practice\?mock=1$/);
  await page.goto("/history?mock=1");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/dashboard\?mock=1$/);

  expect(seen.apiCalls).toEqual([]);
  expect(seen.realPages).toEqual([]);
});

test("mock mode lessons: Biggest fix → Learn how → lesson (why, explanation, examples, drill) → Retry with this goal, all ?mock=1", async ({ page }) => {
  const seen = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // The demo result of "A tradition" (question 3 missing) links its Biggest fix to "Answer every question".
  await page.goto("/result?demo=demo-5&mock=1");
  await expect(page.getByText("Your result · A tradition")).toBeVisible();
  await page.getByRole("link", { name: "Learn how: Answer every question" }).click();
  await expect(page).toHaveURL(/\/lessons\/l-t1\?demo=demo-5&mock=1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Answer every question" })).toBeVisible();
  await expect(page.getByTestId("lesson-why")).toContainText('You did not answer Question 3: "Should young people keep old traditions in the modern world? Why?".');
  for (const name of ["How it works", "Examples", "Self-check drill", "Retry the same task"]) await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByTestId("lesson-example")).toHaveCount(4);
  await expect(page.getByTestId("lesson-goal")).toContainText('Answer question 3: "Should young people keep old traditions in the modern world? Why?"');
  await expect(page.getByRole("main").locator(BLACK)).toHaveCount(1);
  await expect(page.getByTestId("demo-label")).toHaveText(DEMO_MODE);
  await expectMockLinks(page);
  await auditPhone(page);

  // Only one black control on screen (the retry); Lessons is the current tab, in grey.
  await expect(page.locator(BLACK)).toHaveCount(1);
  const lessonsTab = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Lessons" });
  await expect(lessonsTab).toHaveAttribute("aria-current", "page");
  await expect(lessonsTab).toHaveAttribute("href", "/lessons?mock=1");

  // The self-check drill: record each prompt (fake microphone), listen back, answer the self-check. Nothing is sent.
  const prompts = page.getByTestId("drill-prompt");
  await expect(prompts).toHaveCount(3);
  await expect(prompts.nth(0)).toContainText("Q1");
  await expect(prompts.nth(2)).toContainText("Q1–Q3");
  await expect(page.getByTestId("ready-for-retry")).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    const prompt = prompts.nth(i);
    await prompt.getByRole("button", { name: "Record", exact: true }).click();
    await expect(prompt.getByRole("timer")).toBeVisible();
    await page.waitForTimeout(1200);
    await prompt.getByRole("button", { name: "Stop" }).click();
    await expect(prompt.getByTestId("self-check")).toContainText("Listen back. Did you:");
    if (i === 0) {
      await expect(prompt.getByTestId("self-check")).toContainText("Did you: answer, then add one detail (when, who with or why)?");
      // Not yet: "Try once more", and Record again stays.
      await prompt.getByRole("button", { name: "Not yet" }).click();
      await expect(prompt.getByText("Try once more")).toBeVisible();
      await expect(prompt.getByRole("button", { name: "Record again" })).toBeVisible();
    }
    await prompt.getByRole("button", { name: "Yes" }).click();
    await expect(prompt.getByTestId("prompt-done")).toBeVisible();
    await expect(prompt.getByTestId("self-check")).toHaveCount(0);
    if (i < 2) await expect(page.getByTestId("ready-for-retry")).toHaveCount(0);
  }
  await expect(page.getByTestId("ready-for-retry")).toHaveText("Ready for your retry");
  await expect(page.locator(BLACK)).toHaveCount(1);
  await auditPhone(page);
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  // Retry with this goal: the retry of the same attempt, with its goal on the brief.
  await page.getByRole("link", { name: "Retry with this goal" }).click();
  await expect(page).toHaveURL(/\/practice\/speaking\/b2-part2-a-tradition\?mock=1&retry=demo-5$/);
  await expect(page.getByTestId("goal-card")).toContainText('Answer question 3: "Should young people keep old traditions in the modern world? Why?"');

  // The other two lessons, from their demo results; a result with no approved lesson has no link.
  for (const [demo, name, title] of [
    ["picture.b2-part2-advice-from-someone", "Learn how: The picture is not the question", "The picture is not the question"],
    ["bare.b2-part2-advice-from-someone", "Learn how: Answer, reason, example", "Answer, reason, example"],
  ]) {
    await page.goto(`/result?demo=${demo}&mock=1`);
    await page.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("main").locator(BLACK)).toHaveCount(1);
    await expectMockLinks(page);
    await auditPhone(page);
  }
  await page.goto("/result?demo=demo-6&mock=1");
  await expect(page.getByRole("heading", { name: "Biggest fix" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Learn how/ })).toHaveCount(0);

  expect(seen.apiCalls).toEqual([]);
  expect(seen.realPages).toEqual([]);
});

test("mock mode at 390 px: every main page has at most one black control, navigation included", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [
    "/dashboard?mock=1",
    "/practice/speaking/b2-part2-a-tradition?mock=1",
    "/result?demo=demo-5&mock=1",
    "/history?mock=1",
    "/lessons/l-t1?demo=demo-5&mock=1",
    "/profile?mock=1",
  ]) {
    await page.goto(url);
    await expect(page.locator("main").first()).toBeVisible();
    const black = await page.locator(BLACK).evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed").length);
    expect(black, url).toBeLessThanOrEqual(1);
    // The current tab is the grey square, never black.
    const current = page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]');
    await expect(current, url).toHaveCount(1);
    await expect(current, url).not.toHaveClass(/bg-primary/);
  }
});

test("mock mode: the Account tab opens the demo Account page directly (no menu, no API, no real page)", async ({ page }) => {
  const seen = watch(page);
  await page.goto("/dashboard?mock=1");
  const tab = page.getByTestId("account-status").getByRole("link", { name: "Account" });
  await expect(tab).toHaveAttribute("href", "/profile?mock=1");
  await tab.click();
  await expect(page).toHaveURL(/\/profile\?mock=1$/);
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  expect(seen.apiCalls).toEqual([]);
  expect(seen.realPages).toEqual([]);
});

test("real pages show no demo label", async ({ page }) => {
  test.skip(PREVIEW, "on a Preview the real pages are refused (next test)");
  for (const url of ["/", "/practice", "/login", "/register", "/dashboard", "/history", "/practice/speaking/b2-part2-advice-from-someone"]) {
    await page.goto(url);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByTestId("demo-label"), url).toHaveCount(0);
  }
});

test("Preview with no variables: the real pages and the API keep refusing", async ({ page, request }) => {
  test.skip(!PREVIEW, "only on the production build set up like a Preview (npm run test:e2e:preview)");
  for (const url of ["/", "/?mock=0", "/practice", "/login", "/register", "/dashboard", "/history", "/profile", "/settings", "/practice/speaking/b2-part2-advice-from-someone", "/result/00000000-0000-4000-8000-000000000000"]) {
    expect((await request.get(url)).status(), url).toBe(500);
  }
  for (const url of ["/api/health", "/api/account/me"]) expect((await request.get(url)).status(), url).toBe(503);
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "CEFRO isn’t available right now" })).toBeVisible();
  await expect(page.getByTestId("demo-label")).toHaveCount(0);
  // The mock pages answer 200.
  for (const url of ["/?mock=1", "/practice?mock=1", "/login?mock=1", "/register?mock=1", "/dashboard?mock=1", "/history?mock=1", "/profile?mock=1", "/settings?mock=1", "/history?part=2&mock=1", "/practice/speaking/b2-part2-a-tradition?mock=1", "/result?mock=1", "/result?state=retry&mock=1", "/result?demo=demo-1&mock=1", "/result?demo=demo-6&mock=1", "/result?demo=answer.b2-part2-happy-day&mock=1"]) {
    expect((await request.get(url)).status(), url).toBe(200);
  }
});
