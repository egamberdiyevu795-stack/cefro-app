import { renderToStaticMarkup } from "react-dom/server";
import { RECORDING_LOCKED_MESSAGE } from "@/domain/consent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_CHANGES_TEXT, DEMO_DATA_TEXT, DEMO_ENTRY_TEXT, DEMO_MODE_TEXT, DEMO_RESULT_TEXT } from "@/components/ds";

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
  // Only the (site) and (entry) layouts read a header: whether the proxy marked the request as mock mode.
  headers: async () => new Headers(touched.mockHeader ? { "x-cefro-mock": "1" } : {}),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/server/db/client", () => ({ getDb: forbidden("db"), openDatabase: forbidden("db"), createDatabase: forbidden("db") }));
vi.mock("@/server/identity/current-user", () => ({ findCurrentUserId: forbidden("identity"), getCurrentUserId: forbidden("identity"), isSignedIn: forbidden("identity") }));
vi.mock("@/server/account/account-store", () => ({ readAccount: forbidden("db"), saveName: forbidden("db") }));

import EntryLayout from "@/app/(entry)/layout";
import LoginPage from "@/app/(entry)/login/page";
import HomePage from "@/app/(entry)/page";
import RegisterPage from "@/app/(entry)/register/page";
import SiteLayout from "@/app/(site)/layout";
import TaskListPage from "@/app/(site)/practice/page";
import DashboardPage from "@/app/dashboard/page";
import HistoryPage from "@/app/history/page";
import LessonPage from "@/app/lessons/[lessonId]/page";
import LessonsPage from "@/app/lessons/page";
import { ALL_LESSONS, shownLessons } from "@/content/lessons";
import { NO_RESULT_TEXT } from "@/features/lessons/no-result";
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
  it("task list (/practice) in its layout: demo label, every task opens its brief in mock mode, the demo account", async () => {
    touched.mockHeader = true; // set by src/proxy.ts for ?mock=1
    const markup = await html(SiteLayout({ children: await TaskListPage(props({ mock: "1" })) }));
    expect(markup).toContain(escaped(DEMO_MODE_TEXT));
    expect(markup).toContain('href="/practice/speaking/b2-part2-advice-from-someone?mock=1"');
    expectMockLinksOnly(markup);
  });

  it("signed-out home (/?mock=1): nobody is looked up, one black button, See a demo result opens a demo result", async () => {
    touched.mockHeader = true;
    const markup = await html(EntryLayout({ children: await HomePage(props({ mock: "1" })) }));
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).toContain('href="/result?demo=demo-5&amp;mock=1"');
    expect(markup).toContain('href="/register?mock=1"');
    expect(markup).toContain('href="/login?mock=1"');
    expect(markup).not.toMatch(SMALL);
    expect(markup).not.toContain('aria-label="Main"'); // no navigation tabs signed out
    expectMockLinksOnly(markup);
  });

  it.each([
    ["sign in", LoginPage, "Sign in"],
    ["Create account", RegisterPage, "Create account"],
  ] as const)("%s (?mock=1): the form, the demo label, one black button, mock links only", async (_name, Page, submit) => {
    touched.mockHeader = true;
    const markup = await html(EntryLayout({ children: await Page(props({ mock: "1" })) }));
    expect(markup).toContain(DEMO_ENTRY_TEXT);
    expect(markup).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${submit}</button>`));
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).not.toMatch(SMALL);
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

  it.each(["waiting", "withdrawn", "guest"] as const)("practice brief, locked preview (?consent=%s): the kind lock, no recording controls, one black button", async (lock) => {
    const markup = await html(PracticePage(props({ mock: "1", consent: lock }, { taskId: "b2-part2-happy-day" })));
    expect(markup).toContain(`data-lock="${lock}"`);
    expect(markup).toContain(escaped(RECORDING_LOCKED_MESSAGE[lock]));
    if (lock === "waiting") expect(markup).toContain("Ask your parent or guardian to confirm, then we will unlock recording.");
    expect(markup).not.toContain("Start preparation");
    expect(markup).not.toContain("Check microphone");
    expect(markup).toContain("Answer all 3 questions"); // the task can still be read
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it("practice brief in mock mode is never locked without ?consent= (CONSENT_REQUIRED does not apply to mock mode)", async () => {
    vi.stubEnv("CONSENT_REQUIRED", "true");
    const markup = await html(PracticePage(props({ mock: "1", consent: "nonsense" }, { taskId: "b2-part2-happy-day" })));
    expect(markup).toContain("Start preparation");
    expect(markup).not.toContain('data-testid="recording-locked"');
  });

  it("result (scored, retry, scoring): demo result label, mock links", async () => {
    for (const query of [
      { mock: "1" },
      { mock: "1", state: "retry" },
      { mock: "1", state: "scoring", next: "1" },
      { demo: "demo-1" },
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

  it("a bare /result (no demo key, no mock mode) is not found: never the saved demo results", async () => {
    for (const query of [{}, { anchor: "A2-b1-all-three" }, { state: "retry" }, { mock: "0" }]) {
      await expect(ResultPage(props(query)), JSON.stringify(query)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
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

describe("links that used to open the task list at / now open /practice, keeping ?mock=1", () => {
  it.each([
    ["dashboard", () => DashboardPage(props({ mock: "1" }))],
    ["history", () => HistoryPage(props({ mock: "1" }))],
    ["practice brief", () => PracticePage(props({ mock: "1" }, { taskId: "b2-part2-a-tradition" }))],
    ["demo result (Retry with this goal)", () => ResultPage(props({ mock: "1", demo: "demo-5" }))],
    ["saved-runs result", () => ResultPage(props({ mock: "1" }))],
    ["lesson", () => LessonPage(props({ mock: "1", demo: "demo-5" }, { lessonId: "l-t1" }))],
    ["Account page (Go to Part 2)", () => ProfilePage(props({ mock: "1" }))],
  ] as const)("%s: no link to /, the task list is /practice with ?mock=1", async (_name, page) => {
    const markup = await html(page());
    const links = internalLinks(markup).map((href) => new URL(href, "http://x"));
    expect(links.filter((url) => url.pathname === "/").map((url) => url.href)).toEqual([]);
    const taskList = links.filter((url) => url.pathname === "/practice");
    expect(taskList.length).toBeGreaterThan(0); // at least the Practice tab
    for (const url of taskList) expect(url.searchParams.get("mock"), url.href).toBe("1");
    expectMockLinksOnly(markup);
  });

  it("the Account page's Go to Part 2 opens the Part 2 section of /practice", async () => {
    expect(await html(ProfilePage(props({ mock: "1" })))).toContain('href="/practice?mock=1#part-2"');
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
    expect(markup).toContain('href="/practice?mock=1#part-2"');
    const order = ['data-testid="profile-name"', 'data-testid="profile-email"', 'data-testid="profile-level"', 'data-testid="profile-member-since"',
      'data-testid="profile-attempts"', 'data-testid="exam-countdown"', ">Change password<", ">Sign out<", ">Delete my account<"].map((needle) => mainOf(markup).indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mainOf(markup).match(BLACK)).toHaveLength(1);
    expect(markup).not.toMatch(SMALL);
    expect(markup).not.toMatch(/Coming soon|Target level|Change email|Language|Notifications|Test your microphone/i);
    expectMockLinksOnly(markup);
  });

  it("pilot consent preview (&consent=): the read-only Recording consent section after the account; none without it", async () => {
    expect(await html(ProfilePage(props({ mock: "1" })))).not.toContain('data-testid="consent-status"');
    for (const [preview, title] of [["waiting", "Waiting for consent"], ["granted", "Consent recorded on "], ["withdrawn", "Consent withdrawn on "]] as const) {
      const markup = mainOf(await html(ProfilePage(props({ mock: "1", consent: preview }))));
      expect(markup).toContain(`data-status="${preview}"`);
      expect(markup).toContain(title);
      expect(markup).toContain("Recordings are deleted 30 days after scoring.");
      expect(markup.indexOf('data-testid="consent-status"')).toBeGreaterThan(markup.indexOf('data-testid="profile-attempts"'));
      expect(markup.indexOf('data-testid="consent-status"')).toBeLessThan(markup.indexOf('data-testid="exam-countdown"'));
      expect(markup.match(BLACK)).toHaveLength(1);
      expect(markup).not.toMatch(SMALL);
    }
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
    expect(markup).toMatch(/<a aria-label="Lessons" aria-current="page"[^>]*href="\/lessons\?mock=1"/);
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

  it("/lessons: every approved lesson (title and its Variant field only), each a link to its lesson; no black button", async () => {
    const markup = await html(LessonsPage(props({ mock: "1" })));
    const main = mainOf(markup);
    const links = [...main.matchAll(/<a\b[^>]*data-testid="lesson-link"[^>]*href="([^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
    expect(links).toEqual(shownLessons().map((l) => `/lessons/${l.slug}?mock=1`));
    expect(links.length).toBe(3);
    for (const lesson of shownLessons()) {
      expect(main).toContain(escaped(lesson.title));
      expect(main).toContain(escaped(lesson.variantLabel));
    }
    // Drafts never: a draft copy of a lesson is not listed.
    expect(shownLessons([...ALL_LESSONS, { ...ALL_LESSONS[0], slug: "draft-x", title: "Draft only", status: "draft" }]).map((l) => l.slug)).not.toContain("draft-x");
    expect(main.match(BLACK)).toBeNull();
    expect(markup).toMatch(/<a aria-label="Lessons" aria-current="page"[^>]*href="\/lessons\?mock=1"/);
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it.each(["l-t1", "l-t8", "l-t4-b2"])("%s opened from the list (no result): the lesson and drill, no why or goal, one black 'Go to Part 2'", async (slug) => {
    const markup = await html(LessonPage(props({ mock: "1" }, { lessonId: slug })));
    const main = mainOf(markup);
    for (const section of ["How it works", "Examples", "Self-check drill", NO_RESULT_TEXT.practiseTitle]) expect(markup).toContain(section);
    for (const absent of ["Why this lesson", "Goal for your retry", "Retry with this goal", "Your result", "Lesson for your biggest fix"]) expect(markup).not.toContain(absent);
    expect(markup).not.toContain('data-testid="lesson-why"');
    const black = main.match(BLACK) ?? [];
    expect(black).toHaveLength(1);
    expect(markup.match(/bg-primary text-on-primary/g)).toHaveLength(1);
    const blackHref = /<a\b[^>]*class="[^"]*\bbg-primary text-on-primary[^"]*"[^>]*href="([^"]*)"/.exec(main)?.[1].replaceAll("&amp;", "&");
    expect(blackHref).toBe("/practice?mock=1#part-2");
    expect(main).toContain(NO_RESULT_TEXT.practiseButton);
    expect(main).toContain('href="/lessons?mock=1"'); // back to the list
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it("every approved lesson is a Part 2 lesson (the no-result wording says Part 2)", () => {
    for (const lesson of shownLessons()) expect(lesson.parts, lesson.slug).toEqual([2]);
  });

  it("not found: an unknown lesson, a lesson the result does not lead to, a result with no lesson, a wrong result", async () => {
    for (const [lessonId, query] of [
      ["nope", { demo: "demo-5" }],
      ["l-t8", { demo: "demo-5" }],
      ["l-t4-b2", { demo: "demo-5" }],
      ["l-t1", { demo: "demo-6" }],
      ["l-t1", { demo: "nope" }],
      ["l-t1", { anchor: "A2-b1-all-three" }],
      ["l-t1", { attempt: "" }],
    ] as const) {
      await expect(LessonPage(props({ mock: "1", ...query }, { lessonId })), `${lessonId} ${JSON.stringify(query)}`).rejects.toThrow();
    }
  });
});

describe("real pages on the same Preview keep refusing", () => {
  it("a lesson for a real attempt fails the configuration check, never touching the database", async () => {
    await expect(LessonPage(props({ attempt: "some-attempt" }, { lessonId: "l-t1" }))).rejects.toMatchObject({ status: 503 });
  });

  it("the real Lessons list and a real lesson without a result fail the configuration check", async () => {
    await expect(LessonsPage(props({}))).rejects.toMatchObject({ status: 503 });
    await expect(LessonPage(props({}, { lessonId: "l-t1" }))).rejects.toMatchObject({ status: 503 });
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
