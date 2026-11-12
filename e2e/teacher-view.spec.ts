import { expect, test, type Page } from "@playwright/test";

/*
 * The Teacher view in mock mode (docs/teacher-plan.md, sections 6 and 8), at 390 px: the demo teacher creates a class,
 * the demo student joins with DEMO42 and shares, the teacher opens an attempt and agrees, the student leaves. Nothing
 * is sent (no API call), every page is a ?mock=1 address, one black button per screen (none on the attempt), no text
 * under 11 px, every text at WCAG AA contrast, no horizontal scroll. Real teacher and join pages are a 404 (the
 * Teacher view is off until parent consent exists). Also runs on a Preview-like production build
 * (playwright.preview.config.ts).
 */

const BLACK = ":is(a, button).bg-primary.text-on-primary";

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

/** One screen: black buttons in the content (the nav is grey), mock links only, no scroll, ≥ 11 px, AA contrast. */
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
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, nextjs-portal")) continue;
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

test("create → join → share → attempt → Agree → Leave, all in mock mode at 390 px", async ({ page, context }) => {
  const seen = watch(page);

  // The demo teacher's Home: Your classes on top, Create class the one black button.
  await page.goto("/dashboard?mock=1&as=teacher");
  await expect(page.getByTestId("your-classes")).toContainText("Demo class");
  await audit(page, 1);
  await page.getByRole("link", { name: "Create class" }).click();
  await expect(page).toHaveURL(/\/teacher\/classes\/new\?mock=1&as=teacher$/);
  await audit(page, 1);
  await page.getByLabel("Class name").fill("Group B");
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByTestId("join-code")).toHaveText("DEMO42");
  await expect(page.getByRole("button", { name: "Copy code" })).toBeVisible();
  await audit(page, 1);

  // The student joins with the code (any case) and shares.
  const student = await context.newPage();
  const studentSeen = watch(student);
  await student.goto("/profile?mock=1");
  await expect(student.getByTestId("my-classes")).toBeVisible();
  await audit(student, 1);
  await student.getByRole("link", { name: "Join a class" }).click();
  await expect(student).toHaveURL(/\/profile\/classes\/join\?mock=1$/);
  await audit(student, 1);
  await student.getByLabel("Class code").fill("WRONG1");
  await student.getByRole("button", { name: "Continue" }).click();
  await expect(student.locator("#join-problem")).toHaveText("We can't find a class with this code.");
  await student.getByLabel("Class code").fill("demo42");
  await student.getByRole("button", { name: "Continue" }).click();
  await expect(student.getByRole("heading", { name: "Demo teacher · Demo class" })).toBeVisible();
  await expect(student.getByLabel("Name your teacher sees")).toHaveValue("Student");
  await expect(student.getByText("Earlier attempts, email, exam date.")).toBeVisible();
  await expect(student.getByText("Your recordings (deleted after 30 days)")).toBeVisible();
  await audit(student, 1);
  await student.getByLabel("Name your teacher sees").fill("Sam");
  await student.getByRole("button", { name: "Share with this teacher" }).click();
  await expect(student.getByTestId("shared")).toContainText("Demo class · Sam");
  await student.getByRole("link", { name: "Back to your account" }).click();
  await expect(student.getByTestId("membership")).toContainText("Demo teacher · Demo class");

  // The teacher: class → student → latest attempt → Agree, then Change → Choose level.
  await page.goto("/teacher/classes/demo-class?mock=1&as=teacher");
  await expect(page.getByTestId("join-code")).toHaveText("DEMO42");
  await expect(page.getByTestId("student-row")).toHaveCount(6);
  await audit(page, 1);
  await page.getByTestId("student-row").filter({ hasText: "Jasur" }).click();
  await expect(page.getByRole("heading", { name: "Jasur" })).toBeVisible();
  await audit(page, 1);
  await page.getByRole("link", { name: "Open latest attempt" }).click();
  await expect(page.getByTestId("app-verdict")).toHaveText(/^CEFRO: Part 2 · Band \d · /);
  await audit(page, 0);
  const agree = page.getByRole("button", { name: "Agree" });
  const choose = page.getByRole("button", { name: "Choose level" });
  const [a, c] = [await agree.boundingBox(), await choose.boundingBox()];
  expect(Math.abs(a!.width - c!.width)).toBeLessThan(1);
  expect(Math.abs(a!.height - c!.height)).toBeLessThan(1);
  expect(Math.abs(a!.y - c!.y)).toBeLessThan(1); // side by side
  expect(await agree.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await choose.evaluate((el) => getComputedStyle(el).backgroundColor));
  for (const absent of ["Retry with this goal", "Learn how"]) await expect(page.getByText(absent)).toHaveCount(0);
  // The teacher's own player is on the page (play only: no download); the student's player is not.
  await expect(page.getByTestId("teacher-player")).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(1);
  await agree.click();
  await expect(page.getByTestId("your-rating")).toHaveText("You: Agree");
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: /^Band 4 · Higher B2$/ }).click();
  await expect(page.getByTestId("your-rating")).toHaveText("You: Higher B2 (Band 4)");
  await audit(page, 0);

  // The student leaves (confirm card, both buttons grey).
  await student.getByTestId("leave-class").click();
  await expect(student.getByText("Your teacher loses access to everything.")).toBeVisible();
  await audit(student, 1);
  await student.getByRole("button", { name: "Leave class" }).click();
  await expect(student.getByTestId("leave-class-done")).toBeVisible();

  expect(seen.apiCalls).toEqual([]);
  expect(studentSeen.apiCalls).toEqual([]);
  expect(seen.realPages).toEqual([]);
  expect(studentSeen.realPages).toEqual([]);
});

test("real teacher and join pages are a 404 while the Teacher view is off", async ({ page }) => {
  for (const path of ["/teacher/classes/new", "/teacher/classes/demo-class", "/teacher/classes/demo-class/attempts/aziza-2", "/teacher/classes/demo-class/mocks/aziza-mock", "/profile/classes/join", "/join/DEMO42"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  for (const path of ["/api/teacher/classes", "/api/classes", "/api/teacher/classes/x/mocks/y", "/api/teacher/classes/x/attempts/y/audio"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});
