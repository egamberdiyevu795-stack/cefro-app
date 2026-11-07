import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_DATA_TEXT, DEMO_MODE_TEXT, DEMO_RESULT_TEXT } from "@/components/ds";

/*
 * Mock mode (`?mock=1`) on a server configured like a Vercel Preview with no variables: every mock page renders, with
 * its demo label and only mock-mode links, while anything that could reach the database, the caller's cookies or
 * their identity throws (and is counted). The real pages keep refusing.
 */

const { touched, forbidden } = vi.hoisted(() => {
  const touched = { db: 0, cookies: 0, identity: 0, mockHeader: false };
  const forbidden = (what: "db" | "cookies" | "identity") => () => {
    touched[what] += 1;
    throw new Error(`mock mode touched ${what}`);
  };
  return { touched, forbidden };
});

vi.mock("next/headers", () => ({
  cookies: forbidden("cookies"),
  // Only the (site) layout reads a header: whether the proxy marked the request as mock mode.
  headers: async () => new Headers(touched.mockHeader ? { "x-cefro-mock": "1" } : {}),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/server/db/client", () => ({ getDb: forbidden("db"), openDatabase: forbidden("db"), createDatabase: forbidden("db") }));
vi.mock("@/server/identity/current-user", () => ({ findCurrentUserId: forbidden("identity"), getCurrentUserId: forbidden("identity") }));

import SiteLayout from "@/app/(site)/layout";
import HomePage from "@/app/(site)/page";
import DashboardPage from "@/app/dashboard/page";
import HistoryPage from "@/app/history/page";
import PracticePage from "@/app/practice/speaking/[taskId]/page";
import ResultPage from "@/app/result/page";

type Query = Record<string, string | undefined>;
const props = (query: Query, params: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }) as never;
const html = async (element: Promise<unknown> | unknown) => renderToStaticMarkup((await element) as React.ReactElement);

/** Every internal link on the page (href="/…"). */
const internalLinks = (markup: string) => [...markup.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
/** Black buttons and links (not the goal bar's black check square, a glyph). */
const BLACK = /<(a|button)\b[^>]*class="[^"]*\bbg-primary text-on-primary\b/g;
/** Only what is inside <main> (the nav's active square is outside it). */
const mainOf = (markup: string) => markup.slice(markup.indexOf('<main id="main"'), markup.indexOf("</main>"));
/** As the markup has it (React escapes the apostrophe). */
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;

function expectMockLinksOnly(markup: string) {
  const links = internalLinks(markup).filter((href) => !href.startsWith("/_next/") && !href.startsWith("/tasks/"));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
}

beforeEach(() => {
  touched.db = touched.cookies = touched.identity = 0;
  touched.mockHeader = false;
  // A Vercel Preview with no variables: production, on Vercel, nothing configured.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  for (const name of ["TRANSCRIPTION_PROVIDER", "EVALUATION_PROVIDER", "GEMINI_API_KEY", "AUTH_SECRET", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  // Nothing in mock mode may have reached the database, the cookies or the caller's identity.
  expect(touched).toMatchObject({ db: 0, cookies: 0, identity: 0 });
});

describe("mock pages on a Preview with no configuration", () => {
  it("task list (/) in its layout: demo label, every task opens its brief in mock mode, the demo account", async () => {
    touched.mockHeader = true; // set by src/proxy.ts for ?mock=1
    const markup = await html(SiteLayout({ children: await HomePage(props({ mock: "1" })) }));
    expect(markup).toContain(escaped(DEMO_MODE_TEXT));
    expect(markup).toContain('href="/practice/speaking/b2-part2-advice-from-someone?mock=1"');
    expectMockLinksOnly(markup);
  });

  it("dashboard: the demo student (levels, retry goal or next task, exam countdown), demo label, one black button", async () => {
    const markup = await html(DashboardPage(props({ mock: "1" })));
    expect(markup).toContain(DEMO_DATA_TEXT);
    expect(markup).toContain('data-testid="exam-countdown"');
    expect(markup).toContain("Recent attempts");
    expect(markup).toContain("Biggest fix");
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it("History: the demo attempts, a retry, the filter and the chart; demo label; every link in mock mode", async () => {
    for (const query of [{ mock: "1" }, { mock: "1", part: "2" }]) {
      const markup = await html(HistoryPage(props(query)));
      expect(markup).toContain(DEMO_DATA_TEXT);
      expect(markup).toContain("Retry");
      expect(markup).toContain("Band over time");
      expect(mainOf(markup)).not.toMatch(BLACK);
      expect(markup).not.toMatch(SMALL);
      expectMockLinksOnly(markup);
    }
  });

  it("a demo result shows its own task", async () => {
    const tradition = await html(ResultPage(props({ mock: "1", demo: "demo-6" })));
    expect(tradition).toContain("A tradition");
    expect(tradition).toContain("Goal met");
    expect(tradition).not.toContain("Advice from someone");
    const team = await html(ResultPage(props({ mock: "1", demo: "demo-3" })));
    expect(team).toContain("Working in a team");
    await expect(ResultPage(props({ mock: "1", demo: "nope" }))).rejects.toThrow(); // not found
  });

  it("practice brief (first try and retry): demo label, one black button, mock links", async () => {
    for (const [taskId, query] of [
      ["b2-part2-happy-day", { mock: "1" }],
      ["b2-part2-happy-day", { mock: "1", retry: "A2-b1-all-three", run: "1" }],
      ["b2-part2-a-tradition", { mock: "1", retry: "demo-5" }],
    ] as const) {
      const markup = await html(PracticePage(props(query, { taskId })));
      if (query.retry === "demo-5") {
        // The demo result's goal, for this task's own question 3.
        expect(markup).toContain('data-testid="goal-card"');
        expect(markup).toContain(escaped('Answer question 3: "Should young people keep old traditions in the modern world? Why?"'));
      }
      expect(markup).toContain(escaped(DEMO_MODE_TEXT));
      expect(mainOf(markup).match(BLACK)).toHaveLength(1);
      expectMockLinksOnly(markup);
    }
  });

  it("result (scored, retry, scoring): demo result label, mock links", async () => {
    for (const query of [
      { mock: "1" },
      { mock: "1", state: "retry" },
      { mock: "1", state: "scoring", next: "1" },
      {},
      { mock: "1", demo: "demo-1" },
      { mock: "1", demo: "demo-6" },
      { mock: "1", demo: "demo-3" },
      { mock: "1", demo: "answer.b2-part2-happy-day", state: "scoring", next: "1" },
    ]) {
      const markup = await html(ResultPage(props(query)));
      expect(markup).toContain(DEMO_RESULT_TEXT);
      expectMockLinksOnly(markup);
    }
  });
});

describe("real pages on the same Preview keep refusing", () => {
  it("History, the practice page and the (site) pages fail the configuration check; no demo label anywhere", async () => {
    await expect(HistoryPage(props({}))).rejects.toMatchObject({ status: 503, code: "service_not_configured" });
    await expect(PracticePage(props({}, { taskId: "b2-part2-happy-day" }))).rejects.toMatchObject({ status: 503 });
    await expect(SiteLayout({ children: null })).rejects.toMatchObject({ status: 503 });
    // ?mock=0 or any other value is not mock mode.
    await expect(HistoryPage(props({ mock: "0" }))).rejects.toMatchObject({ status: 503 });
  });

  it("the real dashboard reads the caller's identity (and so fails without a database), never the demo", async () => {
    await expect(DashboardPage(props({}))).rejects.toThrow("mock mode touched identity");
    touched.identity = 0; // expected here: this is the real page
  });
});
