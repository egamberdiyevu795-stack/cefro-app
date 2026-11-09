import { expect, test, type Page } from "@playwright/test";
import { PART_LIVE } from "../src/config/features";

/*
 * The signed-out pages (home, sign in, Create account) at 390 px: one black control, no text under 11 px, WCAG AA text
 * contrast, no horizontal scroll, no header menu and no navigation tabs. "See a demo result" opens a real demo result
 * (?mock=1). The exam-parts list follows the release switches (PART_LIVE). A signed-in visitor on home goes to the
 * dashboard.
 *
 * Also run on a production build set up like a Preview with no variables (playwright.preview.config.ts): there only the
 * mock versions (?mock=1) answer, so the real-page tests are skipped.
 */

const PREVIEW = process.env.E2E_PREVIEW === "1";
const PASSWORD = "correct horse battery staple";
const run = Date.now();

const PAGES = [
  { url: "/", heading: "Know exactly what to fix before your speaking exam", black: "Start practising" },
  { url: "/login", heading: "Welcome back", black: "Sign in" },
  { url: "/register", heading: "Save your results", black: "Create account" },
] as const;

/** Visible text nodes: the smallest computed font size, and every text whose contrast with its background is below AA. */
async function textAudit(page: Page) {
  return page.evaluate(() => {
    const parse = (color: string) => {
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    /** The first opaque background behind an element (all backgrounds here are opaque tokens). */
    const background = (el: Element | null) => {
      for (let node = el; node; node = node.parentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) return bg;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    let smallest = Infinity;
    const failures: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || el.closest("[aria-hidden=true], script, style, template, noscript, .sr-only")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      smallest = Math.min(smallest, size);
      const fg = parse(style.color)!;
      const l1 = luminance(fg);
      const l2 = luminance(background(el));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) failures.push(`${node.textContent.trim()} (${ratio.toFixed(2)}:1)`);
    }
    return { smallest, failures };
  });
}

/** Visible links and buttons drawn in the near-black primary colour. */
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

async function audit(page: Page, black: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await blackControls(page)).toEqual([black]);
  const { smallest, failures } = await textAudit(page);
  expect(smallest).toBeGreaterThanOrEqual(11);
  expect(failures).toEqual([]);
  // No header menu, no navigation tabs signed out.
  await expect(page.getByTestId("account-status")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
}

for (const mock of [false, true]) {
  for (const { url, heading, black } of PAGES) {
    const address = mock ? `${url}?mock=1` : url;
    test(`${address} at 390 px: one black control, no text under 11 px, AA contrast, no menu or tabs`, async ({ page }) => {
      test.skip(PREVIEW && !mock, "on a Preview with no variables the real pages are refused");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      if (url !== "/") await expect(page.getByRole("button", { name: black })).toBeEnabled(); // the page is ready
      await audit(page, black);
    });
  }
}

test("See a demo result keeps ?mock=1 and opens the real demo result page", async ({ page }) => {
  for (const mock of PREVIEW ? [true] : [false, true]) {
    await page.goto(mock ? "/?mock=1" : "/");
    const demo = page.getByRole("link", { name: "See a demo result" });
    await expect(demo).toHaveAttribute("href", "/result?demo=demo-5&mock=1");
  }
  await page.getByRole("link", { name: "See a demo result" }).click();
  await expect(page).toHaveURL(/\/result\?demo=demo-5&mock=1$/);
  await expect(page.getByTestId("demo-label")).toBeVisible();
});

test("home links: Start practising and Sign in (mock mode keeps ?mock=1)", async ({ page }) => {
  for (const mock of PREVIEW ? [true] : [false, true]) {
    await page.goto(mock ? "/?mock=1" : "/");
    const q = mock ? "?mock=1" : "";
    await expect(page.getByRole("link", { name: "Start practising" })).toHaveAttribute("href", `/register${q}`);
    const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", `/login${q}`);
    await signIn.click();
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", `/register${q}`);
  }
});

test("the home page ends with the small grey 'Built by' line, under the status list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mock=1");
  const line = page.getByTestId("built-by");
  await expect(line).toHaveText("Built by a student in Tashkent for UZBMB candidates.");
  const { size, below, last, color } = await line.evaluate((el) => {
    const status = document.querySelector("[data-testid=exam-status]")!.getBoundingClientRect();
    const main = document.querySelector("main")!;
    const texts = [...main.querySelectorAll("*")].filter((n) => n.children.length === 0 && n.textContent?.trim());
    return {
      size: parseFloat(getComputedStyle(el).fontSize),
      below: el.getBoundingClientRect().top >= status.bottom,
      last: texts[texts.length - 1] === el,
      color: getComputedStyle(el).color,
    };
  });
  expect(size).toBeGreaterThanOrEqual(11);
  expect(below).toBe(true);
  expect(last).toBe(true);
  expect(color).toBe("rgb(94, 95, 100)"); // fg-muted: 5.26:1 on the page, AA (the 390 px audit measures it too)
});

test("the exam-parts list follows the release switches (PART_LIVE), and no page text says Part 2 elsewhere", async ({ page }) => {
  await page.goto("/?mock=1");
  const status = page.getByTestId("exam-status");
  const open = [PART_LIVE["1.1"] && PART_LIVE["1.2"], PART_LIVE["2"], PART_LIVE["3"]];
  if (open.every(Boolean)) {
    await expect(status).toHaveText("Exam partsAll three parts are open.");
    await expect(page.getByText("Coming soon")).toHaveCount(0);
  } else {
    const labels = ["Part 1 · A1–B1", "Part 2 · B2", "Part 3 · C1"];
    await expect(status.locator("dt")).toHaveText(labels);
    await expect(status.locator("dd")).toHaveText(open.map((o) => (o ? "Open" : "Coming soon")));
  }
  // The page's words (header and main) without the status list.
  const pageText = () =>
    page.evaluate(() => {
      const main = document.querySelector("main")!.cloneNode(true) as HTMLElement;
      main.querySelector("[data-testid=exam-status]")?.remove();
      return `${document.querySelector("header")!.textContent} ${main.textContent}`;
    });
  expect(await pageText()).toContain("Know exactly what to fix");
  expect(await pageText()).not.toMatch(/Part\s*\d/);
  for (const url of ["/login?mock=1", "/register?mock=1"]) {
    await page.goto(url);
    expect(await pageText()).not.toMatch(/Part\s*\d/);
  }
});

test("mock mode: the sign-in form sends nothing", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiCalls.push(request.url());
  });
  await page.goto("/login?mock=1");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toHaveText("Demo mode: nothing was sent and no account was used.");
  await expect(page).toHaveURL(/\/login\?mock=1$/);
  expect(apiCalls).toEqual([]);
});

test("a signed-in visitor who opens home goes to the dashboard; the account starts with no name, set later on the Account page", async ({ page }) => {
  test.skip(PREVIEW, "no accounts on a Preview with no variables");
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.88.${run % 250}.7` });
  await page.goto("/register");
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await page.getByLabel("Email").fill(`entry-${run}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "authenticated");
  expect((await (await page.request.get("/api/account/me")).json()).name).toBeNull();
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/profile");
  await expect(page.getByTestId("profile-name")).toHaveText("Not set");
});

test("the server's name rules still hold for a sign-up request that sends a name", async ({ page }) => {
  test.skip(PREVIEW, "no accounts on a Preview with no variables");
  const headers = { "x-forwarded-for": `10.89.${run % 250}.9` };
  const refused = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email: `noname-${run}@example.com`, password: PASSWORD, name: "someone@example.com" },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toMatchObject({ code: "invalid_name", message: "Use your name, not an email address." });
  expect((await (await page.request.get("/api/account/me")).json()).state).toBe("anonymous");
});
