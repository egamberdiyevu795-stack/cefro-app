import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The signed-out pages (home, sign in, Create account): wording, links, one black button, no text under 11 px,
 * no header menu or navigation tabs, and a signed-in visitor on home goes to the dashboard.
 */

const state = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/server/identity/current-user", () => ({ isSignedIn: async () => state.signedIn }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));

import EntryLayout from "@/app/(entry)/layout";
import LoginPage from "@/app/(entry)/login/page";
import HomePage from "@/app/(entry)/page";
import RegisterPage from "@/app/(entry)/register/page";
import { DEMO_HREF, HOME, entryHref } from "./content";

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
});

describe("signed-out home", () => {
  it("says what the brief says, with the example feedback card, and nothing else claimed", async () => {
    const page = text(await render(HomePage(props())));
    for (const words of ["CEFRO", HOME.heading, HOME.line, HOME.example.title, HOME.example.fix, HOME.example.detail, "Create account", "Try the demo", "Have an account?", "Sign in"]) {
      expect(page).toContain(words);
    }
    expect(HOME.heading).toBe("Practise the multilevel speaking exam");
    expect(HOME.line).toBe("Speak, see your own words quoted, fix one thing, and try again.");
    expect(HOME.example).toEqual({
      title: "Example feedback",
      fix: "Biggest fix: answer every question",
      detail: "You answered 2 of 3 questions. Question 3 asked for your opinion.",
    });
    expect(page).not.toMatch(/Passed|Failed|under 18|18 or older/i);
  });

  it("one black button (Create account); Try the demo is grey and opens the demo dashboard with ?mock=1", async () => {
    const markup = await render(HomePage(props()));
    const black = markup.match(BLACK) ?? [];
    expect(black).toHaveLength(1);
    const tag = (label: string) => new RegExp(`<a\\b[^>]*>${label}</a>`).exec(markup)?.[0] ?? "";
    expect(tag("Create account")).toMatch(/href="\/register"/);
    expect(tag("Create account")).toContain("bg-primary");
    expect(DEMO_HREF).toBe("/dashboard?mock=1");
    expect(tag("Try the demo")).toMatch(/href="\/dashboard\?mock=1"/);
    expect(tag("Try the demo")).toContain("bg-well");
    expect(tag("Try the demo")).not.toContain("bg-primary");
    expect(markup).toContain('href="/login"');
  });

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
  it("sign in: email, password, the black Sign in, New here? Create account (keeping ?next=)", async () => {
    const markup = await render(LoginPage(props({ next: "/history" })));
    const page = text(markup);
    expect(page).toContain("New here? Create account");
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="password"');
    expect(markup).not.toContain('name="name"');
    const black = markup.match(BLACK) ?? [];
    expect(black).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Sign in<\/button>/);
    expect(markup).toContain('href="/register?next=%2Fhistory"');
  });

  it("Create account: name, email, password with its hint, the black Create account, Have an account? Sign in", async () => {
    const markup = await render(RegisterPage(props()));
    const page = text(markup);
    expect(page).toContain("At least 8 characters.");
    expect(page).toContain("Have an account? Sign in");
    for (const field of ["name", "email", "password"]) expect(markup).toContain(`name="${field}"`);
    expect(markup).toMatch(/aria-describedby="password-hint"/);
    expect(markup.match(BLACK) ?? []).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Create account<\/button>/);
    expect(markup).toContain('href="/login"');
  });

  it("entryHref keeps ?next= (never the default /) and ?mock=1", () => {
    expect(entryHref("/login")).toBe("/login");
    expect(entryHref("/login", { next: "/" })).toBe("/login");
    expect(entryHref("/register", { next: "/practice/speaking/x" })).toBe("/register?next=%2Fpractice%2Fspeaking%2Fx");
    expect(entryHref("/register", { mock: true })).toBe("/register?mock=1");
    expect(entryHref("/login", { next: "/history", mock: true })).toBe("/login?next=%2Fhistory&mock=1");
  });
});
