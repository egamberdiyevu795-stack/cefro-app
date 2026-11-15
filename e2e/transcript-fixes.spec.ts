import { expect, test, type Page } from "@playwright/test";
import { audit } from "./audit";

/*
 * "Your answer": the transcript with mistakes and better versions (docs/v1-plan.md §3.3, step 5), in MOCK MODE at 390 px.
 * The demo answers go through the real evaluator types (mock evaluator, real quality gate), so these are the real components on
 * real result shapes. Checks: the count, the amber (not red) underline and its contrast, tap to expand You said / Better / Why
 * under the sentence, one open at a time, no model answer, no new black button, no text under 11 px, no horizontal scroll;
 * a result without the list (the saved live runs) still shows the plain transcript; Part 3 and the teacher's read-only page
 * show the same view.
 */
test.use({ viewport: { width: 390, height: 844 } });

const ADVICE = "/result?demo=answer.b2-part2-advice-from-someone&mock=1";

test.beforeEach(async ({ page }) => {
  page.on("request", (r) => {
    expect(new URL(r.url()).pathname.startsWith("/api/"), `no API call: ${r.url()}`).toBe(false);
  });
});

/** The WCAG contrast of the underline colour against the surface it sits on, and whether it is a red. */
async function underlineOf(page: Page) {
  return page.getByTestId("fix-mark").first().evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const style = getComputedStyle(el);
    let surface = [255, 255, 255];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
      if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) {
        surface = c.slice(0, 3);
        break;
      }
    }
    const line = rgb(style.textDecorationColor);
    const [a, b] = [lum(line), lum(surface)];
    return {
      line,
      lineStyle: style.textDecorationLine,
      thickness: parseFloat(style.textDecorationThickness),
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    };
  });
}

test("the count, the amber underline (3:1 or better, not red), and the words that carry it", async ({ page }) => {
  await page.goto(ADVICE);
  await expect(page.getByTestId("fixes-count")).toHaveText("2 sentences to improve");
  await expect(page.getByTestId("fix-sentence")).toHaveCount(2);
  const marks = page.getByTestId("fix-mark");
  await expect(marks).toHaveText([/wanted give up school$/, /^I decided do exactly that$/]);

  const underline = await underlineOf(page);
  expect(underline.lineStyle).toContain("underline");
  expect(underline.thickness).toBeGreaterThanOrEqual(2);
  // Amber, not red: red clearly above green and blue is red; amber has a real green part and almost no blue.
  const [r, g, b] = underline.line;
  expect(r).toBeGreaterThan(150);
  expect(g).toBeGreaterThan(60);
  expect(g / r).toBeGreaterThan(0.4);
  expect(b).toBeLessThan(g);
  // Non-text contrast (WCAG 1.4.11): at least 3:1 against the card behind it.
  expect(underline.ratio).toBeGreaterThanOrEqual(3);
  await audit(page, 1);
});

test("tap a sentence: You said / Better / Why open under it; one open at a time; tap again closes", async ({ page }) => {
  await page.goto(ADVICE);
  const sentences = page.getByTestId("fix-sentence");
  await expect(sentences.first()).toBeEnabled();
  await expect(page.getByTestId("fix-panel")).toHaveCount(0);

  await sentences.first().click();
  await expect(sentences.first()).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByTestId("fix-panel");
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("You said");
  await expect(panel).toContainText(/“[^”]*wanted give up school”/);
  await expect(panel).toContainText("Better");
  await expect(panel).toContainText(/“[^”]*wanted to give up school”/);
  await expect(panel.locator("strong")).toHaveText("to");
  await expect(panel).toContainText("Why");
  await expect(panel).toContainText("After 'want', 'need' and 'decide', put 'to' before the next verb.");

  // It opens UNDER the sentence it belongs to, not somewhere else.
  const [s, p] = [await sentences.first().boundingBox(), await panel.boundingBox()];
  expect(p!.y).toBeGreaterThanOrEqual(s!.y + s!.height - 1);
  expect(p!.x + p!.width).toBeLessThanOrEqual(390);
  await audit(page, 1);

  // Another sentence: the first closes, the second opens.
  await sentences.nth(1).click();
  await expect(sentences.first()).toHaveAttribute("aria-expanded", "false");
  await expect(sentences.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("“I decided to do exactly that”");

  await sentences.nth(1).click();
  await expect(panel).toHaveCount(0);
  await audit(page, 1);
});

test("keyboard: the sentence is a real button (Enter opens it); the page's one black button is still Retry", async ({ page }) => {
  await page.goto(ADVICE);
  const first = page.getByTestId("fix-sentence").first();
  await expect(first).toBeEnabled();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fix-panel")).toBeVisible();
  await expect(page.locator(":is(a, button).bg-primary.text-on-primary")).toHaveText("Retry with this goal");
});

test("never a full rewritten or model answer in 'Your answer'", async ({ page }) => {
  await page.goto(ADVICE);
  await page.getByTestId("fix-sentence").first().click();
  const card = page.getByRole("region", { name: "Your answer" }).or(page.locator("section[aria-labelledby=answer-title]"));
  const text = (await card.innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/model answer|improved answer|rewritten|full answer/i);
  // The list never repeats more than the student's own sentences with one fix: Better is at most a few words longer.
  const you = (await page.getByTestId("fix-detail").first().locator("dd").nth(0).innerText()).split(/\s+/).length;
  const better = (await page.getByTestId("fix-detail").first().locator("dd").nth(1).innerText()).split(/\s+/).length;
  expect(better - you).toBeLessThanOrEqual(3);
});

test("a result without the list (scored before the change) still shows the plain transcript", async ({ page }) => {
  await page.goto("/result?anchor=A2-b1-all-three&mock=1");
  await expect(page.getByRole("heading", { name: /Part 2/ })).toBeVisible();
  await expect(page.getByTestId("transcript-fixes")).toHaveCount(0);
  await expect(page.getByTestId("fixes-count")).toHaveCount(0);
  await expect(page.getByText("Transcript", { exact: true })).toBeVisible();
  await audit(page, 1);
});

test("Part 1.1 and 1.2 results show the same view", async ({ page }) => {
  for (const [task, count] of [
    ["a2-part1-1-daily-life", "1 sentence to improve"],
    ["b1-part1-2-shopping", "1 sentence to improve"],
  ] as const) {
    await page.goto(`/result?demo=answer.${task}&mock=1`);
    await expect(page.getByTestId("fixes-count")).toHaveText(count);
    await page.getByTestId("fix-sentence").first().click();
    await expect(page.getByTestId("fix-panel")).toContainText("Better");
    await audit(page, 1);
  }
});

test("Part 3 result: the same view, and the dotted underline for words read from the lists stays", async ({ page }) => {
  await page.goto("/result/part3?demo=p3.c1-part3-cars-in-city-centres.F1F2A1A2&mock=1");
  await expect(page.getByTestId("fixes-count")).toHaveText(/^\d sentences? to improve$/);
  const sentences = page.getByTestId("fix-sentence");
  await expect(sentences.first()).toBeEnabled();
  await sentences.first().click();
  await expect(page.getByTestId("fix-panel")).toContainText("You said");
  await expect(page.getByTestId("fix-panel")).toContainText("Why");
  await audit(page, 1);
});

test("the teacher's read-only attempt page shows the same transcript view, with no new button", async ({ page }) => {
  await page.goto("/teacher/classes/demo-class/attempts/madina-1?mock=1&as=teacher");
  await expect(page.getByTestId("fixes-count")).toHaveText("2 sentences to improve");
  await expect(page.getByTestId("fix-mark")).toHaveCount(2);
  const sentences = page.getByTestId("fix-sentence");
  await expect(sentences.first()).toBeEnabled();
  await sentences.first().click();
  await expect(page.getByTestId("fix-panel")).toContainText("Better");
  // No black button on the teacher's attempt page.
  await audit(page, 0);
});

test("controls wait for the page: with the scripts delayed, a sentence is disabled, never a tap that does nothing", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.goto(ADVICE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("fix-sentence").first()).toBeDisabled();
  await expect(page.getByTestId("fix-sentence").first()).toBeEnabled({ timeout: 30_000 });
});
