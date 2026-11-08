import { expect, test, type Page } from "@playwright/test";

/*
 * No page shows a control that does nothing (launch cleanup): no disabled control once the page is ready, no button
 * without an action, no link to nowhere, and no "Coming soon" anywhere except the exam-part status of a part that is not
 * live yet (dashboard tiles, the home page's parts list: text, not a control). Runs on `next dev` (mock and real pages) and, with `npm run test:e2e:preview`, on a
 * production build started like a Vercel Preview with no variables (mock pages only: real pages refuse there).
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";

const MOCK_PAGES = [
  "/?mock=1",
  "/login?mock=1",
  "/register?mock=1",
  "/dashboard?mock=1",
  "/dashboard?mock=1&as=teacher",
  "/practice?mock=1",
  "/practice/speaking/b2-part2-a-tradition?mock=1",
  "/practice/speaking/b2-part2-a-tradition?mock=1&retry=demo-5",
  "/result?mock=1",
  "/result?demo=demo-5&mock=1",
  "/result?demo=demo-6&mock=1",
  "/history?mock=1",
  "/profile?mock=1",
  "/lessons?mock=1",
  "/lessons/l-t1?mock=1",
  "/lessons/l-t8?mock=1",
  "/lessons/l-t4-b2?mock=1",
  "/lessons/l-t1?demo=demo-5&mock=1",
  "/teacher/classes/demo-class?mock=1&as=teacher",
];

/** Real pages as a new visitor sees them (signed out; the e2e server has its own throwaway database). */
const REAL_PAGES = ["/", "/login", "/register", "/dashboard", "/practice", "/practice/speaking/b2-part2-advice-from-someone", "/history", "/profile", "/lessons", "/lessons/l-t1"];

/**
 * Every control on the page that is disabled, does nothing, or links nowhere, described for the failure message.
 * A button "does something" when React gave it a click (or pointer / key) handler, or it submits a form.
 */
async function deadControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const describe = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 60)}"`;
    const reactProps = (el: Element): Record<string, unknown> => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      return key ? ((el as unknown as Record<string, Record<string, unknown>>)[key] ?? {}) : {};
    };
    const dead: string[] = [];
    for (const el of document.querySelectorAll("button, input, select, textarea, a, [role=button], [aria-disabled]")) {
      if (el.closest("nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]")) continue; // the dev overlay
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") {
        dead.push(`disabled ${describe(el)}`);
        continue;
      }
      if (el instanceof HTMLAnchorElement) {
        const href = el.getAttribute("href");
        if (!href || href === "#" || href.startsWith("javascript:")) dead.push(`link to nowhere ${describe(el)}`);
        continue;
      }
      if (el instanceof HTMLButtonElement || el.getAttribute("role") === "button") {
        const props = reactProps(el);
        const handled = ["onClick", "onPointerDown", "onMouseDown", "onKeyDown"].some((name) => typeof props[name] === "function");
        const submits = el instanceof HTMLButtonElement && el.type === "submit" && el.form !== null;
        if (!handled && !submits) dead.push(`no action ${describe(el)}`);
      }
    }
    return dead;
  });
}

/** "Coming soon" outside the exam-part tiles. */
async function comingSoonOutsidePartTiles(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/coming soon/i.test(node.textContent ?? "")) continue;
      const el = node.parentElement;
      if (el?.closest("script, style, template")) continue;
      if (el?.closest('[data-testid="part-tile"], [data-testid="exam-status"]')) continue;
      count += 1;
    }
    return count;
  });
}

/** Marks the page's visible buttons (`data-probe="0"`, "1", …; not the Next.js dev overlay) and returns how many. */
async function markButtons(page: Page): Promise<number> {
  return page.evaluate(() => {
    const visible = [...document.querySelectorAll("button, [role=button]")].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    visible.forEach((el, i) => el.setAttribute("data-probe", String(i)));
    return visible.length;
  });
}

/**
 * Clicks one button (the n-th visible one) on a fresh copy of the page and reports whether anything happened: the
 * page changed (any DOM change), it navigated, it sent a request, or (a submit button) the browser's own form check
 * stopped an empty form. A "Coming soon" message counts as nothing. Null when it did something.
 */
async function probeButton(page: Page, url: string, index: number): Promise<string | null> {
  await page.goto(url);
  await expect.poll(() => deadControls(page), { timeout: 15_000 }).toEqual([]);
  if ((await markButtons(page)) <= index) return null; // the page changed between loads (e.g. a timer): nothing to probe
  const button = page.locator(`[data-probe="${index}"]`);
  const name = `${((await button.getAttribute("aria-label")) ?? (await button.innerText())).trim().slice(0, 60)}`;
  const invalidForm = await button.evaluate((el) => el instanceof HTMLButtonElement && el.type === "submit" && el.form !== null && !el.form.checkValidity());
  if (invalidForm) return null;
  await page.evaluate(() => {
    const w = window as unknown as { __changes: number; __observer?: MutationObserver };
    w.__changes = 0;
    w.__observer = new MutationObserver((records) => (w.__changes += records.length));
    w.__observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  let requests = 0;
  const onRequest = () => (requests += 1);
  page.on("request", onRequest);
  const before = page.url();
  await button.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  page.off("request", onRequest);
  if (page.url() !== before) return null;
  const { changes, comingSoon } = await page.evaluate(() => ({
    changes: (window as unknown as { __changes: number }).__changes,
    comingSoon: /coming soon/i.test(document.body.innerText.replace(/\s+/g, " ")) && [...document.querySelectorAll('[role=status], [aria-live]')].some((el) => /coming soon/i.test(el.textContent ?? "")),
  }));
  if (comingSoon) return `"${name}" only says Coming soon`;
  return changes > 0 || requests > 0 ? null : `"${name}" does nothing`;
}

async function expectNoDeadControls(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status(), url).toBeLessThan(400);
  // Controls that wait for the page (useHydrated) turn on once the scripts run: wait for that, then nothing is disabled.
  await expect.poll(() => deadControls(page), { message: url, timeout: 15_000 }).toEqual([]);
  expect(await comingSoonOutsidePartTiles(page), url).toBe(0);

  // Every internal link opens a page that exists.
  const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute("href")!.split("#")[0]))]);
  for (const href of hrefs.filter((h) => !h.startsWith("/_next/"))) {
    const status = (await page.request.get(href, { maxRedirects: 5 })).status();
    expect(status, `${url}: link ${href}`).toBeLessThan(400);
  }

  // Every button does something when clicked, at desktop and at phone width (some controls only exist on one).
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
    await page.goto(url);
    await expect.poll(() => deadControls(page), { message: `${url} at ${width} px`, timeout: 15_000 }).toEqual([]);
    const count = await markButtons(page);
    const dead: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const problem = await probeButton(page, url, i);
      if (problem) dead.push(problem);
    }
    expect(dead, `${url} at ${width} px`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test.describe("no control that does nothing", () => {
  for (const url of MOCK_PAGES) {
    test(`mock: ${url}`, async ({ page }) => {
      await expectNoDeadControls(page, url);
    });
  }

  for (const url of REAL_PAGES) {
    test(`real: ${url}`, async ({ page }) => {
      test.skip(PREVIEW, "real pages refuse on a Preview with no variables");
      await expectNoDeadControls(page, url);
    });
  }

  test("the dashboard: no Search, Mock exam, notifications, Last 30 days or attempt menu; Part tiles keep 'Coming soon'", async ({ page }) => {
    await page.goto("/dashboard?mock=1");
    await expect(page.getByRole("heading", { name: "Exam parts" })).toBeVisible();
    for (const gone of [/search/i, /mock exam/i, /notifications/i, /last 30 days/i, /^options for/i, /^delete$/i, /report a wrong score/i]) {
      await expect(page.getByRole("button", { name: gone })).toHaveCount(0);
      await expect(page.getByRole("link", { name: gone })).toHaveCount(0);
    }
    await expect(page.getByText(/Search tasks and lessons/)).toHaveCount(0);
    // The honest status of the parts that are not live yet stays.
    await expect(page.getByTestId("part-tile").filter({ hasText: "Coming soon" })).toHaveCount(3);
    // The Lessons tab is a real link that keeps mock mode.
    await expect(page.getByRole("link", { name: "Lessons" })).toHaveAttribute("href", "/lessons?mock=1");
  });

  test("the Lessons tab opens the list, and each lesson opens from it", async ({ page }) => {
    await page.goto("/dashboard?mock=1");
    await page.getByRole("link", { name: "Lessons" }).click();
    await expect(page).toHaveURL(/\/lessons\?mock=1$/);
    await expect(page.getByRole("heading", { name: "Lessons", level: 1 })).toBeVisible();
    const links = page.getByTestId("lesson-link");
    await expect(links).toHaveCount(3);
    await links.filter({ hasText: "Answer every question" }).click();
    await expect(page).toHaveURL(/\/lessons\/l-t1\?mock=1$/);
    await expect(page.getByRole("heading", { name: "Answer every question" })).toBeVisible();
    await expect(page.getByText("Why this lesson")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Retry with this goal" })).toHaveCount(0);
    await expect(page.locator(":is(a, button).bg-primary.text-on-primary")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Go to Part 2" })).toHaveAttribute("href", "/practice?mock=1#part-2");
    await page.getByRole("link", { name: "Lessons", exact: true }).first().click();
    await expect(page).toHaveURL(/\/lessons\?mock=1$/);
  });

  test("a bare /result is not found; demo results still open", async ({ page }) => {
    test.skip(PREVIEW, "checked on next dev; the Preview runs the same page code");
    const bare = await page.goto("/result");
    expect(bare?.status()).toBe(404);
    await expect(page.getByText(/Part 2 · Band/)).toHaveCount(0);
    expect((await page.goto("/result?anchor=A2-b1-all-three"))?.status()).toBe(404);
    expect((await page.goto("/result?demo=demo-5&mock=1"))?.status()).toBe(200);
    await expect(page.getByText("Demo result. Your answer was not scored.")).toBeVisible();
    expect((await page.goto("/result?mock=1"))?.status()).toBe(200);
  });
});
