import { expect, test, type Page } from "@playwright/test";
import { shortPartIntros } from "./short-intro";

/*
 * Part 3 in mock mode (Part 3 is not live), at 390 px: topic list → brief → preparation, where the student ticks two
 * points per side → recording → Scoring… → result (band 4, the rebuttal goal) → Retry with this goal → the retry
 * result (band 5, "Goal met"). No API call, every page a ?mock=1 address, one black button at most per screen, no
 * text under 11 px, every text at WCAG AA contrast, no horizontal scroll. Without ?mock=1 the pages are a 404, and
 * the dashboard and home page keep "Coming soon" for Part 3. Also runs on a Preview-like production build.
 */

const BLACK = ":is(a, button).bg-primary.text-on-primary";
const CARS = "c1-part3-cars-in-city-centres";

test.use({ viewport: { width: 390, height: 844 } });

function watch(page: Page) {
  const apiCalls: string[] = [];
  const realPages: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiCalls.push(url.pathname);
    const headers = request.headers();
    const prefetch = "next-router-prefetch" in headers || "next-router-segment-prefetch" in headers;
    const isPage = request.isNavigationRequest() || (headers["rsc"] === "1" && !prefetch);
    if (isPage && url.searchParams.get("mock") !== "1") realPages.push(`${url.pathname}${url.search}`);
  });
  return { apiCalls, realPages };
}

async function audit(page: Page, blacks: number) {
  await expect(page.locator("main").locator(BLACK)).toHaveCount(blacks);
  await expect(page.locator(BLACK)).toHaveCount(blacks);
  const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of hrefs) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
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
      if (ratio < (large ? 3 : 4.5) && !(el as HTMLButtonElement).disabled) low.push(`${node.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`);
    }
    return { smallest, low, scroll: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(report.scroll).toBe(false);
  expect(report.smallest).toBeGreaterThanOrEqual(11);
  expect(report.low).toEqual([]);
}

test("Part 3 mock loop: choose 2 + 2 points, record, result with the rebuttal goal, retry, Goal met", async ({ page }) => {
  const seen = watch(page);
  await shortPartIntros(page);

  await page.goto("/practice/part3?mock=1");
  await expect(page.getByRole("heading", { name: "Balanced argument" })).toBeVisible();
  await audit(page, 0);
  await page.getByRole("link", { name: "Start: Cars in city centres" }).click();

  // Brief: statement, both lists, 1 min / 2 min, one black "Start".
  await expect(page.getByText("Cities should ban private cars from their centres.").first()).toBeVisible();
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled();
  await audit(page, 1);
  await start.click();

  // The spoken introduction on its own screen (its text too), no button; preparation starts by itself after the chime.
  await expect(page.getByTestId("part3-intro")).toBeVisible();
  await expect(page.getByTestId("intro-text")).toContainText("Choose two points from each list");
  await expect(page.getByText("Cities should ban private cars from their centres.")).toHaveCount(0);
  await audit(page, 0);

  // Preparation: tick two per side; a third on a side is not possible. No black button.
  await expect(page.getByRole("button", { name: "Start speaking now" })).toBeVisible();
  await page.getByLabel("F1 Cleaner air and less noise").check();
  await page.getByLabel("F2 Safer streets for pedestrians and cyclists").check();
  await expect(page.getByLabel("F3 More people would use public transport")).toBeDisabled();
  await page.getByLabel("A1 Difficult for elderly and disabled people").check();
  await page.getByLabel("A2 Shops and businesses in the centre may lose customers").check();
  await expect(page.getByTestId("choice-summary")).toHaveText("FOR 2 of 2 · AGAINST 2 of 2");
  await audit(page, 0);
  await page.getByRole("button", { name: "Start speaking now" }).click();

  // Recording: one black "Finish"; finishing early asks first.
  const finish = page.getByRole("button", { name: "Finish", exact: true });
  await expect(finish).toBeVisible();
  await audit(page, 1);
  await page.waitForTimeout(800);
  await finish.click();
  await page.getByRole("button", { name: "Finish anyway" }).click();

  // Scoring… then the result for the points chosen.
  await expect(page).toHaveURL(new RegExp(`/result/part3\\?demo=p3\\.${CARS}\\.F1F2A1A2&state=scoring&next=1&mock=1$`));
  await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
  await audit(page, 0);
  await expect(page.getByRole("heading", { name: "Part 3 · Band 4 · Higher B2" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("point-A1")).toContainText("Stated, then argued against");
  await expect(page.getByText("Before you argue against a point, give one real reason that supports it.").first()).toBeVisible();
  await audit(page, 1);

  // Retry with this goal: the goal on every screen, the same points ticked.
  await page.getByRole("link", { name: "Retry with this goal" }).click();
  await expect(page.getByTestId("goal-card")).toContainText("Support A1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("part3-intro")).toBeVisible();
  await expect(page.getByTestId("goal-card")).toBeVisible();
  await expect(page.getByLabel("A1 Difficult for elderly and disabled people")).toBeChecked();
  await expect(page.getByTestId("goal-card")).toBeVisible();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByTestId("goal-card")).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByRole("heading", { name: "Part 3 · Band 5 · C1" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("goal-outcome")).toContainText("Goal met");
  await audit(page, 1);

  expect(seen.apiCalls).toEqual([]);
  expect(seen.realPages).toEqual([]);
});

test("the real introduction plays, then preparation and recording start by themselves and end with the chime", async ({ page }) => {
  test.setTimeout(120_000);
  const seen = watch(page);
  const intro = page.waitForResponse((r) => r.url().endsWith("/audio/speaking/part3/intro/v1/intro.wav") && r.ok());
  // 60 s / 120 s at 0.05: 3 s of preparation and 6 s of speaking. The introduction is the real file (about 21 s).
  await page.goto(`/practice/part3/${CARS}?mock=1&timeScale=0.05`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await intro;
  await expect(page.getByTestId("part3-intro")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start speaking now" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible({ timeout: 15_000 });
  // Time is up: recording stops by itself, the chime sounds, then the demo Scoring….
  await expect(page).toHaveURL(/\/result\/part3\?demo=p3\.c1-part3-cars-in-city-centres\.[^&]*&state=scoring&next=1&mock=1$/, { timeout: 20_000 });
  expect(seen.apiCalls).toEqual([]);
});

test("Part 2 (mock mode): the real introduction plays on its own screen, then the chime and the minute of preparation", async ({ page }) => {
  test.setTimeout(90_000);
  const seen = watch(page);
  const intro = page.waitForResponse((r) => r.url().endsWith("/audio/speaking/part2/intro/v1/intro.wav") && r.ok());
  await page.goto("/practice/speaking/b2-part2-advice-from-someone?mock=1");
  await page.getByRole("button", { name: "Start preparation" }).click();
  await intro;
  await expect(page.getByTestId("part2-intro")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Part 2", exact: true })).toBeVisible();
  await expect(page.getByTestId("intro-text")).toContainText("a picture and three questions");
  await audit(page, 0);
  // About 15 s of speech, then the chime, then the task with the one-minute countdown.
  await expect(page.getByRole("button", { name: "Start speaking now" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("part2-intro")).toHaveCount(0);
  expect(seen.apiCalls).toEqual([]);
});

test("without ?mock=1 Part 3 is a 404, and the home page and dashboard keep 'Coming soon'", async ({ page }) => {
  for (const path of ["/practice/part3", `/practice/part3/${CARS}`, `/result/part3?demo=p3.${CARS}.F1F2A1A2`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  await page.goto("/?mock=1");
  await expect(page.getByText(/Part 3 · C1/).locator("..")).toContainText("Coming soon");
  await page.goto("/dashboard?mock=1");
  await expect(page.getByText("Coming soon").first()).toBeVisible();
});
