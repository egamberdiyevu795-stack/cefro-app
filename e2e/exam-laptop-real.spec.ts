import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { audit } from "./audit";
import { querySql, runSql } from "./db";
import { shortPartIntros } from "./short-intro";

/*
 * Exam laptop mode with a REAL database and TWO laptops (docs/v1-plan.md, step 7), on the test server of
 * playwright.exam-laptop.config.ts (TEACHER_LIVE and the full mock are test-only switches there; mock transcriber and
 * evaluator). Two browser contexts are two laptops, both signed in as the same teacher: Laptop 1 starts the exam, Laptop 2
 * joins it as "Room 2". Covered with a real server: the PIN check, "Hi …", the pass made by Start mock (the browser sends it, the
 * server saves the mock to the STUDENT, marked In class), a student in progress on one laptop can't be picked on the other,
 * the lock after 5 wrong PINs on one laptop only, unlock and End exam laptop needing the teacher's password, and closing the
 * class mock. A whole real mock takes about 15 minutes of real audio, so its recordings are covered by the route tests
 * (src/app/api/teacher/exam-laptop.test.ts), not here.
 */

const PASSWORD = "correct horse battery staple";
/** The address the app is served at: writes from any other origin are refused as cross-site. */
const ORIGIN = `http://localhost:${process.env.E2E_EXAM_PORT ?? 3170}`;
const run = Date.now();
const email = (label: string) => `${label}-${run}@example.com`;
let ip = 0;

async function signUp(api: APIRequestContext, address: string, name: string): Promise<void> {
  const headers = { origin: ORIGIN, "x-forwarded-for": `10.77.${run % 200}.${++ip}` };
  const created = await api.post("/api/auth/sign-up/email", { data: { email: address, password: PASSWORD, name: "" }, headers });
  expect(created.ok(), await created.text()).toBe(true);
  const named = await api.put("/api/account/name", { data: { name }, headers });
  expect(named.ok(), await named.text()).toBe(true);
}

async function signIn(context: BrowserContext, address: string): Promise<void> {
  const response = await context.request.post("/api/auth/sign-in/email", { data: { email: address, password: PASSWORD }, headers: { origin: ORIGIN, "x-forwarded-for": `10.78.${run % 200}.${++ip}` } });
  expect(response.ok(), await response.text()).toBe(true);
}

interface Setup {
  classId: string;
  code: string;
}

/** A teacher, a class, and two students who shared with it, each with a class PIN (Aziza 4821, Bekzod 7319). */
async function setUp(browser: Browser): Promise<Setup> {
  const context = await browser.newContext();
  await signUp(context.request, email("teacher"), "Ms Karimova");
  await runSql("UPDATE users SET role = 'teacher' WHERE email = ?", [email("teacher")]);
  const created = await context.request.post("/api/teacher/classes", { data: { name: "Group B" }, headers: { origin: ORIGIN } });
  expect(created.ok(), await created.text()).toBe(true);
  const { class: cls } = (await created.json()) as { class: { id: string; joinCode: string } };
  for (const [label, name, pin] of [["aziza", "Aziza", "4821"], ["bekzod", "Bekzod", "7319"]] as const) {
    const student = await browser.newContext();
    await signUp(student.request, email(label), name);
    await runSql("UPDATE users SET consent_status = 'granted', consent_at = ?, consent_teacher_sharing = 1 WHERE email = ?", [new Date().toISOString(), email(label)]);
    const shared = await student.request.post("/api/classes", { data: { code: cls.joinCode, shownName: name, pin }, headers: { origin: ORIGIN } });
    expect(shared.status(), await shared.text()).toBe(201);
    await student.close();
  }
  await context.close();
  return { classId: cls.id, code: cls.joinCode };
}

async function laptop(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"] });
  await shortPartIntros(context);
  await signIn(context, email("teacher"));
  return { context, page: await context.newPage() };
}

const pick = (page: Page, name: string) => page.getByTestId("roster-name").filter({ hasText: name });
const fixed = (page: Page, name: string) => page.getByTestId("roster-name-fixed").filter({ hasText: name });
async function typePin(page: Page, pin: string) {
  await page.getByTestId("pin-field").fill(pin);
  await page.getByTestId("pin-continue").click();
}

test("two laptops, one class: start and join, PINs, a student in progress on one can't be picked on the other, lock, unlock and End need the password", async ({ browser }) => {
  test.setTimeout(240_000);
  const { classId } = await setUp(browser);
  const room1 = await laptop(browser);
  const room2 = await laptop(browser);
  const l1 = room1.page;
  const l2 = room2.page;

  // Laptop 1: Start exam laptop, "same paper for everyone" (the suggested four tasks), named Room 1.
  await l1.goto(`/teacher/classes/${classId}/exam`);
  await expect(l1.getByRole("heading", { name: "Start exam laptop" })).toBeVisible();
  await expect(l1.getByTestId("suggested-paper").getByRole("listitem")).toHaveCount(4);
  await audit(l1, 1);
  await l1.getByLabel("Name of this laptop").fill("Room 1");
  await l1.getByRole("button", { name: "Start exam laptop" }).click();
  await expect(l1).toHaveURL(/\/exam\/[0-9a-f-]{36}\/laptop\?room=Room\+1$/);
  await expect(l1.getByRole("heading", { name: "Tap your name" })).toBeVisible();
  await expect(pick(l1, "Aziza")).toBeVisible();
  await expect(pick(l1, "Bekzod")).toBeVisible();
  await audit(l1, 0);
  const classMockId = new URL(l1.url()).pathname.split("/")[5]!;

  // Laptop 1 is now a DEVICE session, not the teacher's login: it can't reach a teacher page, a student page, the Account page, a
  // recording or any other API (the same 404 as a stranger), while its own screen and routes work.
  for (const path of [`/teacher/classes/${classId}`, `/teacher/classes/${classId}/exam`, `/teacher/classes/${classId}/exam/${classMockId}`, "/profile", "/dashboard", "/practice", "/history", "/teacher/classes/new"]) {
    const response = await l1.goto(path);
    expect(response!.status(), path).toBe(404);
  }
  for (const path of ["/api/teacher/classes", `/api/teacher/classes/${classId}`, `/api/teacher/classes/${classId}/exam`, `/api/teacher/classes/${classId}/exam/${classMockId}/results`, "/api/account/me", "/api/classes", "/api/speaking/attempts/x/audio", `/api/mock-exams/${classMockId}/result`]) {
    const response = await l1.request.get(path);
    expect(response.status(), path).toBe(404);
  }
  expect((await l1.goto(`/teacher/classes/${classId}/exam/${classMockId}/laptop?room=Room+1`))!.status()).toBe(200);
  await expect(l1.getByRole("heading", { name: "Tap your name" })).toBeVisible();
  expect(await querySql("SELECT task_1_1, task_1_2, task_2, task_3 FROM class_mocks")).toHaveLength(1);

  // Laptop 2: Start exam laptop joins the SAME open class mock (no second row), as "Room 2".
  await l2.goto(`/teacher/classes/${classId}/exam`);
  await expect(l2.getByRole("heading", { name: /^Join Mock 1$/ })).toBeVisible();
  await expect(l2.getByLabel("Name of this laptop")).toHaveValue("Room 2");
  await l2.getByRole("button", { name: "Join and start exam laptop" }).click();
  await expect(l2).toHaveURL(new RegExp(`/exam/${classMockId}/laptop\\?room=Room\\+2$`));
  expect(await querySql("SELECT id FROM class_mocks")).toHaveLength(1);

  // Aziza on Laptop 1: a wrong PIN, then hers. "Hi Aziza", then Start mock: the browser sends the pass, the server makes HER mock.
  await pick(l1, "Aziza").click();
  await typePin(l1, "0000");
  await expect(l1.getByTestId("pin-problem")).toContainText("That PIN isn't right. 4 tries left.");
  await typePin(l1, "4821");
  await expect(l1.getByRole("heading", { name: "Hi Aziza, this mock is saved to your account" })).toBeVisible();
  await audit(l1, 1);
  const passes = await querySql("SELECT device_label, student_user_id, used_up_at FROM exam_passes");
  expect(passes).toEqual([expect.objectContaining({ device_label: "Room 1", used_up_at: null })]);
  await l1.getByRole("button", { name: "Start mock" }).click();
  await expect(l1.getByTestId("mock-progress")).toContainText("Part 1 of 4");
  const aziza = (await querySql("SELECT id FROM users WHERE email = ?", [email("aziza")]))[0]!.id as string;
  const teacher = (await querySql("SELECT id FROM users WHERE email = ?", [email("teacher")]))[0]!.id as string;
  const sessions = await querySql("SELECT user_id, kind, status, class_mock_id FROM practice_sessions");
  expect(sessions).toEqual([{ user_id: aziza, kind: "full_mock", status: "in_progress", class_mock_id: classMockId }]);
  expect(sessions.some((s) => s.user_id === teacher)).toBe(false); // nothing in the teacher's account

  // Laptop 2 sees Aziza In progress (Room 1), as plain text: she can't be picked there. Bekzod can.
  await expect(l2.getByTestId("roster-in_progress")).toContainText("In progress (Room 1)", { timeout: 20_000 });
  await expect(fixed(l2, "Aziza")).toContainText("In progress (Room 1)");
  await expect(pick(l2, "Aziza")).toHaveCount(0);
  await expect(pick(l2, "Bekzod")).toBeVisible();
  await audit(l2, 0);

  // Bekzod gets 5 wrong PINs on Laptop 2: locked THERE, with the next student's screen showing why; Laptop 1 can still pick him.
  await pick(l2, "Bekzod").click();
  for (let left = 4; left >= 1; left--) {
    await typePin(l2, "1111");
    await expect(l2.getByTestId("pin-problem")).toContainText(`${left} ${left === 1 ? "try" : "tries"} left`);
  }
  await typePin(l2, "1111");
  await expect(l2.getByRole("heading", { name: "Tap your name" })).toBeVisible();
  await expect(fixed(l2, "Bekzod")).toContainText("Locked. Ask your teacher.");
  await expect(pick(l2, "Bekzod")).toHaveCount(0);
  const stored = await querySql("SELECT pin_failures FROM class_members WHERE shown_name = 'Bekzod'");
  expect(JSON.parse(String(stored[0]!.pin_failures))).toEqual({ [Object.keys(JSON.parse(String(stored[0]!.pin_failures)))[0]!]: 5 });
  // The teacher's own laptop (Room 1) is a different laptop: not locked there. (Bekzod stays on the list there.)
  await l1.goto(`/teacher/classes/${classId}/exam/${classMockId}/laptop?room=Room+1`);
  await expect(pick(l1, "Bekzod")).toBeVisible();

  // Unlock on Laptop 2 needs the teacher's email and password, and hands the teacher's own session back (the device session ends).
  await l2.getByTestId("teacher-options-open").click();
  await l2.getByTestId("teacher-email").fill(email("teacher"));
  await l2.getByTestId("teacher-password").fill("not my password");
  await l2.getByRole("button", { name: "Unlock Bekzod" }).click();
  await expect(l2.getByTestId("teacher-options-message")).toContainText("That email and password don't match.");
  await expect(pick(l2, "Bekzod")).toHaveCount(0);
  await l2.getByTestId("teacher-email").fill(email("aziza")); // another account's email is refused too
  await l2.getByTestId("teacher-password").fill(PASSWORD);
  await l2.getByRole("button", { name: "Unlock Bekzod" }).click();
  await expect(l2.getByTestId("teacher-options-message")).toContainText("That email and password don't match.");
  await l2.getByTestId("teacher-email").fill(email("teacher"));
  await l2.getByTestId("teacher-password").fill(PASSWORD);
  await l2.getByRole("button", { name: "Unlock Bekzod" }).click();
  // Laptop 2 is the teacher's browser again, on the Start page, which joins the open class mock.
  await expect(l2).toHaveURL(new RegExp(`/teacher/classes/${classId}/exam$`));
  await expect(l2.getByRole("heading", { name: /^Join Mock 1$/ })).toBeVisible();
  await l2.getByRole("button", { name: "Join and start exam laptop" }).click();
  await expect(l2).toHaveURL(new RegExp(`/exam/${classMockId}/laptop\\?room=Room\\+2$`));
  await expect(pick(l2, "Bekzod")).toBeVisible({ timeout: 20_000 });
  await typePinAfterOpen(l2, "Bekzod", "7319");
  await expect(l2.getByRole("heading", { name: "Hi Bekzod, this mock is saved to your account" })).toBeVisible();

  // End exam laptop (Room 2) needs the password too; the other laptop's pass stays; then closing the class mock refuses new starts.
  await l2.goto(`/teacher/classes/${classId}/exam/${classMockId}/laptop?room=Room+2`);
  await l2.getByTestId("teacher-options-open").click();
  await l2.getByTestId("teacher-email").fill(email("teacher"));
  await l2.getByTestId("teacher-password").fill("nope");
  await l2.getByTestId("end-laptop").click();
  await expect(l2.getByTestId("teacher-options-message")).toContainText("That email and password don't match.");
  await expect(l2).toHaveURL(/\/laptop\?room=Room\+2$/);
  await l2.getByTestId("teacher-password").fill(PASSWORD);
  await l2.getByTestId("end-class-mock").click();
  await expect(l2).toHaveURL(new RegExp(`/exam/${classMockId}$`));
  await expect(l2.getByTestId("class-mock-results")).toBeVisible();
  expect(await querySql("SELECT closed_at FROM class_mocks")).toEqual([{ closed_at: expect.any(String) }]);

  // The class mock closed, so Laptop 1's device session is over: its screen is the 404 page, a PIN is refused by the server, and the
  // dead device cookie is removed (the browser is an ordinary one again).
  expect((await l1.goto(`/teacher/classes/${classId}/exam/${classMockId}/laptop?room=Room+1`))!.status()).toBe(404);
  const refused = await l1.request.post(`/api/exam-laptop/${classMockId}/pin`, {
    data: { memberId: (await querySql("SELECT id FROM class_members WHERE shown_name = 'Bekzod'"))[0]!.id, pin: "7319" },
    headers: { origin: ORIGIN },
  });
  expect(refused.status()).toBe(404);
  expect((await l1.context().cookies()).some((c) => c.name === "cefro_exam_device")).toBe(false);

  await room1.context.close();
  await room2.context.close();
});

/** After an unlock the name is tappable again: tap it and type the PIN. */
async function typePinAfterOpen(page: Page, name: string, pin: string) {
  await pick(page, name).click();
  await typePin(page, pin);
}

test("the class page lists the class mock with who finished, and T8 opens from it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signIn(context, email("teacher"));
  const page = await context.newPage();
  const classes = await querySql("SELECT id FROM classes");
  await page.goto(`/teacher/classes/${classes[0]!.id}`);
  await expect(page.getByRole("link", { name: "Start exam laptop" })).toBeVisible();
  await audit(page, 1);
  const row = page.getByTestId("class-mock-row");
  await expect(row).toContainText("Mock 1");
  await expect(row).toContainText("0 of 2 finished");
  await expect(row).toContainText("Closed");
  await row.click();
  await expect(page.getByTestId("class-mock-results")).toBeVisible();
  await expect(page.getByTestId("result-row")).toHaveCount(2);
  await audit(page, 0); // nothing is rated, but nobody has a scored part either: no "Open first unrated"
  await context.close();
});
