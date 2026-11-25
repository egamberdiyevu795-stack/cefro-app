import { expect, test, type Page } from "@playwright/test";
import { openTopics } from "./practice-page";
import { shortPartIntros } from "./short-intro";

/*
 * The REAL Part 3 flow at 390 px (run by `npm run test:e2e:part3`, playwright.part3.config.ts: Part 3 is not live, so
 * the server sets the test-only switch CEFRO_TEST_PART3_LIVE). Mock providers only; no model is called.
 *
 * "scored" server (mock transcriber and Part 3 mock evaluator): task list → brief → introduction → preparation (the Pros / Cons
 * table, nothing to tick) → recording → upload → Scoring… → the real result at /result/<attempt id> (points, recording player,
 * 30-day note) → History and the dashboard → Retry with this goal.
 * "no key" server (AI scoring cannot run): the recording and transcript are kept, and the page says "AI score not ready
 * yet", not an error: for Part 3 and for Part 2.
 * Every screen: at most one black button, no text under 11 px, every text at WCAG AA contrast, no horizontal scroll.
 */

const BLACK = ":is(a, button).bg-primary.text-on-primary";
const CARS_TITLE = "Cars in city centres";

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

async function audit(page: Page, blacks: number) {
  // A hovered button's colour is a color-mix() the contrast check can't read: keep the pointer off the controls.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300); // a button the pointer just left is still fading from its hover colour
  await expect(page.locator(BLACK)).toHaveCount(blacks);
  const report = await page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el: Element | null): number[] => {
      for (; el; el = el.parentElement) {
        const c = rgb(getComputedStyle(el).backgroundColor);
        if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    let smallest = Infinity;
    const low: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, nextjs-portal, .sr-only")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      smallest = Math.min(smallest, size);
      const [a, b] = [lum(rgb(style.color).slice(0, 3)), lum(background(el))];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) low.push(`${node.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`);
    }
    return { smallest, low, scroll: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(report.scroll).toBe(false);
  expect(report.smallest).toBeGreaterThanOrEqual(11);
  expect(report.low).toEqual([]);
}

/** Brief → introduction → preparation (the Pros / Cons table) → recording → Finish → upload. */
async function recordPart3(page: Page, options: { tick: boolean } = { tick: true }) {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("part3-intro")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparation" })).toBeVisible();
  if (options.tick) {
    // Nothing to tick any more (as in the real exam): the Pros / Cons table only.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await audit(page, 0); // preparation: no black button
  }
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await audit(page, 1);
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
}

const part3Heading = (page: Page) => page.getByRole("heading", { name: /^Part 3 · Band [0-6] · / });

test.describe("scored (mock evaluator) @scored", () => {
  test("task list → real recording → upload → stored result → History and dashboard → retry with this goal", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    // Part 3 is open on the task list; its topics are real links (no mock).
    await page.goto("/practice");
    await expect(page.locator("#part-3").getByTestId("part-status")).toHaveCount(0);
    await openTopics(page, "3");
    const topic = page.locator("#part-3").getByRole("link", { name: new RegExp(CARS_TITLE) });
    expect(await topic.getAttribute("href")).toBe("/practice/part3/c1-part3-cars-in-city-centres");
    await topic.click();
    await expect(page.getByRole("heading", { name: CARS_TITLE })).toBeVisible();
    await expect(page.getByTestId("demo-label")).toHaveCount(0); // the real brief: no demo label
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled(); // enabled once the page is ready
    await audit(page, 1); // "Start"

    // Record: the minute of preparation shows the Pros / Cons table; Finish uploads.
    await recordPart3(page);
    await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
    await expect(part3Heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/);
    const resultUrl = page.url();
    await expect(page.getByTestId("development-evaluator")).toContainText("Development evaluator");
    await expect(page.getByTestId("demo-label")).toHaveCount(0); // a real result is never labelled a demo
    for (const title of ["Your points", "Biggest fix", "Words from the list", "Skills", "Your answer"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    // Nothing is ticked any more, so no point says "You chose this point".
    await expect(page.getByText("You chose this point")).toHaveCount(0);
    // The stored recording plays, and says when it will be deleted (30 days after scoring).
    const audio = page.locator("audio").first();
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => (Number.isFinite(el.duration) ? el.duration : -1)), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(page.getByTestId("audio-retention")).toHaveText(/^Your recording will be deleted on \d\d\.\d\d\.\d\d, 30 days after scoring\. The transcript and feedback are kept\.$/);
    await expect(page.getByTestId("transcript")).not.toBeEmpty();
    await audit(page, 1); // "Retry with this goal"
    await expect(page.getByRole("link", { name: "Retry with this goal" })).toHaveAttribute("href", /^\/practice\/part3\/c1-part3-cars-in-city-centres\?retry=[0-9a-f-]{36}$/);

    // A reload reopens it; another browser can't see it.
    await page.reload();
    await expect(part3Heading(page)).toBeVisible();
    const other = await page.context().browser()!.newContext({ baseURL: new URL(resultUrl).origin });
    const stranger = await other.newPage();
    expect((await stranger.goto(resultUrl))!.status()).toBe(404);
    await other.close();

    // History and the dashboard list it like a Part 2 attempt.
    await page.goto("/history");
    await expect(page.getByRole("link", { name: /Cars in city centres/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Part 3", exact: true })).toBeVisible(); // the filter
    await page.getByRole("link", { name: "Part 3", exact: true }).click();
    await expect(page.getByRole("link", { name: /Cars in city centres/ })).toHaveCount(1);
    await audit(page, 0);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /Cars in city centres/ }).first()).toBeVisible(); // Recent attempts
    await expect(page.getByText("Coming soon")).toHaveCount(2); // Part 1.1 and 1.2; Part 3 is open
    await audit(page, 1);

    // Retry with this goal: the goal and the earlier points come back, and the retry's result compares.
    await page.goto(resultUrl);
    await page.getByRole("link", { name: "Retry with this goal" }).click();
    await expect(page.getByTestId("goal-card")).toContainText("Your goal:");
    await recordPart3(page, { tick: false });
    await expect(part3Heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Band [0-6] → [0-6]$/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("mock mode still works unchanged: the demo needs ?mock=1 and sends nothing", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
    });
    await page.goto("/practice/part3/c1-part3-cars-in-city-centres?mock=1");
    await expect(page.getByTestId("demo-label")).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Preparation" })).toBeVisible();
    expect(apiCalls).toEqual([]);
  });
});

test.describe("AI scoring cannot run (no key): the recording and transcript are kept @nokey", () => {
  async function expectNotReady(page: Page) {
    const card = page.getByTestId("ai-not-ready");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card.getByRole("heading", { name: "AI score not ready yet" })).toBeVisible();
    await expect(page.getByText(/went wrong|couldn.t prepare|error/i)).toHaveCount(0);
    // The transcript is shown and the recording plays.
    await expect(page.getByText("Transcript", { exact: true })).toBeVisible();
    const audio = page.locator("audio").first();
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => (Number.isFinite(el.duration) ? el.duration : -1)), { timeout: 15_000 }).toBeGreaterThan(1);
    expect(await audio.evaluate((el: HTMLAudioElement) => el.error)).toBeNull();
    await expect(page.getByRole("button", { name: "Check again" })).toHaveClass(/bg-primary/);
    await audit(page, 1);
    // "Check again" asks again; with no key it still isn't ready, and nothing is lost.
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(card.getByRole("heading", { name: "AI score not ready yet" })).toBeVisible({ timeout: 60_000 });
  }

  test("Part 3: 'AI score not ready yet', not an error", async ({ page }) => {
    await page.goto("/practice/part3/c1-part3-cars-in-city-centres");
    await recordPart3(page);
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expectNotReady(page);
    await page.goto("/history");
    await expect(page.getByRole("link", { name: /Cars in city centres/ })).toBeVisible();
  });

  test("Part 2 behaves the same", async ({ page }) => {
    await page.goto("/practice/speaking/b2-part2-advice-from-someone");
    await page.getByRole("button", { name: "Start preparation" }).click();
    await expect(page.getByRole("heading", { name: "Preparation" })).toBeVisible();
    await page.getByRole("button", { name: "Start speaking now" }).click();
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Finish anyway" }).click();
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expectNotReady(page);
  });
});
