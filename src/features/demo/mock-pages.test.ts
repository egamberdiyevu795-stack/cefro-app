import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_CHANGES_TEXT, DEMO_DATA_TEXT, DEMO_MODE_TEXT, DEMO_RESULT_TEXT } from "@/components/ds";

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
vi.mock("@/server/account/account-store", () => ({ readAccount: forbidden("db"), saveName: forbidden("db") }));

import SiteLayout from "@/app/(site)/layout";
import HomePage from "@/app/(site)/page";
import DashboardPage from "@/app/dashboard/page";
import HistoryPage from "@/app/history/page";
import LessonPage from "@/app/lessons/[lessonId]/page";
import PracticePage from "@/app/practice/speaking/[taskId]/page";
import ResultPage from "@/app/result/page";
import ProfilePage from "@/app/profile/page";
import SettingsPage from "@/app/settings/page";

type Query = Record<string, string | undefined>;
const props = (query: Query, params: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }) as never;
const html = async (element: Promise<unknown> | unknown) => renderToStaticMarkup((await element) as React.ReactElement);

/** Every internal link on the page (href="/…"). */
const internalLinks = (markup: string) => [...markup.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
/** Black buttons and links (not the goal bar's black check square, a glyph). */
const BLACK = /<(a|button)\b[^>]*class="[^"]*\bbg-primary text-on-primary\b/g;
/** Only what is inside <main>. */
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

describe("one black control per screen, the navigation included (grey active tab)", () => {
  it.each([
    ["dashboard", () => DashboardPage(props({ mock: "1" }))],
    ["practice", () => PracticePage(props({ mock: "1" }, { taskId: "b2-part2-a-tradition" }))],
    ["result", () => ResultPage(props({ mock: "1", demo: "demo-5" }))],
    ["history", () => HistoryPage(props({ mock: "1" }))],
    ["lesson", () => LessonPage(props({ mock: "1", demo: "demo-5" }, { lessonId: "l-t1" }))],
    ["profile", () => ProfilePage(props({ mock: "1" }))],
  ] as const)("%s: at most one black control on the whole page; the current tab is grey", async (_name, page) => {
    const markup = await html(page());
    expect((markup.match(BLACK) ?? []).length).toBeLessThanOrEqual(1);
    expect(markup).not.toMatch(/aria-current="page"[^>]*bg-primary|bg-primary[^"]*"[^>]*aria-current="page"/);
  });
});

describe("Account page (/profile) in mock mode", () => {
  it("the demo student, sections in order: account (name, email, level, member since, attempts), exam date, password then sign out, delete last", async () => {
    const markup = await html(ProfilePage(props({ mock: "1" })));
    expect(markup).toContain(DEMO_CHANGES_TEXT);
    expect(markup).toMatch(/data-testid="profile-name"[^>]*>Student</);
    expect(markup).toMatch(/data-testid="profile-email"[^>]*>student@example.com</);
    expect(markup).toContain('data-testid="exam-countdown"');
    expect(markup).toMatch(/data-testid="profile-member-since"[^>]*>Member since \d\d\.\d\d\.\d\d</);
    expect(markup).toMatch(/data-testid="profile-attempts"[^>]*>6 practice attempts</);
    // The demo student's latest scored Part 2 answer is the "A tradition" retry: a real level, not "No level yet".
    expect(markup).toMatch(/data-testid="profile-level"[^>]*>(Below B1|B1|B2|Above B2)</);
    expect(markup).toContain('href="/?mock=1#part-2"');
    const order = ['data-testid="profile-name"', 'data-testid="profile-email"', 'data-testid="profile-level"', 'data-testid="profile-member-since"',
      'data-testid="profile-attempts"', 'data-testid="exam-countdown"', ">Change password<", ">Sign out<", ">Delete my account<"].map((needle) => mainOf(markup).indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).not.toMatch(SMALL);
    expect(markup).not.toMatch(/Coming soon|Target level|Change email|Language|Notifications|Test your microphone/i);
    expectMockLinksOnly(markup);
  });

  it("forms post to the page itself and every submit starts disabled (until the page is ready)", async () => {
    const markup = await html(ProfilePage(props({ mock: "1" })));
    const forms = [...markup.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(form).toMatch(/\bmethod="post"/);
      expect(form).not.toMatch(/\baction=/);
    }
    const submits = [...markup.matchAll(/<button\b[^>]*type="submit"[^>]*>/g)].map((m) => m[0]);
    expect(submits.length).toBeGreaterThan(0);
    for (const submit of submits) expect(submit).toContain('disabled=""');
  });

  it("five tabs: Home, Practice, Lessons, History, Account; the Account tab is a direct link (no menu), the grey current tab", async () => {
    const markup = await html(ProfilePage(props({ mock: "1" })));
    const nav = markup.slice(markup.indexOf('<nav aria-label="Main"'), markup.indexOf("</nav>"));
    const labels = [...nav.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).filter((l) => l !== "Main");
    expect(labels).toEqual(["Home", "Practice", "Lessons", "History", "Account"]);
    expect(nav).not.toContain("aria-haspopup");
    expect(nav).not.toContain("Settings");
    const current = [...markup.matchAll(/<(a|button|span)\b[^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatch(/^<a\b/);
    expect(current[0]).toContain('aria-label="Account"');
    expect(current[0]).toContain('href="/profile?mock=1"');
    expect(current[0]).toContain("bg-well");
    expect(current[0]).not.toContain("bg-primary");
  });

  it("/settings redirects to the Account page, keeping mock mode", async () => {
    const digest = async (query: Query) => {
      try {
        await SettingsPage(props(query));
      } catch (error) {
        return String((error as { digest?: string }).digest);
      }
      return "no redirect";
    };
    expect(await digest({ mock: "1" })).toContain(";/profile?mock=1;");
  });
});

describe("Check microphone on the practice brief", () => {
  it("a grey 'Check microphone' before Start preparation, which stays the only black button", async () => {
    const markup = await html(PracticePage(props({ mock: "1" }, { taskId: "b2-part2-a-tradition" })));
    const main = mainOf(markup);
    expect(main).toContain("Check microphone");
    expect(main).toContain("Nothing is saved or uploaded.");
    expect(main.indexOf("Check microphone")).toBeLessThan(main.indexOf("Start preparation"));
    const check = main.match(/<button\b[^>]*>(?:(?!<\/button>).)*Check microphone/s)![0];
    expect(check).toContain("bg-well");
    expect(check).not.toContain("bg-primary");
    expect(check).toContain('disabled=""'); // waits for the page, like Start preparation
    const black = main.match(BLACK)!;
    expect(black).toHaveLength(1);
    expect(main.slice(main.indexOf(black[0])).replace(/<[^>]+>/g, "").trimStart()).toMatch(/^Start preparation/);
  });
});

describe("lessons in mock mode", () => {
  const ADVICE = "b2-part2-advice-from-someone";

  it("the demo result of 'A tradition' links its Biggest fix to its lesson; a result with no approved lesson has no link", async () => {
    const tradition = await html(ResultPage(props({ mock: "1", demo: "demo-5" })));
    expect(tradition).toContain("A tradition");
    expect(tradition).toContain('href="/lessons/l-t1?demo=demo-5&amp;mock=1"');
    expect(tradition).toContain("Learn how");
    expect(mainOf(tradition).match(BLACK)).toHaveLength(1);
    expectMockLinksOnly(tradition);
    for (const query of [{ demo: "demo-6" }, { demo: "demo-4" }, { anchor: "A2-b1-all-three" }]) {
      expect(await html(ResultPage(props({ mock: "1", ...query }))), JSON.stringify(query)).not.toContain("Learn how");
    }
    expect(await html(ResultPage(props({ mock: "1", anchor: "A1-b1-only-q3", run: "2" })))).toContain('href="/lessons/l-t1?anchor=A1-b1-only-q3&amp;run=2&amp;mock=1"');
    expect(await html(ResultPage(props({ mock: "1", demo: `picture.${ADVICE}` })))).toContain(`href="/lessons/l-t8?demo=picture.${ADVICE}&amp;mock=1"`);
    expect(await html(ResultPage(props({ mock: "1", demo: `bare.${ADVICE}` })))).toContain(`href="/lessons/l-t4-b2?demo=bare.${ADVICE}&amp;mock=1"`);
  });

  it.each([
    ["l-t1", { demo: "demo-5" }, "A tradition", 'You did not answer Question 3: "Should young people keep old traditions in the modern world? Why?".', `/practice/speaking/b2-part2-a-tradition?mock=1&retry=demo-5`],
    ["l-t1", { anchor: "A1-b1-only-q3", run: "1" }, "Advice from someone", "You did not answer Question 1", `/practice/speaking/${ADVICE}?mock=1&retry=A1-b1-only-q3&run=1`],
    ["l-t8", { demo: `picture.${ADVICE}` }, "Advice from someone", "Your answer described the picture, but it did not answer the three questions.", `/practice/speaking/${ADVICE}?mock=1&retry=picture.${ADVICE}`],
    ["l-t4-b2", { demo: `bare.${ADVICE}` }, "Advice from someone", "Your answer to Question 3 was too short to count:", `/practice/speaking/${ADVICE}?mock=1&retry=bare.${ADVICE}`],
  ] as const)("%s from %j: why, explanation, examples, drill, one black button that starts the retry with its goal", async (slug, query, taskTitle, why, retryHref) => {
    const markup = await html(LessonPage(props({ mock: "1", ...query }, { lessonId: slug })));
    const main = mainOf(markup);
    expect(markup).toContain(escaped(DEMO_MODE_TEXT));
    expect(markup).toContain(escaped(taskTitle));
    expect(markup).toContain(escaped(why));
    for (const section of ["Why this lesson", "How it works", "Examples", "Self-check drill", "Goal for your retry"]) expect(markup).toContain(section);
    // No checklist on the page: the per-prompt self-checks cover it.
    expect(markup).not.toContain("Checklist");
    expect(markup).not.toContain('type="checkbox"');
    expect((markup.match(/data-testid="lesson-example"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Exactly one black button: "Retry with this goal", to the same retry as the result page's.
    const black = main.match(BLACK) ?? [];
    expect(black).toHaveLength(1);
    const blackHref = /<a\b[^>]*class="[^"]*\bbg-primary text-on-primary[^"]*"[^>]*href="([^"]*)"/.exec(main)?.[1].replaceAll("&amp;", "&");
    expect(blackHref).toBe(retryHref);
    expect(main).toContain("Retry with this goal");
    // On the whole screen (navigation included) the retry is the only black control; Lessons is the current tab, in grey.
    expect(markup.match(/bg-primary text-on-primary/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Lessons (current section)" aria-current="page"');
    expect(markup).not.toMatch(/aria-label="Practice"[^>]*aria-current="page"/);
    // Each drill prompt is labelled with the drill-topic question it practises.
    expect((markup.match(/data-testid="drill-prompt"/g) ?? []).length).toBe(3);
    expect(markup).toMatch(/<span class="sr-only">Practises <\/span>Q[123]/);
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it("the same neutral drill whatever task is retried; no advice prompts, no note about another task", async () => {
    const drillOf = (markup: string) => markup.slice(markup.indexOf('id="drill-title"'), markup.indexOf('id="retry-title"'));
    const tradition = drillOf(await html(LessonPage(props({ mock: "1", demo: "demo-5" }, { lessonId: "l-t1" }))));
    const advice = drillOf(await html(LessonPage(props({ mock: "1", demo: "demo-1" }, { lessonId: "l-t1" }))));
    expect(tradition).toBe(advice);
    expect(tradition).toContain('data-testid="drill-topic"');
    expect(tradition).toContain("Describe a place you like to visit.");
    expect(tradition).not.toContain("These prompts are about");
    for (const [lessonId, demo] of [["l-t1", "demo-5"], ["l-t8", `picture.${ADVICE}`], ["l-t4-b2", `bare.${ADVICE}`]] as const) {
      const prompts = [...drillOf(await html(LessonPage(props({ mock: "1", demo }, { lessonId })))).matchAll(/<p class="text-body text-fg">(.*?)<\/p>/g)].map((m) => m[1]);
      expect(prompts.join(" "), lessonId).not.toMatch(/advice/i);
    }
  });

  it("not found: an unknown lesson, a lesson the result does not lead to, a result with no lesson, no result at all", async () => {
    for (const [lessonId, query] of [
      ["nope", { demo: "demo-5" }],
      ["l-t8", { demo: "demo-5" }],
      ["l-t4-b2", { demo: "demo-5" }],
      ["l-t1", { demo: "demo-6" }],
      ["l-t1", { demo: "nope" }],
      ["l-t1", { anchor: "A2-b1-all-three" }],
      ["l-t1", {}],
    ] as const) {
      await expect(LessonPage(props({ mock: "1", ...query }, { lessonId })), `${lessonId} ${JSON.stringify(query)}`).rejects.toThrow();
    }
  });
});

describe("real pages on the same Preview keep refusing", () => {
  it("a lesson for a real attempt fails the configuration check, never touching the database", async () => {
    await expect(LessonPage(props({ attempt: "some-attempt" }, { lessonId: "l-t1" }))).rejects.toMatchObject({ status: 503 });
  });

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
