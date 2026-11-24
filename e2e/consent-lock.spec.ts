import { expect, test, type Page } from "@playwright/test";

/*
 * Pilot consent (docs/consent-design.md, "Pilot route"): the locked practice brief, previewed in mock mode with
 * ?consent=waiting|withdrawn|guest, at 390 px. No recording control, the task still readable, exactly one black
 * button, no text under 11 px, every text at WCAG AA contrast, no horizontal scroll, no API call. Without ?consent=
 * mock mode is never locked. Also runs on a Preview-like production build (playwright.preview.config.ts).
 */

const BLACK = ":is(a, button).bg-primary.text-on-primary";
const TASK = "/practice/speaking/b2-part2-happy-day";

test.use({ viewport: { width: 390, height: 844 } });

async function audit(page: Page) {
  await expect(page.locator(BLACK)).toHaveCount(1);
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
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, nextjs-portal")) continue;
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

for (const [lock, black, text] of [
  ["waiting", "See a demo result", "Ask your parent or guardian to confirm, then we will unlock recording."],
  ["withdrawn", "See a demo result", "Consent for recording was withdrawn."],
  ["guest", "Create account", "Recording needs an account."],
] as const) {
  test(`locked practice brief (?consent=${lock}): kind message, no recording controls, one black button, AA at 390 px`, async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
    });
    await page.goto(`${TASK}?mock=1&consent=${lock}`);
    const locked = page.getByTestId("recording-locked");
    await expect(locked).toBeVisible();
    await expect(locked).toContainText(text);
    await expect(page.getByRole("button", { name: "Start preparation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check microphone" })).toHaveCount(0);
    await expect(page.getByTestId("questions-hidden")).toBeVisible();
    await expect(page.locator(BLACK)).toHaveText(black);
    await audit(page);
    expect(apiCalls).toEqual([]);
  });
}

test("mock mode without ?consent= is not locked", async ({ page }) => {
  await page.goto(`${TASK}?mock=1`);
  await expect(page.getByRole("button", { name: "Start preparation" })).toBeVisible();
  await expect(page.getByTestId("recording-locked")).toHaveCount(0);
});

test("Part 1 practice brief is locked too (?consent=waiting): no Start, one black button, AA at 390 px", async ({ page }) => {
  await page.goto("/practice/speaking/a2-part1-1-daily-life?mock=1&consent=waiting");
  await expect(page.getByTestId("recording-locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await audit(page);
});

for (const status of ["waiting", "granted", "withdrawn"] as const) {
  test(`Account page, Recording consent (?consent=${status}): read-only, the 30-day rule, one black button, AA at 390 px`, async ({ page }) => {
    await page.goto(`/profile?mock=1&consent=${status}`);
    const section = page.getByTestId("consent-status");
    await expect(section).toHaveAttribute("data-status", status);
    await expect(section).toContainText("Recordings are deleted 30 days after scoring.");
    await expect(section.locator("a, button")).toHaveCount(0);
    await audit(page);
  });
}
