import { expect, test, type Page } from "@playwright/test";

/*
 * Part 1.1 and 1.2 in mock mode (docs/part1-plan.md §1): introduction → questions one by one in one recording, paused
 * while each question and the chime play → demo Scoring… → result in the Part 2 style → retry with the goal. Nothing is
 * sent (no API call). The parts are not live (`PART_LIVE`): the real pages are 404 and the dashboard and home keep
 * saying "Coming soon". Timings are shortened with ?timeScale (mock mode only).
 */

const SCALE = 0.05;
const DEMO_MODE = "Demo mode. Your answer won't be scored.";

function watchApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/")) calls.push(url.pathname);
  });
  return calls;
}

async function blackControls(page: Page) {
  return page.locator("a, button").evaluateAll((els) =>
    els
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).backgroundColor === "rgb(21, 21, 23)";
      })
      .map((el) => el.textContent?.trim() ?? ""),
  );
}

/** At 390 px: no horizontal scroll, no visible text under 11 px, AA contrast on every visible text, the black controls. */
async function auditPhone(page: Page, black: string[]) {
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const { smallest, failures } = await page.evaluate(() => {
    const parse = (color: string) => {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const bgOf = (el: Element | null) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg.a > 0) return bg;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    let min = Infinity;
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, .sr-only")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      min = Math.min(min, size);
      const l1 = lum(parse(style.color)!);
      const l2 = lum(bgOf(el));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) bad.push(`${node.textContent.trim()} (${ratio.toFixed(2)}:1)`);
    }
    return { smallest: min, failures: bad };
  });
  expect(smallest).toBeGreaterThanOrEqual(11);
  expect(failures).toEqual([]);
  expect(await blackControls(page)).toEqual(black);
  if (desktop) await page.setViewportSize(desktop);
}

/** Runs the whole part: Start, then each question (recorder paused while it plays), until the demo result opens. */
async function runPart(page: Page, first: number, count = 3) {
  const card = page.getByTestId("part1-question");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < count; i++) {
    await expect(card).toHaveAttribute("data-question-index", String(i));
    await expect(page.getByTestId("question-counter")).toHaveText(`Question ${first + i} · ${i + 1} of ${count}`);
    // The question plays first: nothing is being recorded.
    const step = await card.getAttribute("data-step");
    if (step === "prompt" || step === "chime") expect(await card.getAttribute("data-recorder-state")).not.toBe("recording");
    await expect(card).toHaveAttribute("data-step", "speaking", { timeout: 15_000 });
    await expect(card).toHaveAttribute("data-recorder-state", "recording");
  }
  await expect(page).toHaveURL(/\/result\?/, { timeout: 20_000 });
}

test("Part 1.1 mock: brief → three questions in one recording → Scoring… → result (Part 1.1, A2 scale, no cohesion) → retry with the goal", async ({ page }) => {
  const api = watchApi(page);
  await page.goto(`/practice/speaking/a2-part1-1-daily-life?mock=1&timeScale=${SCALE}`);
  await expect(page.getByTestId("demo-label")).toHaveText(DEMO_MODE);
  await expect(page.getByText("Speaking · Part 1.1 · Practice")).toBeVisible();
  await expect(page.getByText("30 s each")).toBeVisible();
  await expect(page.getByText(/Headphones are recommended/)).toBeVisible();
  // The questions are not shown before they are asked.
  await expect(page.getByText("What is your favourite food? Why?")).toHaveCount(0);
  await auditPhone(page, ["Start"]);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("question-text")).toHaveText("What do you usually do at the weekend?");
  await auditPhone(page, []);
  await page.goto(`/practice/speaking/a2-part1-1-daily-life?mock=1&timeScale=${SCALE}`);
  await runPart(page, 1);

  await expect(page.getByRole("heading", { name: "Scoring…" })).toBeVisible();
  await expect(page.getByText("Part 1.1 ·", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Question 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Cohesion")).toHaveCount(0);
  await expect(page.getByText(/Answer question 3: /).first()).toBeVisible();
  await auditPhone(page, ["Retry with this goal"]);

  await page.getByRole("link", { name: "Retry with this goal" }).click();
  await expect(page.getByText("Speaking · Part 1.1 · Retry")).toBeVisible();
  await expect(page.getByTestId("goal-card")).toContainText("Answer question 3");
  await auditPhone(page, ["Start"]);
  await page.goto(`${page.url()}&timeScale=${SCALE}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("goal-card")).toContainText("Answer question 3");
  await page.goto(page.url());
  await runPart(page, 1);
  await expect(page.getByText(/Goal met|Not yet/).first()).toBeVisible({ timeout: 20_000 });
  expect(api).toEqual([]);
});

test("Part 1.2 mock: pictures from Question 4, questions 4–6, 'compare the two pictures' on the result", async ({ page }) => {
  const api = watchApi(page);
  await page.goto(`/practice/speaking/b1-part1-2-shopping?mock=1&timeScale=${SCALE}`);
  await expect(page.getByText("Speaking · Part 1.2 · Practice")).toBeVisible();
  await expect(page.getByText("45 · 30 · 30 s")).toBeVisible();
  await expect(page.getByTestId("part1-pictures")).toHaveCount(0);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("part1-pictures")).toBeVisible();
  await expect(page.getByTestId("part1-pictures").getByRole("img")).toHaveCount(2);
  await auditPhone(page, []);
  await page.goto(`/practice/speaking/b1-part1-2-shopping?mock=1&timeScale=${SCALE}`);
  await runPart(page, 4);
  await expect(page.getByText("Part 1.2 ·", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Question 4", { exact: true })).toBeVisible();
  await expect(page.getByText(/compare the two pictures/).first()).toBeVisible();
  await expect(page.getByText("Cohesion")).toBeVisible();
  await auditPhone(page, ["Retry with this goal"]);
  expect(api).toEqual([]);
});

test("a question audio that fails still plays the chime and starts the countdown", async ({ page }) => {
  await page.route("**/a2-part1-1-daily-life/v1/q2.wav", (route) => route.abort());
  await page.goto(`/practice/speaking/a2-part1-1-daily-life?mock=1&timeScale=${SCALE}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = page.getByTestId("part1-question");
  await expect(card).toHaveAttribute("data-question-index", "1", { timeout: 15_000 });
  await expect(page.getByTestId("audio-failed-note")).toBeVisible();
  await expect(card).toHaveAttribute("data-step", "speaking", { timeout: 15_000 });
});

test("Part 1 is not live: real pages are 404, the dashboard and home still say Coming soon", async ({ page }) => {
  for (const id of ["a2-part1-1-daily-life", "b1-part1-2-shopping"]) {
    const response = await page.goto(`/practice/speaking/${id}`);
    expect(response?.status()).toBe(404);
  }
  await page.goto("/dashboard?mock=1");
  for (const part of ["Part 1.1", "Part 1.2"]) {
    const tile = page.getByRole("listitem").filter({ hasText: part }).first();
    await expect(tile).toContainText("Coming soon");
  }
  await page.goto("/?mock=1");
  await expect(page.getByText("Part 1 · A1–B1").locator("..")).toContainText("Coming soon");
});
