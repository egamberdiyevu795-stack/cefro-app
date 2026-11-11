import { expect, type Page } from "@playwright/test";

/** The black (primary) controls on a page: at most one per screen. */
export const BLACK = ":is(a, button).bg-primary.text-on-primary";

/**
 * The audit every screen passes (docs/design-system.md): exactly `blacks` black buttons, no text under 11 px, AA contrast for
 * all visible text, no horizontal scroll. Same checks as the other specs, shared here for the mock result.
 */
export async function audit(page: Page, blacks: number) {
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
