import { expect, test, type Page } from "@playwright/test";

/*
 * The app frame on every screen size (docs/design-system.md, "Layout"): the icon rail on the left from 768 px, a fixed
 * bottom bar only on phones. 900 px is a common laptop at 150% zoom (or a half-screen window): it must get the rail, not
 * the phone layout. Also: a signed-out student on Home sees "You are not signed in" (mock mode is the demo account).
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";

async function navPlacement(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).evaluate((nav) => {
    const box = nav.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    return { position: getComputedStyle(nav).position, left: box.right <= main.left, bottom: Math.round(box.bottom) === window.innerHeight };
  });
}

for (const url of ["/dashboard?mock=1", "/practice?mock=1", "/history?mock=1"]) {
  test(`${url}: icon rail at 900 px and 1440 px, bottom bar at 390 px`, async ({ page }) => {
    for (const width of [900, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      const nav = await navPlacement(page);
      expect(nav.position).toBe("static");
      expect(nav.left).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    const phone = await navPlacement(page);
    expect(phone.position).toBe("fixed");
    expect(phone.bottom).toBe(true);
  });
}

test("Home: a signed-out browser sees 'You are not signed in' with Create account and Sign in; mock mode does not", async ({ page }) => {
  await page.goto("/dashboard?mock=1");
  await expect(page.getByTestId("guest-card")).toHaveCount(0);
  test.skip(PREVIEW, "on a Preview with no variables the real pages are refused");
  await page.goto("/dashboard");
  const card = page.getByTestId("guest-card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register?next=%2Fdashboard");
  await expect(card.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fdashboard");
});
