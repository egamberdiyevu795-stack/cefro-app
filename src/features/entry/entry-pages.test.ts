import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The signed-out pages (home, sign in, Create account): wording, links, one black button, no text under 11 px,
 * no header menu or navigation tabs, and a signed-in visitor on home goes to the dashboard.
 */

const state = vi.hoisted(() => ({ signedIn: false, live: { "1.1": false, "1.2": false, "2": true, "3": false } as Record<string, boolean> }));
vi.mock("@/config/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/features")>();
  return { ...original, PART_LIVE: state.live };
});
vi.mock("@/server/identity/current-user", () => ({ isSignedIn: async () => state.signedIn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));

import EntryLayout from "@/app/(entry)/layout";
import LoginPage from "@/app/(entry)/login/page";
import HomePage from "@/app/(entry)/page";
import RegisterPage from "@/app/(entry)/register/page";
import { partTiles } from "@/features/dashboard/progress";
import { ALL_PARTS_OPEN, DEMO_HREF, HOME, REGISTER, SIGN_IN, entryHref, examStatus } from "./content";

/** The real release switches (src/config/features.ts), which the mock above replaces for the pages. */
const { PART_LIVE: REAL_PART_LIVE } = await vi.importActual<typeof import("@/config/features")>("@/config/features");

const props = (query: Record<string, string> = {}) => ({ params: Promise.resolve({}), searchParams: Promise.resolve(query) }) as never;
const render = async (page: Promise<unknown>) => renderToStaticMarkup((await EntryLayout({ children: (await page) as React.ReactNode })) as React.ReactElement);
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const BLACK = /<(a|button)\b[^>]*class="[^"]*\bbg-primary text-on-primary\b/g;
/** Any text size under the 11 px caption: old small utilities or an arbitrary px size under 11. */
const SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b|text-\[0\.[0-6]/;
/** The old (pre-design-system) tokens and components. */
const OLD = /\b(text-muted|text-ink|text-brand|bg-surface|border-border|text-subtle)\b/;

beforeEach(() => {
  state.signedIn = false;
  Object.assign(state.live, { "1.1": false, "1.2": false, "2": true, "3": false });
});

describe("signed-out home", () => {
  it("says what the brief says, for the whole exam, and claims nothing else", async () => {
    const markup = await render(HomePage(props()));
    const page = text(markup);
    expect(HOME.eyebrow).toBe("UZBMB multilevel speaking");
    expect(HOME.heading).toBe("Know exactly what to fix before your speaking exam");
    expect(HOME.line).toBe("Answer exam-style questions out loud, see your own words quoted, fix one thing and try again.");
    expect(HOME.steps.map(({ title, detail }) => [title, detail])).toEqual([
      ["Speak like in the exam", "Exam-style questions, pictures and timing."],
      ["See your own words quoted", "What worked and what to improve."],
      ["Fix one thing, then retry", "See whether it worked."],
    ]);
    for (const words of ["CEFRO", "Sign in", HOME.eyebrow, HOME.heading, HOME.line, "Start practising", ...HOME.steps.flatMap((s) => [s.title, s.detail])]) {
      expect(page).toContain(words);
    }
    // One icon per step.
    expect(markup.match(/<li\b[^>]*>\s*<span[^>]*><svg\b/g)).toHaveLength(3);
    // The last line of the page, after the status list: small (11 px caption) and grey (fg-muted, AA on the page).
    expect(HOME.builtBy).toBe("Built by a student in Tashkent for UZBMB candidates.");
    const last = /<p class="([^"]*)" data-testid="built-by">([^<]*)<\/p>/.exec(markup);
    expect(last?.[2]).toBe(HOME.builtBy);
    expect(last?.[1]).toBe("text-caption text-fg-muted");
    expect(markup.indexOf('data-testid="exam-status"')).toBeLessThan(markup.indexOf('data-testid="built-by"'));
    expect(page.trim().endsWith(HOME.builtBy)).toBe(true);
    // The example feedback card is gone; no claims.
    expect(page).not.toContain("Example feedback");
    expect(page).not.toMatch(/Passed|Failed|under 18|under-18|18 or older|\bfree\b|rating|review|testimonial|students|★/i);
  });

  it("one black button (Start practising, to Create account); no demo link in normal use", async () => {
    const markup = await render(HomePage(props()));
    expect(markup.match(BLACK) ?? []).toHaveLength(1);
    const tag = (label: string) => new RegExp(`<a\\b[^>]*>${label}</a>`).exec(markup)?.[0] ?? "";
    expect(tag("Start practising")).toMatch(/href="\/register"/);
    expect(tag("Start practising")).toContain("bg-primary");
    // Normal use shows only the visitor's own work: no demo result link (mock mode keeps it, below).
    expect(markup).not.toContain(HOME.demo);
    expect(markup).not.toContain("demo=");
    // The small grey Sign in in the top row (muted, underlined, never black).
    const signIn = /<header\b[\s\S]*?<\/header>/.exec(markup)?.[0] ?? "";
    const link = /<a\b[^>]*>Sign in<\/a>/.exec(signIn)?.[0] ?? "";
    expect(link).toContain('href="/login"');
    expect(link).toMatch(/class="[^"]*\btext-fg-muted\b[^"]*\bunderline\b/);
    expect(link).toContain("min-h-11");
    expect(signIn).not.toContain("bg-primary");
  });

  it("mock mode: Start practising and Sign in keep ?mock=1; a grey See a demo result opens a demo result with ?mock=1", async () => {
    const markup = await render(HomePage(props({ mock: "1" })));
    expect(markup).toContain('href="/register?mock=1"');
    expect(markup).toContain('href="/login?mock=1"');
    expect(markup.match(BLACK) ?? []).toHaveLength(1);
    expect(DEMO_HREF).toBe("/result?demo=demo-5&mock=1");
    const demo = new RegExp(`<a\\b[^>]*>${HOME.demo}</a>`).exec(markup)?.[0] ?? "";
    expect(demo).toContain('href="/result?demo=demo-5&amp;mock=1"');
    expect(demo).toContain("bg-well");
    expect(demo).not.toContain("bg-primary");
  });

  it("after Delete my account: the deleted message on top (never in mock mode)", async () => {
    expect(await render(HomePage(props({ deleted: "1" })))).toContain('data-testid="account-deleted"');
    expect(await render(HomePage(props({ deleted: "1", mock: "1" })))).not.toContain('data-testid="account-deleted"');
  });
});

describe("which exam parts are open (from PART_LIVE, the dashboard's switches)", () => {
  const ONLY_PART_2 = { "1.1": false, "1.2": false, "2": true, "3": false } as const;
  const ALL = { "1.1": true, "1.2": true, "2": true, "3": true } as const;
  const NONE = { "1.1": false, "1.2": false, "2": false, "3": false } as const;
  const statusOf = (markup: string) => text(/<section\b[^>]*data-testid="exam-status"[\s\S]*?<\/section>/.exec(markup)?.[0] ?? "").trim();

  it("only Part 2 live: Part 1 and 3 Coming soon, Part 2 Open", async () => {
    expect(examStatus(ONLY_PART_2)).toEqual({
      kind: "list",
      rows: [
        { label: "Part 1 · A1–B1", open: false, status: "Coming soon" },
        { label: "Part 2 · B2", open: true, status: "Open" },
        { label: "Part 3 · C1", open: false, status: "Coming soon" },
      ],
    });
    Object.assign(state.live, ONLY_PART_2);
    const page = text(await render(HomePage(props())));
    expect(page).toMatch(/Part 1 · A1–B1 Coming soon Part 2 · B2 Open Part 3 · C1 Coming soon/);
    expect(page.match(/Coming soon/g)).toHaveLength(2);
    expect(page).not.toContain(ALL_PARTS_OPEN);
  });

  it("all live: the single line, and no Coming soon anywhere", async () => {
    expect(examStatus(ALL)).toEqual({ kind: "all-open", text: "All three parts are open." });
    Object.assign(state.live, ALL);
    const markup = await render(HomePage(props()));
    expect(statusOf(markup)).toBe("Exam parts All three parts are open.");
    expect(text(markup)).not.toMatch(/Coming soon/i);
    expect(text(markup)).not.toMatch(/Part 1 ·|Part 2 ·|Part 3 ·/);
  });

  it("none live: every part Coming soon, none Open", async () => {
    expect(examStatus(NONE)).toEqual({
      kind: "list",
      rows: [
        { label: "Part 1 · A1–B1", open: false, status: "Coming soon" },
        { label: "Part 2 · B2", open: false, status: "Coming soon" },
        { label: "Part 3 · C1", open: false, status: "Coming soon" },
      ],
    });
    Object.assign(state.live, NONE);
    const page = text(await render(HomePage(props())));
    expect(page.match(/Coming soon/g)).toHaveLength(3);
    expect(page).not.toMatch(/\bOpen\b/);
  });

  it("Part 1 is Open only when both 1.1 and 1.2 are live; Coming soon appears only for a part that is not live", () => {
    const part1 = (live: Record<"1.1" | "1.2" | "2" | "3", boolean>) => {
      const status = examStatus(live);
      return status.kind === "all-open" ? "Open" : status.rows[0].status;
    };
    expect(part1({ ...NONE, "1.1": true })).toBe("Coming soon");
    expect(part1({ ...NONE, "1.2": true })).toBe("Coming soon");
    expect(part1({ ...NONE, "1.1": true, "1.2": true })).toBe("Open");
    // Every combination of the four switches.
    for (let bits = 0; bits < 16; bits++) {
      const live = { "1.1": !!(bits & 1), "1.2": !!(bits & 2), "2": !!(bits & 4), "3": !!(bits & 8) };
      const status = examStatus(live);
      const open = [live["1.1"] && live["1.2"], live["2"], live["3"]];
      if (open.every(Boolean)) expect(status.kind).toBe("all-open");
      else if (status.kind === "list") expect(status.rows.map((r) => r.status)).toEqual(open.map((o) => (o ? "Open" : "Coming soon")));
      else throw new Error("expected a list");
    }
  });

  it("the default is the real switches, the same ones the dashboard's part tiles read", () => {
    const status = examStatus(REAL_PART_LIVE);
    const tiles = partTiles([], REAL_PART_LIVE);
    const tileLive = (part: string) => tiles.find((t) => t.part === part)!.href !== null;
    const expected = [tileLive("1.1") && tileLive("1.2"), tileLive("2"), tileLive("3")];
    if (status.kind === "all-open") expect(expected.every(Boolean)).toBe(true);
    else expect(status.rows.map((r) => r.open)).toEqual(expected);
  });
});

describe("signed-out pages", () => {
  it("no header menu, no navigation tabs, no old styles, no text under 11 px", async () => {
    for (const page of [HomePage(props()), LoginPage(props()), RegisterPage(props())]) {
      const markup = await render(page);
      expect(markup).not.toContain('data-testid="account-status"');
      expect(markup).not.toContain('aria-label="Main"');
      expect(markup).not.toMatch(SMALL);
      expect(markup).not.toMatch(OLD);
      expect(markup.match(/<h1\b/g)).toHaveLength(1);
    }
  });

  it("a signed-in visitor goes to the dashboard", async () => {
    state.signedIn = true;
    await expect(HomePage(props())).rejects.toMatchObject({ digest: expect.stringContaining("/dashboard") });
    // Mock mode never looks anyone up.
    await expect(HomePage(props({ mock: "1" }))).resolves.toBeTruthy();
  });
});

describe("sign in and Create account", () => {
  it("sign in: Welcome back, email, password, the black Sign in, New here? Create account (keeping ?next=)", async () => {
    const markup = await render(LoginPage(props({ next: "/history" })));
    const page = text(markup);
    expect(SIGN_IN.heading).toBe("Welcome back");
    expect(markup).toMatch(/<h1\b[^>]*>Welcome back<\/h1>/);
    expect(page).toContain("New here? Create account");
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="password"');
    expect(markup).not.toContain('name="name"');
    const black = markup.match(BLACK) ?? [];
    expect(black).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Sign in<\/button>/);
    expect(markup).toContain('href="/register?next=%2Fhistory"');
  });

  it("Create account: Save your results, email and password only (no name) with its hint, the black Create account, Have an account? Sign in", async () => {
    const markup = await render(RegisterPage(props()));
    const page = text(markup);
    expect(REGISTER.heading).toBe("Save your results");
    expect(REGISTER.line).toBe("Your answers, feedback and progress stay in your account, so you can see if you improve.");
    expect(markup).toMatch(/<h1\b[^>]*>Save your results<\/h1>/);
    expect(page).toContain(REGISTER.line);
    expect(page).toContain("At least 8 characters.");
    expect(page).toContain("Have an account? Sign in");
    for (const field of ["email", "password"]) expect(markup).toContain(`name="${field}"`);
    expect(markup).not.toContain('name="name"');
    expect(markup.match(/<input\b/g)).toHaveLength(2);
    expect(markup).toMatch(/<form\b[^>]*method="post"/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/); // until the scripts load
    expect(markup).toMatch(/aria-describedby="password-hint"/);
    expect(markup.match(BLACK) ?? []).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Create account<\/button>/);
    expect(markup).toContain('href="/login"');
  });

  it("no page says \"Part 2\" outside the home page's status list", async () => {
    for (const page of [LoginPage(props()), RegisterPage(props())]) expect(text(await render(page))).not.toMatch(/Part 2/i);
    const home = await render(HomePage(props()));
    const withoutStatus = home.replace(/<section\b[^>]*data-testid="exam-status"[\s\S]*?<\/section>/, "");
    expect(text(withoutStatus)).not.toMatch(/Part 2|Part\s*\d/i);
    for (const words of [HOME.eyebrow, HOME.heading, HOME.line, ...HOME.steps.flatMap((s) => [s.title, s.detail]), REGISTER.heading, REGISTER.line, SIGN_IN.heading]) {
      expect(words).not.toMatch(/Part\s*\d/i);
    }
  });

  it("entryHref keeps ?next= (never the default /) and ?mock=1", () => {
    expect(entryHref("/login")).toBe("/login");
    expect(entryHref("/login", { next: "/" })).toBe("/login");
    expect(entryHref("/register", { next: "/practice/speaking/x" })).toBe("/register?next=%2Fpractice%2Fspeaking%2Fx");
    expect(entryHref("/register", { mock: true })).toBe("/register?mock=1");
    expect(entryHref("/login", { next: "/history", mock: true })).toBe("/login?next=%2Fhistory&mock=1");
  });
});
