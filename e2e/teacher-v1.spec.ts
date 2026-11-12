import { expect, test, type Page } from "@playwright/test";
import { audit } from "./audit";

/*
 * Teacher v1 (docs/v1-plan.md, step 6) in mock mode at 390 px: T6 the student's mock (four part cards with player, transcript
 * with its sentence view, CEFRO's band, grey Agree / Choose level per part, no black button on the page), the teacher's player
 * (speed 1x / 1.25x / 1.5x, play only, no download), a Part 3 attempt page, T3's last mock and join link, the join link
 * itself, and the one-time "Share recordings too?" card. Nothing is sent (no API call); every page is a ?mock=1 address.
 */

test.use({ viewport: { width: 390, height: 844 } });

const T6 = "/teacher/classes/demo-class/mocks/aziza-mock?mock=1&as=teacher";

function watchApi(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(url.pathname);
  });
  return calls;
}

async function mockLinksOnly(page: Page) {
  const hrefs = await page.locator("a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of hrefs) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
}

test("T6: estimated level, date and status; four part cards; grey Agree / Choose level per part; no black button; 390 px", async ({ page }) => {
  const calls = watchApi(page);
  await page.goto("/teacher/classes/demo-class/students/s1?mock=1&as=teacher");
  await expect(page.getByTestId("student-mocks")).toBeVisible();
  await audit(page, 1); // Open latest mock is the one black button
  await page.getByRole("link", { name: "Open latest mock" }).click();
  await expect(page).toHaveURL(/\/mocks\/aziza-mock\?mock=1&as=teacher$/);

  const header = page.getByTestId("teacher-mock-header");
  await expect(header).toContainText(/Mock exam · \d\d\.\d\d\.\d\d/);
  await expect(page.getByTestId("mock-status")).toHaveText("Finished");
  await expect(page.getByTestId("mock-estimate")).toHaveText(/^(Below B1|B1|B2|C1)$/);
  await expect(page.getByTestId("mock-part")).toHaveCount(4);
  await expect(page.getByTestId("teacher-player")).toHaveCount(4);
  for (const part of ["1.1", "1.2", "2", "3"]) {
    const card = page.locator(`[data-testid=mock-part][data-part="${part}"]`);
    await expect(card.getByTestId("part-cefro")).toContainText(/Band \d · /);
    await expect(card.getByTestId("transcript-fixes")).toBeVisible();
  }
  await audit(page, 0);
  await mockLinksOnly(page);

  // The sentence view works inside a part card: tap an underlined sentence, You said / Better / Why open under it.
  // (The demo answers of some parts hold no mistake the mock evaluator can mark: take the first card that does.)
  const withFixes = page.locator("[data-testid=mock-part]").filter({ has: page.getByTestId("fix-sentence") }).first();
  await expect(withFixes).toBeVisible();
  await withFixes.getByTestId("fix-sentence").first().click();
  await expect(withFixes.getByTestId("fix-panel")).toBeVisible();
  await expect(withFixes.getByTestId("fix-detail").first()).toContainText("You said");
  await audit(page, 0);
  const part2 = page.locator('[data-testid=mock-part][data-part="2"]');

  // Agree / Choose level: the same grey pill, side by side, in every part card and for the whole mock.
  const pills = page.getByRole("button", { name: /^(Agree|Choose level)$/ });
  await expect(pills).toHaveCount(10);
  const boxes = await pills.evaluateAll((els) => els.map((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor, y: el.getBoundingClientRect().y })));
  for (let i = 0; i < boxes.length; i += 2) {
    expect(Math.abs(boxes[i].w - boxes[i + 1].w)).toBeLessThan(1);
    expect(Math.abs(boxes[i].h - boxes[i + 1].h)).toBeLessThan(1);
    expect(Math.abs(boxes[i].y - boxes[i + 1].y)).toBeLessThan(1);
    expect(boxes[i].bg).toBe(boxes[i + 1].bg);
  }
  expect(new Set(boxes.map((b) => b.bg)).size).toBe(1);

  await part2.getByRole("button", { name: "Agree" }).click();
  await expect(part2.getByTestId("your-rating")).toHaveText("You: Agree");
  await part2.getByRole("button", { name: "Change" }).click();
  await part2.getByRole("button", { name: /^Band 4 · Higher B2$/ }).click();
  await expect(part2.getByTestId("your-rating")).toHaveText("You: Higher B2 (Band 4)");

  const level = page.getByTestId("mock-level-view");
  await level.getByRole("button", { name: "Choose level" }).click();
  await level.getByRole("button", { name: "C1", exact: true }).click();
  await expect(page.getByTestId("your-mock-rating")).toHaveText("You: C1");
  await audit(page, 0);
  await expect(page.locator("a[download], [download]")).toHaveCount(0);
  expect(calls).toEqual([]); // demo: nothing is sent
});

test("T6 at 390 px: a mock that was not finished says so, keeps its parts and has no black button", async ({ page }) => {
  await page.goto("/teacher/classes/demo-class/mocks/bekzod-mock?mock=1&as=teacher");
  await expect(page.getByTestId("mock-status")).toHaveText("Not finished");
  await expect(page.getByTestId("teacher-mock-header")).toContainText("24 hours");
  await expect(page.getByTestId("mock-estimate")).toHaveText("Estimate not ready yet");
  await expect(page.locator("[data-testid=mock-part][data-state=not_done]")).toHaveCount(2);
  await expect(page.getByTestId("teacher-player")).toHaveCount(2);
  await audit(page, 0);
});

test("the teacher's player: speed 1x / 1.25x / 1.5x change the playback rate, play only (no download), at 390 px", async ({ page }) => {
  await page.goto(T6);
  const player = page.getByTestId("teacher-player").nth(2); // Part 2
  const audio = player.locator("audio");
  await expect(audio).toHaveAttribute("controlsList", /nodownload/);
  await expect(audio).not.toHaveAttribute("download", /.*/);
  await expect(player.getByRole("group", { name: "Playback speed" }).getByRole("button")).toHaveText(["1x", "1.25x", "1.5x"]);
  await expect(player.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "true");

  // A tap target is at least 36 px tall and the chips fit the phone.
  for (const chip of await player.getByRole("button").all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(36);

  for (const [name, rate] of [["1.25x", 1.25], ["1.5x", 1.5], ["1x", 1]] as const) {
    await player.getByRole("button", { name, exact: true }).click();
    await expect(player.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await audio.evaluate((a: HTMLAudioElement) => a.playbackRate)).toBe(rate);
  }
  // It really plays the demo recording at the chosen speed.
  await player.getByRole("button", { name: "1.5x" }).click();
  await audio.evaluate(async (a: HTMLAudioElement) => {
    await a.play();
  });
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2);
  expect(await audio.evaluate((a: HTMLAudioElement) => a.playbackRate)).toBe(1.5);
  await audio.evaluate((a: HTMLAudioElement) => a.pause());

  // The page offers no way to save the audio: no link to it, and the browser's own menu entry is switched off.
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  const allowed = await page.evaluate(() => (document.querySelector("audio") as unknown as { controlsList: DOMTokenList }).controlsList.contains("nodownload"));
  expect(allowed).toBe(true);
  const contextMenuPrevented = await audio.evaluate((a) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(contextMenuPrevented).toBe(true);
  await audit(page, 0);
});

test("a recording deleted after 30 days: the note, no player (T5)", async ({ page }) => {
  await page.goto("/teacher/classes/demo-class/attempts/madina-1?mock=1&as=teacher");
  await expect(page.getByTestId("teacher-audio-deleted")).toContainText(/Recording deleted on \d\d\.\d\d\.\d\d, 30 days after scoring/);
  await expect(page.locator("audio")).toHaveCount(0);
  await audit(page, 0);
});

test("a Part 3 attempt has its own teacher page: points, fix, player, grey Agree / Choose level, no black button", async ({ page }) => {
  await page.goto("/teacher/classes/demo-class/students/s1?mock=1&as=teacher");
  await page.getByTestId("student-attempts").getByRole("link").filter({ hasText: /Cars|city/i }).first().click();
  await expect(page.getByTestId("app-verdict")).toHaveText(/^CEFRO: Part 3 · Band \d · /);
  await expect(page.getByTestId("points-card")).toBeVisible();
  await expect(page.getByTestId("teacher-player")).toBeVisible();
  await expect(page.getByText("Retry with this goal")).toHaveCount(0);
  await expect(page.getByTestId("transcript-fixes")).toBeVisible();
  await audit(page, 0);
  await page.getByRole("button", { name: "Choose level" }).click();
  await page.getByRole("button", { name: /^Band 5 · / }).click();
  await expect(page.getByTestId("your-rating")).toContainText("Band 5");
  await mockLinksOnly(page);
});

test("T3: each student's last mock (level, date); the join link is a second, grey button; Copy join code stays the black one", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = watchApi(page);
  await page.goto("/teacher/classes/demo-class?mock=1&as=teacher");
  await expect(page.getByTestId("last-mock")).toHaveCount(6);
  await expect(page.getByTestId("student-row").filter({ hasText: "Aziza" }).getByTestId("last-mock")).toHaveText(/Last mock: (Below B1|B1|B2|C1) · \d\d\.\d\d\.\d\d/);
  await expect(page.getByTestId("student-row").filter({ hasText: "Bekzod" }).getByTestId("last-mock")).toHaveText(/Not finished · \d\d\.\d\d\.\d\d/);
  await expect(page.getByTestId("student-row").filter({ hasText: "Dilnoza" }).getByTestId("last-mock")).toHaveText("Last mock: —");
  await expect(page.getByTestId("student-row").filter({ hasText: "Sardor" }).getByTestId("scope-note")).toHaveText("Shares Part 2 only");
  await expect(page.getByText("Class mocks")).toHaveCount(0);
  await audit(page, 1);
  await page.getByRole("button", { name: "Copy join link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/join\/DEMO42\?mock=1$/);
  expect(await page.getByRole("button", { name: "Copy join link" }).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(await page.getByRole("button", { name: "Copy join code" }).evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(calls).toEqual([]);
});

test("the join link opens the normal Join + Share screens and shares nothing", async ({ page }) => {
  const calls = watchApi(page);
  await page.goto("/join/demo42?mock=1");
  await expect(page).toHaveURL(/\/profile\/classes\/join\?code=DEMO42&mock=1$/);
  await expect(page.getByRole("heading", { name: "Demo teacher · Demo class" })).toBeVisible();
  const willSee = page.getByTestId("will-see");
  await expect(willSee).toContainText("Every part you practise from now on: 1.1, 1.2, 2 and 3");
  await expect(willSee).toContainText("Every mock you make from now on");
  await expect(willSee).toContainText("Your recordings (deleted after 30 days)");
  await expect(page.getByText(/Won.t see/)).toBeVisible();
  await expect(page.getByText("Earlier attempts, email, exam date.")).toBeVisible();
  await expect(page.getByTestId("shared")).toHaveCount(0); // opening the link shared nothing: the Share tap is still ahead
  await audit(page, 1);
  expect(calls).toEqual([]);
});

test("an old membership gets one 'Share recordings too?' card with two grey buttons; Not now changes nothing", async ({ page }) => {
  const calls = watchApi(page);
  await page.goto("/profile?mock=1&joined=DEMO42&legacy=1");
  const card = page.getByTestId("share-more");
  await expect(card).toContainText("Share recordings too?");
  await expect(card).toContainText("Nothing from before that is shared.");
  await audit(page, 1); // the Account page keeps its own black button
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("share-more-done")).toContainText("Nothing changed");
  await expect(card).toHaveCount(0);
  expect(calls).toEqual([]);

  await page.goto("/profile?mock=1&joined=DEMO42&legacy=1");
  await page.getByTestId("share-more").getByRole("button", { name: "Share recordings too" }).click();
  await expect(page.getByTestId("share-more-done")).toContainText("now also sees every part, your mocks and your recordings from now on");
  expect(calls).toEqual([]);
});
