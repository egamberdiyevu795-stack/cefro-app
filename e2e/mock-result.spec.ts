import { expect, test } from "@playwright/test";
import { audit } from "./audit";

/*
 * The mock result page and History for mocks in MOCK MODE (docs/v1-plan.md, step 4), at 390 px and at laptop width. Demo answers go
 * through the real evaluator types (server/demo/demo-mock.ts), so these pages are the real components on real result shapes. Every
 * screen: at most one black button, no text under 11 px, AA contrast, no horizontal scroll; never a score, Passed / Failed or
 * "certificate level". Nothing is sent: no /api call. (The real route, owner checks and polling are in app/api/mock-result.test.ts.)
 */
const RESULT = "/practice/mock/demo-mock?mock=1";
const LINE = "Speaking only. An estimate from this mock, not an official UZBMB score.";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  page.on("request", (r) => {
    expect(new URL(r.url()).pathname.startsWith("/api/"), `no API call: ${r.url()}`).toBe(false);
  });
});

async function noForbiddenWords(page: import("@playwright/test").Page) {
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/\bpassed\b|\bfailed\b|certificate/i);
  expect(text).not.toMatch(/\b\d{1,3}\s?\/\s?(30|120)\b/); // the official 0-75 score is allowed on the full mock only
  expect(text).not.toMatch(/\b\d{1,3}\s?points?\b/i);
}

test("the mock result at 390 px: level, the exact line, a row per part, the biggest fix", async ({ page }) => {
  await page.goto(RESULT);
  await expect(page.getByRole("heading", { name: "Your estimated speaking level" })).toBeVisible();
  await expect(page.getByTestId("demo-label")).toBeVisible();
  await expect(page.getByTestId("level-cefro")).toHaveText(/^CEFRO: (B1|B2|C1|Below B1)$/);
  await expect(page.getByTestId("level-teacher")).toHaveCount(0); // nobody rated: nothing about a teacher
  await expect(page.getByTestId("mock-line")).toHaveText(LINE);

  const rows = page.getByTestId("mock-parts").getByRole("listitem");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Part 1.1");
  await expect(rows.nth(3)).toContainText("Part 3");
  await expect(page.getByTestId("part-level")).toHaveCount(4);
  await expect(page.getByTestId("part-details").first()).toHaveAttribute("href", /mock=1/);

  const fix = page.getByTestId("mock-fix");
  await expect(fix.getByRole("link", { name: "Retry with this goal" })).toHaveAttribute("href", /mock=1&retry=/);
  await audit(page, 1);
  await noForbiddenWords(page);

  // "See details" opens the part's own demo result.
  await page.getByTestId("part-details").nth(2).click();
  await expect(page.getByRole("heading", { name: /^Part 2 · / })).toBeVisible({ timeout: 20_000 });
});

test("two levels side by side: 'CEFRO: B1' and 'Your teacher: B2' with their /75 scores, next to each other", async ({ page }) => {
  await page.goto(`${RESULT}&teacher=1`);
  const ours = page.getByTestId("level-cefro");
  const theirs = page.getByTestId("level-teacher");
  await expect(ours).toHaveText("CEFRO: B1"); // demo bands 3+3+3+4 = raw 13 -> 49 / 75 (official table)
  await expect(theirs).toHaveText("Your teacher: B2");
  await expect(page.getByTestId("level-cefro-score")).toHaveText("Speaking: 49 / 75");
  await expect(page.getByTestId("level-teacher-score")).toHaveText("Speaking: 51 / 75"); // the demo teacher gives Part 2 one band more
  const [a, b] = [await ours.boundingBox(), await theirs.boundingBox()];
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(8); // the same line
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1); // beside, never on top
  await expect(page.getByTestId("part-teacher")).toHaveCount(4); // the demo teacher rated every part
  await audit(page, 1);
  await noForbiddenWords(page);
});

test("while parts are still scoring: 'Mock submitted', '2 of 4 parts scored', no guessed level, no black button", async ({ page }) => {
  await page.goto(`${RESULT}&state=scoring`);
  await expect(page.getByTestId("mock-waiting")).toContainText("Mock submitted");
  await expect(page.getByTestId("mock-progress-text")).toHaveText("2 of 4 parts scored");
  await expect(page.getByTestId("mock-not-ready")).toContainText("Part 2 is still being scored");
  await expect(page.getByTestId("level-cefro")).toHaveCount(0); // no estimate card, no guessed level
  const statuses = page.getByTestId("part-status");
  await expect(statuses).toHaveText(["Scoring Part 2…", "Scoring Part 3…"]);
  await expect(page.getByTestId("part-level")).toHaveCount(2); // Parts 1.1 and 1.2 already filled in
  await expect(page.getByTestId("mock-read-now")).toContainText("read your Part 1.2 feedback");
  await expect(page.getByTestId("mock-fix")).toContainText("appears when every part is scored");
  await expect(page.getByTestId("mock-line")).toHaveText(LINE);
  await audit(page, 0); // nothing to do yet: "Back to Practice" is quiet until the result is in
  await noForbiddenWords(page);
});

test("a mock that was not finished says so and keeps the parts it has; a part with no AI band says 'AI score not ready yet'", async ({ page }) => {
  await page.goto(`${RESULT}&state=unfinished`);
  await expect(page.getByTestId("mock-not-finished")).toContainText("Not finished");
  await expect(page.getByTestId("part-level")).toHaveCount(2);
  await expect(page.getByTestId("part-status")).toHaveText(["Not done", "Not done"]);
  await expect(page.getByTestId("level-cefro")).toHaveText("CEFRO: Estimate not ready yet");
  await audit(page, 1);
  await noForbiddenWords(page);

  await page.goto(`${RESULT}&state=pending`);
  await expect(page.getByTestId("part-status")).toHaveText(["AI score not ready yet"]);
  await expect(page.getByTestId("mock-not-ready")).toContainText("Part 3 has no AI score yet");
  await audit(page, 1);
});

test("an unknown mock id in mock mode is a 404", async ({ page }) => {
  expect((await page.goto("/practice/mock/not-a-mock?mock=1"))?.status()).toBe(404);
});

test("History: a mock is one row opening the mock result; the pills include Mock exams", async ({ page }) => {
  await page.goto("/history?mock=1");
  const mockRow = page.getByTestId("history-mock");
  await expect(mockRow).toHaveCount(1);
  await expect(mockRow).toContainText(/^Mock exam · (B1|B2|C1|Below B1) · \d\d\.\d\d\.\d\d/);
  const pills = page.getByRole("navigation", { name: "Filter by part" }).getByRole("link");
  // Every chip carries its count, so the row reads as a filter and not as a label.
  await expect(pills).toHaveText([/^All ?\d+$/, /^Mock exams ?\d+$/, /^Part 1\.1 ?\d+$/, /^Part 1\.2 ?\d+$/, /^Part 2 ?\d+$/, /^Part 3 ?\d+$/]);
  await audit(page, 0);
  await noForbiddenWords(page);

  // Mock exams: that row only.
  await pills.nth(1).click();
  await expect(page).toHaveURL(/part=mock/);
  await expect(page.getByTestId("history-mock")).toHaveCount(1);
  await expect(page.getByText("1 mock exam")).toBeVisible();

  // A part's own filter lists its attempts, the mock's part marked, opening that part's demo result.
  await page.goto("/history?mock=1&part=2");
  const fromMock = page.getByRole("link", { name: /Part 2 · Mock exam/ });
  await expect(fromMock).toHaveCount(1);
  await expect(fromMock).toHaveAttribute("href", /\/result\?demo=answer\.b2-part2-a-tradition&mock=1/);

  // The mock row opens the mock result.
  await page.goto("/history?mock=1");
  await page.getByTestId("history-mock").getByRole("link").click();
  await expect(page).toHaveURL(/\/practice\/mock\/demo-mock\?mock=1/);
  await expect(page.getByRole("heading", { name: "Your estimated speaking level" })).toBeVisible();
});

test.describe("at laptop width", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the result is two columns that fit, with one black button", async ({ page }) => {
    await page.goto(`${RESULT}&teacher=1`);
    await expect(page.getByTestId("level-cefro")).toBeVisible();
    const [level, fix] = [await page.getByTestId("mock-level").boundingBox(), await page.getByTestId("mock-fix").boundingBox()];
    expect(fix!.x).toBeGreaterThan(level!.x + level!.width - 1); // the fix sits beside the level and the rows
    await expect(page.getByTestId("part-details").first().getByText("See details")).toBeVisible();
    await audit(page, 1);
    await noForbiddenWords(page);
    await page.goto(`${RESULT}&state=scoring`);
    await expect(page.getByTestId("mock-waiting")).toBeVisible();
    await audit(page, 0); // still waiting: nothing is black
  });

  test("History shows the mock row and the pills without horizontal scroll", async ({ page }) => {
    await page.goto("/history?mock=1");
    await expect(page.getByTestId("history-mock")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Mock exams/ })).toBeVisible();
    await audit(page, 0);
  });
});

test("the dashboard's Recent attempts shows the mock as one row opening the mock result", async ({ page }) => {
  await page.goto("/dashboard?mock=1");
  const recent = page.getByRole("region", { name: "Recent attempts" });
  const row = recent.getByRole("link", { name: /^Mock exam · (B1|B2|C1|Below B1) · \d\d\.\d\d\.\d\d/ });
  await expect(row).toHaveCount(1);
  await expect(recent.getByRole("link", { name: /Part 3/ })).toHaveCount(0); // its parts are not listed loose
  await row.click();
  await expect(page).toHaveURL(/\/practice\/mock\/demo-mock\?mock=1/);
  await expect(page.getByRole("heading", { name: "Your estimated speaking level" })).toBeVisible();
});
