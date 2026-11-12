import { expect, test } from "@playwright/test";

/** The quiet "Credits" footer link (the CC BY 4.0 voice attribution): on every page, opens a plain page, no black button. */
for (const path of ["/?mock=1", "/dashboard?mock=1", "/practice?mock=1", "/history?mock=1"]) {
  test(`the footer of ${path} links to the credits page`, async ({ page }) => {
    await page.goto(path);
    const link = page.getByRole("link", { name: "Credits" });
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole("heading", { name: "Credits", level: 1 })).toBeVisible();
    await expect(page.getByText("LibriTTS corpus")).toBeVisible();
    await expect(page.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    await expect(page.getByRole("button")).toHaveCount(0);
  });
}

test("the credits page works at 390 px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/credits");
  await expect(page.getByRole("heading", { name: "Credits", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
