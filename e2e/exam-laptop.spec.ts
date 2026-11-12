import { expect, test, type Page } from "@playwright/test";
import { audit, BLACK } from "./audit";
import { shortPartIntros } from "./short-intro";

/*
 * Exam laptop mode in MOCK MODE (docs/v1-plan.md, step 7), at laptop width (1280 px) first and at 390 px: the class page's one
 * black "Start exam laptop" and its "Class mocks" list, choosing the paper, T7 (the list, the PIN pad, "Hi …", the whole mock,
 * "Done. Your results will be on your phone.", back to the list), two students in a row, the 5-wrong-PIN lock and its password-
 * gated unlock, End exam laptop, T8 (results, sort, "Open first unrated", Listen), "In class" / "At home", the Share screen's PIN
 * and Account's Set PIN. Nothing is sent: no /api call at all. The real two-laptop test is e2e/exam-laptop-real.spec.ts.
 */

const SCALE = 0.05;
const CLASS = "/teacher/classes/demo-class";
const LAPTOP = `${CLASS}/exam/demo-class-mock/laptop?mock=1&as=teacher&room=Room%201&timeScale=${SCALE}`;

test.beforeEach(async ({ page }) => {
  await shortPartIntros(page);
  // Part 1's spoken introduction is ~17 s of real audio: serve Question 1's short file instead (as the other mock specs do).
  await page.route("**/v1/intro.wav", async (route) => {
    const url = route.request().url().replace("/intro.wav", "/q1.wav").replace("/b1-part1-2-shopping/v1/q1.wav", "/b1-part1-2-shopping/v1/q4.wav");
    await route.fulfill({ response: await route.fetch({ url }) });
  });
});

function watchApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(url.pathname);
  });
  return calls;
}

/** The whole demo mock on the laptop, from "Before you start" to the end screen (nothing is sent). */
async function playMock(page: Page) {
  const progress = page.getByTestId("mock-progress");
  await page.getByRole("button", { name: "Start mock" }).click();
  await expect(progress).toContainText("Part 1 of 4");
  await expect(progress).toContainText("Part 2 of 4", { timeout: 90_000 });
  await expect(progress).toContainText("Part 3 of 4", { timeout: 60_000 });
  const skipPrep = page.getByRole("button", { name: "Start speaking now" });
  await expect(skipPrep).toBeVisible({ timeout: 30_000 });
  await skipPrep.click();
  const finish = page.getByRole("button", { name: "Finish", exact: true });
  await expect(finish).toBeEnabled();
  await page.waitForTimeout(400);
  await finish.click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(progress).toContainText("Part 4 of 4");
  await expect(page.getByRole("button", { name: "Start speaking now" })).toBeVisible({ timeout: 30_000 });
  for (const label of [/^F1 /, /^F2 /, /^A1 /, /^A2 /]) await page.getByLabel(label).check();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(finish).toBeVisible();
  await page.waitForTimeout(800);
  await finish.click();
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page.getByTestId("laptop-done")).toBeVisible({ timeout: 30_000 });
}

async function typePin(page: Page, pin: string) {
  await page.getByTestId("pin-field").fill(pin);
}

test.describe("laptop width (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("T3: one black button, Start exam laptop; Copy join code is grey; Class mocks lists Mock 3 and opens T8", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto(`${CLASS}?mock=1&as=teacher`);
    await expect(page.getByRole("link", { name: "Start exam laptop" })).toBeVisible();
    await audit(page, 1);
    await expect(page.locator(BLACK)).toHaveText(/Start exam laptop/);
    await expect(page.getByRole("button", { name: "Copy join code" })).not.toHaveClass(/bg-primary/);
    const row = page.getByTestId("class-mock-row");
    await expect(row).toContainText("Mock 3");
    await expect(row).toContainText("2 of 6 finished");
    await row.click();
    await expect(page).toHaveURL(/\/exam\/demo-class-mock\?mock=1&as=teacher$/);
    expect(calls).toEqual([]);
  });

  test("Start exam laptop: same paper (four suggested tasks) or a different paper per student; one black button; opens T7", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto(`${CLASS}?mock=1&as=teacher`);
    await page.getByRole("link", { name: "Start exam laptop" }).click();
    await expect(page.getByRole("heading", { name: "Start exam laptop" })).toBeVisible();
    await expect(page.getByTestId("suggested-paper").getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("radio", { name: /Same paper for everyone/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /A different paper for each student/ })).toBeVisible();
    await audit(page, 1);
    await page.getByRole("radio", { name: /A different paper/ }).check();
    await expect(page.getByTestId("suggested-paper")).toHaveCount(0);
    await page.getByRole("radio", { name: /Same paper/ }).check();
    await page.getByLabel("Name of this laptop").fill("Room 2");
    await page.getByRole("button", { name: "Start exam laptop" }).click();
    await expect(page).toHaveURL(/\/exam\/demo-class-mock\/laptop\?room=Room\+2&mock=1&as=teacher/);
    await expect(page.getByTestId("laptop-room")).toContainText("Room 2");
    expect(calls).toEqual([]);
  });

  test("T7: class name, Tap your name, Not started / In progress (Room 2) / Done; no navigation out; no result or level on the screen", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto(LAPTOP);
    await expect(page.getByRole("heading", { name: "Tap your name" })).toBeVisible();
    await expect(page.getByTestId("laptop-room")).toContainText("Demo class");
    await expect(page.getByTestId("roster-not_started")).toContainText("Madina");
    await expect(page.getByTestId("roster-in_progress")).toContainText("In progress (Room 2)");
    await expect(page.getByTestId("roster-in_progress")).toContainText("Dilnoza");
    await expect(page.getByTestId("roster-done")).toContainText("Aziza");
    await expect(page.getByTestId("roster-done")).toContainText("Jasur");
    // Only students who can start are buttons; the others are plain text (in progress elsewhere, done, no PIN).
    await expect(page.getByTestId("roster-name")).toHaveCount(2); // Bekzod and Madina
    await expect(page.getByTestId("roster-name-fixed").filter({ hasText: "No PIN yet" })).toContainText("Sardor");
    // Nothing leads out to the teacher's pages (the wordmark is not a link), and no result is shown to the next student.
    await expect(page.locator("a[href]")).toHaveCount(0);
    await expect(page.getByTestId("exam-laptop")).not.toContainText(/Band \d|\bB1\b|\bB2\b|\bC1\b|Below B1/);
    await audit(page, 0);
    expect(calls).toEqual([]);
  });

  test("two students in a row on one laptop: PIN, Hi, the whole mock, Done, back to the list, then the next student", async ({ page }) => {
    test.setTimeout(240_000);
    const calls = watchApi(page);
    await page.goto(LAPTOP);

    // Student 1: Madina.
    await page.getByTestId("roster-name").filter({ hasText: "Madina" }).click();
    await expect(page.getByTestId("pin-pad")).toBeVisible();
    await expect(page.getByTestId("pin-continue")).toBeDisabled();
    await audit(page, 1);
    // A wrong PIN says so and counts; the right one opens "Hi Madina".
    await typePin(page, "0000");
    await page.getByTestId("pin-continue").click();
    await expect(page.getByTestId("pin-problem")).toContainText("That PIN isn't right. 4 tries left.");
    await page.getByRole("button", { name: "7" }).click(); // the keys work too
    await page.getByRole("button", { name: "Delete" }).click();
    await typePin(page, "1234");
    await page.getByTestId("pin-continue").click();
    await expect(page.getByRole("heading", { name: "Hi Madina, this mock is saved to your account" })).toBeVisible();
    await audit(page, 1);
    await playMock(page);
    await expect(page.getByRole("heading", { name: "Done." })).toBeVisible();
    await expect(page.getByText("Your results will be on your phone.")).toBeVisible();
    await audit(page, 1);
    await expect(page.getByTestId("exam-laptop")).not.toContainText(/Band \d|Your estimated|Below B1/);

    // Back to the list: Madina is Done and can't be picked again; the next student starts from the list.
    await page.getByRole("button", { name: "Back to the list" }).click();
    await expect(page.getByRole("heading", { name: "Tap your name" })).toBeVisible();
    await expect(page.getByTestId("roster-done")).toContainText("Madina");
    await expect(page.getByTestId("roster-name").filter({ hasText: "Madina" })).toHaveCount(0);

    // Student 2: Bekzod, with his own PIN pad and his own greeting.
    await page.getByTestId("roster-name").filter({ hasText: "Bekzod" }).click();
    await typePin(page, "1234");
    await page.getByTestId("pin-continue").click();
    await expect(page.getByRole("heading", { name: "Hi Bekzod, this mock is saved to your account" })).toBeVisible();
    await expect(page.getByText("Madina")).toHaveCount(0);
    await playMock(page);
    await page.getByRole("button", { name: "Back to the list" }).click();
    await expect(page.getByTestId("roster-done")).toContainText("Bekzod");
    await expect(page.getByTestId("roster-done")).toContainText("Madina");
    expect(calls).toEqual([]);
  });

  test("5 wrong PINs lock the student on this laptop; Teacher options needs a password; Unlock; End exam laptop leaves for the class page", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto(LAPTOP);
    await page.getByTestId("roster-name").filter({ hasText: "Bekzod" }).click();
    for (let left = 4; left >= 1; left--) {
      await typePin(page, "9999");
      await page.getByTestId("pin-continue").click();
      await expect(page.getByTestId("pin-problem")).toContainText(`${left} ${left === 1 ? "try" : "tries"} left`);
    }
    await typePin(page, "9999");
    await page.getByTestId("pin-continue").click();
    // The fifth wrong PIN sends the student back to the list, where their name is no longer a button.
    await expect(page.getByRole("heading", { name: "Tap your name" })).toBeVisible();
    await expect(page.getByTestId("roster-name-fixed").filter({ hasText: "Bekzod" })).toContainText("Locked. Ask your teacher.");
    await expect(page.getByTestId("roster-name").filter({ hasText: "Bekzod" })).toHaveCount(0);
    await audit(page, 0);

    // Teacher options: a password is needed for every action.
    await page.getByTestId("teacher-options-open").click();
    await expect(page.getByRole("button", { name: "Unlock Bekzod" })).toBeVisible();
    await page.getByRole("button", { name: "Unlock Bekzod" }).click();
    await expect(page.getByTestId("teacher-options-message")).toHaveText("Enter your password.");
    await page.getByTestId("teacher-password").fill("my password");
    await audit(page, 0);
    await page.getByRole("button", { name: "Unlock Bekzod" }).click();
    await expect(page.getByTestId("teacher-options-message")).toContainText("Bekzod is unlocked.");
    await expect(page.getByTestId("roster-name").filter({ hasText: "Bekzod" })).toBeVisible();

    await page.getByTestId("teacher-password").fill("my password");
    await page.getByTestId("end-laptop").click();
    await expect(page).toHaveURL(/\/teacher\/classes\/demo-class\?mock=1&as=teacher$/);
    expect(calls).toEqual([]);
  });

  test("End and close the class mock opens its results (T8)", async ({ page }) => {
    await page.goto(LAPTOP);
    await page.getByTestId("teacher-options-open").click();
    await page.getByTestId("teacher-password").fill("my password");
    await page.getByTestId("end-class-mock").click();
    await expect(page).toHaveURL(/\/exam\/demo-class-mock\?mock=1&as=teacher$/);
    await expect(page.getByTestId("class-mock-results")).toBeVisible();
  });

  test("T8: one row per student, sorted by level, bands, Listen opens T6, the one black button is Open first unrated", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto(`${CLASS}/exam/demo-class-mock?mock=1&as=teacher`);
    await expect(page.getByRole("heading", { name: /^Mock 3 · \d\d\.\d\d\.\d\d$/ })).toBeVisible();
    await expect(page.getByTestId("results-summary")).toHaveText("2 of 6 finished");
    const rows = page.getByTestId("result-row");
    await expect(rows).toHaveCount(6);
    // Finished students first, highest level first; then the rest by name.
    const levels = await page.getByTestId("result-level").allTextContents();
    expect(levels.slice(2)).toEqual(["Not started", "Not started", "Not started", "Not started"]);
    for (const level of levels.slice(0, 2)) expect(level).toMatch(/^(Below B1|B1|B2|C1|Estimate not ready yet)$/);
    await expect(rows.filter({ hasText: "Bekzod" })).toContainText("Not started"); // his mock was at home: not part of this class mock
    await expect(rows.first().getByRole("list", { name: /part bands/ }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByTestId("common-problems")).toBeVisible();
    await audit(page, 1);
    await expect(page.locator(BLACK)).toHaveText(/Open first unrated/);

    // Sort flips; the black button opens the first unrated student's mock (T6); Listen opens a row's own.
    await expect(page.getByTestId("sort-toggle")).toContainText("highest first");
    await page.getByTestId("sort-toggle").click();
    await expect(page.getByTestId("sort-toggle")).toContainText("lowest first");
    await page.getByRole("link", { name: /^Listen: / }).first().click();
    await expect(page).toHaveURL(/\/mocks\/(aziza|jasur)-mock\?mock=1&as=teacher$/);
    await expect(page.getByTestId("mock-place")).toHaveText("In class");
    await page.goBack();
    await page.locator(BLACK).click();
    await expect(page).toHaveURL(/\/mocks\/(aziza|jasur)-mock\?mock=1&as=teacher$/);
    expect(calls).toEqual([]);
  });

  test("In class on the laptop mock and At home on a home mock, on the teacher's pages", async ({ page }) => {
    await page.goto(`${CLASS}/mocks/aziza-mock?mock=1&as=teacher`);
    await expect(page.getByTestId("mock-place")).toHaveText("In class");
    await page.goto(`${CLASS}/mocks/bekzod-mock?mock=1&as=teacher`);
    await expect(page.getByTestId("mock-place")).toHaveText("At home");
    await page.goto(`${CLASS}/students/s1?mock=1&as=teacher`);
    await expect(page.getByTestId("student-mocks")).toContainText("In class");
    await page.goto(`${CLASS}/students/s2?mock=1&as=teacher`);
    await expect(page.getByTestId("student-mocks")).toContainText("At home");
  });
});

test.describe("phone width (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("T3, Start, T7 list, PIN pad, T8 and T6 keep one black button at most, no text under 11 px, AA contrast, no horizontal scroll", async ({ page }) => {
    await page.goto(`${CLASS}?mock=1&as=teacher`);
    await audit(page, 1);
    await page.goto(`${CLASS}/exam?mock=1&as=teacher`);
    await audit(page, 1);
    await page.goto(LAPTOP);
    await expect(page.getByRole("heading", { name: "Tap your name" })).toBeVisible();
    await audit(page, 0);
    await page.getByTestId("roster-name").first().click();
    await expect(page.getByTestId("pin-pad")).toBeVisible();
    await audit(page, 1);
    await page.getByTestId("pin-pad").getByRole("button", { name: "Back to the list" }).click();
    await page.getByTestId("teacher-options-open").click();
    await audit(page, 0);
    await page.goto(`${CLASS}/exam/demo-class-mock?mock=1&as=teacher`);
    await audit(page, 1);
    await page.goto(`${CLASS}/mocks/aziza-mock?mock=1&as=teacher`);
    await audit(page, 0);
  });

  test("the whole exam laptop screen fits at 390 px while a student takes the mock (Hi screen and first part)", async ({ page }) => {
    await page.goto(LAPTOP);
    await page.getByTestId("roster-name").filter({ hasText: "Madina" }).click();
    await typePin(page, "1234");
    await page.getByTestId("pin-continue").click();
    await expect(page.getByRole("heading", { name: "Hi Madina, this mock is saved to your account" })).toBeVisible();
    await audit(page, 1);
    await page.getByRole("button", { name: "Start mock" }).click();
    await expect(page.getByTestId("question-counter")).toBeVisible({ timeout: 30_000 });
    await audit(page, 0);
  });
});

test.describe("the student's side: Share screen and Account", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Share asks for a 4-digit class PIN (kept hidden) before it shares; Account > Your classes has Set PIN", async ({ page }) => {
    const calls = watchApi(page);
    await page.goto("/profile/classes/join?mock=1&code=DEMO42");
    const pin = page.getByTestId("class-pin");
    await expect(pin).toBeVisible();
    await expect(pin).toHaveAttribute("type", "password");
    await expect(page.getByText("Your teacher can’t see it", { exact: false })).toBeVisible();
    await audit(page, 1);
    // Without a PIN nothing is shared; letters are not accepted; four digits are.
    await page.getByRole("button", { name: "Share with this teacher" }).click();
    await expect(page.getByText("Use exactly 4 digits.")).toBeVisible();
    await pin.fill("a1b2");
    await expect(pin).toHaveValue("12"); // letters are dropped as they are typed
    await pin.fill("1234");
    await expect(pin).toHaveValue("1234");
    await page.getByRole("button", { name: "Share with this teacher" }).click();
    await expect(page.getByTestId("shared")).toBeVisible();

    await page.goto("/profile?mock=1&joined=DEMO42");
    const control = page.getByTestId("class-pin-control");
    await expect(control).toContainText("not set yet");
    await page.getByTestId("class-pin-open").click();
    await page.getByLabel("New 4-digit PIN").fill("4321");
    await audit(page, 1); // the Account page's own black button
    await page.getByRole("button", { name: "Save PIN" }).click();
    await expect(control).toContainText("Class PIN: set");
    await expect(control.getByRole("status")).toContainText("PIN saved.");
    expect(calls).toEqual([]);
  });
});
