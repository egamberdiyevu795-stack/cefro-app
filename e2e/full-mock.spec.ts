import { expect, test, type Page } from "@playwright/test";
import { shortPartIntros } from "./short-intro";

/*
 * The full mock exam in MOCK MODE at 390 px (docs/v1-plan.md, step 2): /practice card → "Before you start" → Parts 1.1, 1.2, 2,
 * 3 back to back with their real spoken-intro flow (intros shortened, as in the other specs), a thin "Part N of 4" line, no
 * result in between → the demo mock result, a row for each part linking to its demo result. Nothing is sent: no /api call at all.
 * Every screen: at most one black button, no text under 11 px, AA contrast, no horizontal scroll. Then a laptop-width pass.
 */
const BLACK = ":is(a, button).bg-primary.text-on-primary";
const SCALE = 0.05;

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  await shortPartIntros(page);
  // Part 1's spoken introduction is ~17 s of real audio: serve Question 1's short file instead (as the Part 1 specs do).
  await page.route("**/v1/intro.wav", async (route) => {
    const url = route.request().url().replace("/intro.wav", "/q1.wav").replace("/b1-part1-2-shopping/v1/q1.wav", "/b1-part1-2-shopping/v1/q4.wav");
    await route.fulfill({ response: await route.fetch({ url }) });
  });
});

async function audit(page: Page, blacks: number) {
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
      if (ratio < (large ? 3 : 4.5) && !(el as HTMLButtonElement).disabled) low.push(`${node.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`);
    }
    return { smallest, low, scroll: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(report.scroll).toBe(false);
  expect(report.smallest).toBeGreaterThanOrEqual(11);
  expect(report.low).toEqual([]);
}

test("the whole mock in mock mode: four parts back to back, progress line, no result between, then the mock result", async ({ page }) => {
  const api: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/")) api.push(url.pathname);
  });

  // The card at the top of /practice is the page's one black button.
  await page.goto("/practice?mock=1");
  await expect(page.getByTestId("mock-card")).toBeVisible();
  await audit(page, 1);
  await expect(page.getByTestId("mock-card").getByRole("link", { name: "Try the demo mock" })).toHaveAttribute("href", "/practice/mock?mock=1");

  await page.goto(`/practice/mock?mock=1&timeScale=${SCALE}`);
  await expect(page.getByRole("heading", { name: "Full mock exam" })).toBeVisible();
  await expect(page.getByTestId("mock-parts").getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("You can’t pause between parts", { exact: false })).toBeVisible();
  await audit(page, 1);
  const start = page.getByRole("button", { name: "Start mock" });
  await expect(start).toBeEnabled();
  await start.click();

  // Part 1.1 and 1.2: the real question-by-question player, no brief, no result when they end.
  const progress = page.getByTestId("mock-progress");
  await expect(progress).toContainText("Part 1 of 4");
  await expect(page.getByTestId("part1-intro")).toBeVisible();
  await audit(page, 0);
  await expect(page.getByTestId("question-counter")).toBeVisible({ timeout: 30_000 });
  await expect(progress).toContainText("Part 2 of 4", { timeout: 60_000 });
  await expect(page).toHaveURL(/\/practice\/mock\?/);
  await expect(page.getByTestId("part1-pictures")).toBeVisible({ timeout: 30_000 });

  // Part 2: introduction, questions read aloud, then the minute of preparation (no black button), then recording.
  await expect(progress).toContainText("Part 3 of 4", { timeout: 60_000 });
  await expect(page.getByTestId("part2-intro")).toBeVisible();
  const skipPrep = page.getByRole("button", { name: "Start speaking now" });
  await expect(skipPrep).toBeVisible({ timeout: 30_000 });
  await audit(page, 0);
  await skipPrep.click();
  const finish = page.getByRole("button", { name: "Finish", exact: true });
  await expect(finish).toBeVisible();
  await expect(finish).toBeEnabled(); // a disabled button is dimmed on purpose
  await audit(page, 1);
  await page.waitForTimeout(400);
  await finish.click();
  await page.getByRole("button", { name: "Finish anyway" }).click();

  // Part 3: the Pros / Cons table (nothing to tick), record.
  await expect(progress).toContainText("Part 4 of 4");
  await expect(page.getByTestId("part3-intro")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start speaking now" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(finish).toBeVisible();
  await page.waitForTimeout(800);
  await finish.click();
  await page.getByRole("button", { name: "Finish anyway" }).click();

  // The end opens the demo mock result (demo answers): no scoring screen in between, one row per part, one black button.
  await expect(page).toHaveURL(/\/practice\/mock\/demo-mock\?mock=1/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Your estimated speaking level" })).toBeVisible();
  await expect(page.getByTestId("part-details")).toHaveCount(4);
  await audit(page, 1);
  const hrefs = await page.getByTestId("part-details").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs.every((h) => h?.includes("mock=1"))).toBe(true);
  expect(hrefs[3]).toMatch(/^\/result\/part3\?demo=p3\..*F1F2A1A2/);

  // Each row opens that part's own (demo) result.
  await page.getByTestId("part-details").nth(2).click();
  await expect(page.getByRole("heading", { name: /^Part 2 · / })).toBeVisible({ timeout: 20_000 });

  expect(api).toEqual([]);
});

test("at laptop width the start screen and the mock's first part fit and keep one black button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/practice/mock?mock=1&timeScale=${SCALE}`);
  await expect(page.getByRole("heading", { name: "Full mock exam" })).toBeVisible();
  await expect(page.locator(BLACK)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Start mock" }).click();
  await expect(page.getByTestId("mock-progress")).toContainText("Part 1 of 4");
  await expect(page.getByTestId("question-counter")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(BLACK)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("without the real switch, /practice says Coming soon with no button, and the real mock page is a 404", async ({ page }) => {
  await page.goto("/practice");
  await expect(page.getByTestId("mock-status")).toContainText("Coming soon.");
  await expect(page.getByTestId("mock-card").getByRole("link")).toHaveCount(0);
  await expect(page.locator(BLACK)).toHaveCount(0);
  expect((await page.goto("/practice/mock"))?.status()).toBe(404);
});
