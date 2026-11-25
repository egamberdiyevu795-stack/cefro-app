import { expect, test, type Locator, type Page } from "@playwright/test";
import { runSql } from "./db";
import { shortPartIntros } from "./short-intro";

// The Part 2 / Part 3 spoken introductions are shortened (e2e/short-intro.ts).
test.beforeEach(async ({ context }) => {
  await shortPartIntros(context);
});

const TASK_URL = "/practice/speaking/b2-part2-advice-from-someone";
/** Black buttons and links (the goal bar's black check square is a glyph, not a button). */
const BLACK = ":is(a, button).bg-primary.text-on-primary";

/** "YYYY-MM-DD", `days` from today in Uzbekistan (the app's calendar). */
function dayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const shown = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(2, 4)}`;

async function recordAnswer(page: Page) {
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / })).toBeVisible({ timeout: 60_000 });
}

/** Black buttons in the page content (the active nav square is in the nav, outside <main>). */
const blacks = (page: Page) => page.getByRole("main").locator(BLACK);

/** Parts with no task yet: "Coming soon", no link. Part 2 (the third tile) keeps its link. */
async function expectComingSoonTiles(page: Page) {
  const tiles = page.getByTestId("part-tile");
  await expect(tiles).toHaveCount(4);
  for (const i of [0, 1, 3]) {
    await expect(tiles.nth(i)).toContainText("Coming soon");
    await expect(tiles.nth(i).getByRole("link")).toHaveCount(0);
    await expect(tiles.nth(i)).not.toContainText("Start");
  }
  await expect(tiles.nth(2).getByRole("link")).toHaveAttribute("href", "/practice#part-2");
}

/** A tap area at least 36 px high (like Save). */
async function expectTapHeight(control: Locator) {
  const box = await control.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
}

/** At 390 px: no horizontal scroll, no visible text under 11 px, exactly one black button. Back to desktop after. */
async function auditPhone(page: Page) {
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const smallest = await page.evaluate(() => {
    let min = Infinity;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // not rendered (e.g. the desktop-only copy)
      min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
    }
    return min;
  });
  expect(Number.isFinite(smallest)).toBe(true); // text was found and measured
  expect(smallest).toBeGreaterThanOrEqual(11);
  await expect(blacks(page)).toHaveCount(1);
  if (desktop) await page.setViewportSize(desktop);
}

/** Record an answer and leave it unscored (marked failed in the database, as if scoring had failed). */
async function recordFailedAnswer(page: Page) {
  await page.goto(TASK_URL);
  await page.getByRole("button", { name: "Start preparation" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await page.waitForURL(/\/result\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: /^Part 2 · Band [0-5] · / })).toBeVisible({ timeout: 60_000 }); // let scoring settle first
  expect(await runSql("UPDATE speaking_attempts SET status = 'failed', failure_stage = 'evaluation', failure_code = 'evaluation_failed' WHERE id = ?", [id])).toBe(1);
}

test("new student: the first visit, with the exam date question; saving a date shows the countdown", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(blacks(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Start your first practice" })).toBeVisible();
  await expectComingSoonTiles(page);
  await expect(page.getByTestId("part-tile").nth(2).getByRole("link")).toHaveText("Start");
  // The empty Speaking progress card: the skills map is visible before the first practice, with no level in it.
  const preview = page.getByTestId("progress-preview");
  await expect(preview.getByRole("heading", { name: "Speaking progress" })).toBeVisible();
  await expect(preview.getByText("Answer 1 task to unlock your skills map")).toBeVisible();
  await expect(preview.getByRole("img", { name: /empty until your first scored answer/ }).first()).toBeAttached();
  await expect(page.getByTestId("current-level")).toHaveCount(0);
  // The returning layout's other cards, in their places, saying what will appear in them.
  await expect(page.getByRole("region", { name: "Recent attempts" })).toContainText("No attempts yet");
  await expect(page.getByTestId("fix-preview")).toContainText("After your first answer");
  await auditPhone(page);

  // The Part 2 tile opens the Part 2 task list with all its tasks.
  await page.getByTestId("part-tile").nth(2).getByRole("link").click();
  await expect(page).toHaveURL(/\/practice#part-2$/);
  const part2 = page.getByRole("region", { name: "Part 2 · Long turn" });
  await expect(part2).toBeVisible();
  // Since the task-list restyle every task is one row linked by its title, in the task list's order.
  const part2Tasks = ["Advice from someone", "An important decision", "A goal you set", "Working in a team", "Trying and failing", "A tradition", "A happy day"];
  const rows = part2.getByTestId("task-link");
  await expect(rows).toHaveCount(part2Tasks.length);
  for (const [i, title] of part2Tasks.entries()) {
    await expect(rows.nth(i)).toContainText(title);
    await expect(part2.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", /^\/practice\/speaking\/b2-part2-/);
  }
  await page.goto("/dashboard");

  // A date in the past can't be saved.
  const picker = page.getByLabel("When is your exam?");
  await picker.fill(dayFromToday(-3));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose today or a later date.");

  const exam = dayFromToday(23);
  await picker.fill(exam);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days");
  await expect(page.getByText(shown(exam))).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 23 days"); // stored, not just on screen
  await expect(blacks(page)).toHaveCount(1);
  await auditPhone(page);
});

test("Skip: the question is not asked again, but a small 'Add exam date' opens the picker; Remove date goes back to it", async ({ page }) => {
  await page.goto("/dashboard");
  await expectTapHeight(page.getByRole("button", { name: "Skip" }));
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByLabel("When is your exam?")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(page.getByLabel("When is your exam?")).toHaveCount(0);

  // After Skip: "Add exam date", secondary (not the black button), with a 36 px tap area.
  const add = page.getByRole("button", { name: "Add exam date" });
  await expect(add).toBeVisible();
  await expect(add).not.toHaveClass(/bg-primary/);
  await expectTapHeight(add);
  await expect(blacks(page)).toHaveCount(1);
  await auditPhone(page);

  // It opens the same picker; Cancel closes it without saving.
  await add.click();
  await expect(page.getByLabel("When is your exam?")).toBeVisible();
  await expectTapHeight(page.getByRole("button", { name: "Cancel" }));
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(add).toBeVisible();
  await add.click();
  await page.getByLabel("When is your exam?").fill(dayFromToday(40));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 40 days");

  // Edit (36 px) → Remove date clears it, back to "Add exam date", stored.
  const edit = page.getByRole("button", { name: "Edit exam date" });
  await expectTapHeight(edit);
  await edit.click();
  const remove = page.getByRole("button", { name: "Remove date" });
  await expectTapHeight(remove);
  await remove.click();
  await expect(page.getByTestId("exam-countdown")).toHaveCount(0);
  await expect(add).toBeVisible();
  await page.reload();
  await expect(add).toBeVisible();
  await expect(page.getByTestId("exam-countdown")).toHaveCount(0);
});

test("a saved date that has passed: no countdown, 'When is your next exam?', and a new date can be saved", async ({ page }) => {
  await page.goto("/dashboard");
  const marker = dayFromToday(611); // a date no other test uses, to find this browser's user
  await page.getByLabel("When is your exam?").fill(marker);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toBeVisible();

  // The app never saves a past date, so the exam is moved into the past in the database, as time would.
  const passed = dayFromToday(-2);
  expect(await runSql("UPDATE users SET exam_date = ? WHERE exam_date = ?", [passed, marker])).toBe(1);
  await page.reload();
  await expect(page.getByTestId("exam-countdown")).toHaveCount(0);
  await expect(page.getByLabel("When is your next exam?")).toBeVisible();
  await expect(page.getByText(`Your exam date, ${shown(passed)}, has passed.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove date" })).toHaveCount(0);
  await expect(blacks(page)).toHaveCount(1);
  await auditPhone(page);

  await page.getByLabel("When is your next exam?").fill(dayFromToday(14));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 14 days");
});

test("slow connection: the date picker and Save wait until the page is ready, and a date picked then is saved", async ({ page }) => {
  await page.goto("/dashboard"); // compiled once, so only the delay below is slow
  // Slow connection: the HTML arrives, the page's scripts are held back until the test lets them through (a fixed delay
  // raced the checks below on a slow machine: the page could become ready before the last "disabled" check ran).
  let delayed = 0;
  let releaseScripts!: () => void;
  const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    delayed += 1;
    await scriptsHeld;
    await route.continue();
  });
  const navigations: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  });
  // "commit": return when the response starts, not when the held scripts have loaded ("domcontentloaded" waits for them).
  await page.goto("/dashboard", { waitUntil: "commit" });

  // Before the scripts run: shown, but nothing can be picked or sent (no plain form submit, no value React misses).
  const picker = page.getByLabel("When is your exam?");
  await expect(picker).toBeVisible();
  await expect(picker).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Skip" })).toBeDisabled();
  expect(delayed).toBeGreaterThan(0);
  releaseScripts();

  // As soon as the page is ready the controls work, and the date picked is the date saved.
  const exam = dayFromToday(57);
  await expect(picker).toBeEnabled({ timeout: 30_000 });
  await picker.fill(exam);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 57 days");
  await expect(page.getByText(shown(exam))).toBeVisible();
  expect(navigations).toHaveLength(1); // only the first load: Save never reloaded the page
  await page.unroute("**/_next/static/chunks/**");
  await page.reload();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 57 days"); // stored
});

test("attempts that are not scored: no first-visit screen; Recent attempts and 'Start practice', no level yet", async ({ page }) => {
  await recordFailedAnswer(page);
  await page.goto("/dashboard");
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByText("Welcome to CEFRO")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start your first practice" })).toHaveCount(0);
  await expect(blacks(page)).toHaveCount(1);
  await expect(blacks(page)).toHaveText("Start practice");
  const recent = page.getByRole("region", { name: "Recent attempts" });
  await expect(recent.getByRole("link", { name: /Advice from someone/ })).toHaveCount(1);
  await expect(page.getByTestId("progress-preview")).toBeVisible(); // the empty card, not the real one
  await expect(page.getByTestId("current-level")).toHaveCount(0);
  await expect(page.getByTestId("fix-preview")).toBeVisible(); // the empty Biggest fix, not a real one
  await expect(page.getByTestId("still-in")).toHaveCount(0);
  await expectComingSoonTiles(page);
  await auditPhone(page);
});

test("after answers: real level, skills, Practise next, exam parts, biggest fix and recent attempts; Edit the exam date", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await recordAnswer(page);
  await page.goto("/dashboard");

  // Level from the one scored answer.
  await expect(page.getByTestId("current-level")).toHaveText(/^(Below B1|B1|B2|Above B2)$/);
  await expect(page.getByTestId("level-basis").first()).toHaveText("Based on your last answer");
  await expect(page.getByText(/^\d of [45] skills at B2$/)).toBeVisible();
  await expect(page.getByText(/^Up from/)).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Your level in each skill" })).toBeVisible();

  // Exam parts: Part 2 has a band, the others say Start.
  const tiles = page.getByTestId("part-tile");
  await expect(tiles.nth(2)).toContainText(/Band [0-5]/);
  await expect(tiles.nth(2).getByRole("link")).toHaveText("Practise");
  // The Part 2 tile opens the Part 2 task list, where the student picks a task.
  await expect(tiles.nth(2).getByRole("link")).toHaveAttribute("href", "/practice#part-2");
  await expectComingSoonTiles(page);

  // Biggest fix from that answer; with one answer there is nothing to compare ("Still in" hidden).
  const fix = page.getByRole("region", { name: "Biggest fix" });
  await expect(fix.getByRole("link", { name: "Start retry" })).toHaveAttribute("href", /\?retry=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("still-in")).toHaveCount(0);

  // Practise next: the one black button, on the next task not practised yet (Advice from someone was just answered).
  await expect(blacks(page)).toHaveCount(1);
  const next = page.getByRole("region", { name: "An important decision" });
  await expect(next).toContainText("Practise next");
  await expect(next).toContainText("Not practised yet");
  await expect(next.locator(BLACK)).toHaveAttribute("href", "/practice/speaking/b2-part2-important-decision");
  await expect(next.locator(BLACK)).toHaveText("Start");

  // The exam date question is on the returning dashboard too.
  const exam = dayFromToday(10);
  await page.getByLabel("When is your exam?").fill(exam);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 10 days");
  await page.getByRole("button", { name: "Edit exam date" }).click();
  await page.getByLabel("Change your exam date").fill(dayFromToday(1));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("exam-countdown")).toHaveText("in 1 day");

  // Two more answers: based on the last 3, and "Still in" appears when the problem repeats.
  await recordAnswer(page);
  await recordAnswer(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("level-basis").first()).toHaveText("Based on your last 3 answers");
  await expect(page.getByRole("region", { name: "Recent attempts" }).getByRole("link", { name: /Advice from someone/ })).toHaveCount(3);
  await expect(blacks(page)).toHaveCount(1);
  // The same answer, three times: its biggest fix is still there in all three.
  const stillIn = page.getByTestId("still-in");
  await expect(stillIn).toBeVisible();
  await expect(stillIn).toContainText(/Still in [23] of your last 3 answers/);
  await expect(stillIn.getByRole("progressbar")).toBeVisible();

  // Another browser sees none of it.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/dashboard");
  await expect(otherPage.getByRole("heading", { name: "Find your level" })).toBeVisible();
  await expect(otherPage.getByTestId("exam-countdown")).toHaveCount(0);
  await other.close();

  // Phone: no horizontal scroll, no text under 11 px, one black button.
  await auditPhone(page);
  expect(errors).toEqual([]);
});
