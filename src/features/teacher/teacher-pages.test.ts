import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_CLASS_TEXT, DEMO_CHANGES_TEXT } from "@/components/ds";

/*
 * The Teacher view in mock mode (`?mock=1`, docs/teacher-plan.md section 6) on a server configured like a Vercel
 * Preview with no variables: the demo teacher, Demo class (DEMO42) and six made-up students, and the student's Join /
 * Share screens, with nothing reaching the database, cookies or identity. One black button per screen and none on the
 * attempt page (T5), where Agree and Choose level are grey and the same size; no text under 11 px; only ?mock=1 links.
 * The real pages are a 404 while the Teacher view is off.
 */

const { touched, forbidden } = vi.hoisted(() => {
  const touched = { db: 0, cookies: 0, identity: 0 };
  const forbidden = (what: "db" | "cookies" | "identity") => () => {
    touched[what] += 1;
    throw new Error(`mock mode touched ${what}`);
  };
  return { touched, forbidden };
});

vi.mock("next/headers", () => ({ cookies: forbidden("cookies"), headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/server/db/client", () => ({ getDb: forbidden("db"), openDatabase: forbidden("db"), createDatabase: forbidden("db") }));
vi.mock("@/server/identity/current-user", () => ({ findCurrentUserId: forbidden("identity"), getCurrentUserId: forbidden("identity") }));
vi.mock("@/server/account/account-store", () => ({ readAccount: forbidden("db"), saveName: forbidden("db") }));

import DashboardPage from "@/app/dashboard/page";
import ProfilePage from "@/app/profile/page";
import JoinPage from "@/app/profile/classes/join/page";
import NewClassPage from "@/app/teacher/classes/new/page";
import ClassPage from "@/app/teacher/classes/[classId]/page";
import StudentPage from "@/app/teacher/classes/[classId]/students/[memberId]/page";
import AttemptPage from "@/app/teacher/classes/[classId]/attempts/[attemptId]/page";
import TeacherLessonPage from "@/app/teacher/lessons/[lessonId]/page";
import { DEMO_MEMBER_IDS } from "@/server/demo/demo-teacher";

type Query = Record<string, string | undefined>;
const props = (query: Query, params: Record<string, string> = {}) => ({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }) as never;
const html = async (element: Promise<unknown> | unknown) => renderToStaticMarkup((await element) as React.ReactElement);
const internalLinks = (markup: string) => [...markup.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
const BLACK = /<(a|button)\b[^>]*class="[^"]*\bbg-primary text-on-primary\b/g;
const SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;
const T = { mock: "1", as: "teacher" };

function expectMockLinksOnly(markup: string, teacher = true) {
  const links = internalLinks(markup).filter((href) => !href.startsWith("/_next/") && !href.startsWith("/tasks/"));
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("mock"), href).toBe("1");
    // The demo teacher's Home and Account keep as=teacher.
    if (teacher && (url.pathname === "/dashboard" || url.pathname === "/profile")) expect(url.searchParams.get("as"), href).toBe("teacher");
  }
}

function expectScreen(markup: string, blacks: number) {
  expect(markup.match(BLACK) ?? [], "black buttons").toHaveLength(blacks);
  expect(markup).not.toMatch(SMALL);
  expect(markup).not.toContain("@example.com".replace("example", "school")); // no real-looking emails
}

beforeEach(() => {
  touched.db = touched.cookies = touched.identity = 0;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  for (const name of ["TRANSCRIPTION_PROVIDER", "EVALUATION_PROVIDER", "GEMINI_API_KEY", "AUTH_SECRET", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  expect(touched).toEqual({ db: 0, cookies: 0, identity: 0 });
});

describe("the demo teacher", () => {
  it("Home (T1): Your classes at the top with Demo class, 6 students; Create class is the one black button", async () => {
    const markup = await html(DashboardPage(props(T)));
    expect(markup).toContain(DEMO_CLASS_TEXT);
    expect(markup).toContain('data-testid="your-classes"');
    expect(markup).toContain("Demo class");
    expect(markup).toContain("6 students");
    expect(markup.indexOf("Your classes")).toBeLessThan(markup.indexOf("Find your level"));
    expectScreen(markup.slice(markup.indexOf('<main id="main"')), 1);
    expect(markup).toMatch(/<a[^>]*bg-primary text-on-primary[^>]*>.*Create class/);
    expect(markup).toContain('href="/teacher/classes/demo-class?mock=1&amp;as=teacher"');
    expectMockLinksOnly(markup);
  });

  it("the demo student's Home has no Your classes", async () => {
    expect(await html(DashboardPage(props({ mock: "1" })))).not.toContain('data-testid="your-classes"');
  });

  it("Create class (T2): the name and the black Create class", async () => {
    const markup = await html(NewClassPage(props(T)));
    expect(markup).toContain("Class name");
    expectScreen(markup, 1);
    expectMockLinksOnly(markup);
  });

  it("Class overview (T3): DEMO42, common problems with counts and an approved lesson, six students, Close class", async () => {
    const markup = await html(ClassPage(props(T, { classId: "demo-class" })));
    expect(markup).toContain("DEMO42");
    expect(markup).toContain("Most common problems");
    expect(markup).toMatch(/Question 3 · Not answered<\/span><span[^>]*>\d of 6 students/);
    expect(markup).toContain('href="/teacher/lessons/l-t1?class=demo-class&amp;mock=1&amp;as=teacher"');
    for (const name of ["Aziza", "Bekzod", "Dilnoza", "Jasur", "Madina", "Sardor"]) expect(markup).toContain(name);
    expect(markup).toContain("Goal met");
    expect(markup).toContain("Close class");
    expectScreen(markup, 1);
    expect(markup).toMatch(/<button[^>]*bg-primary text-on-primary[^>]*>.*Copy join code/);
    expectMockLinksOnly(markup);
    await expect(ClassPage(props(T, { classId: "someone-else" }))).rejects.toThrow();
  });

  it("Student (T4): every demo student, level, skills, shared attempts; Open latest attempt is the one black button", async () => {
    for (const memberId of DEMO_MEMBER_IDS) {
      const markup = await html(StudentPage(props(T, { classId: "demo-class", memberId })));
      expect(markup).toContain('data-testid="student-level"');
      expect(markup).toContain("Remove from class");
      expectScreen(markup, 1);
      expectMockLinksOnly(markup);
    }
    await expect(StudentPage(props(T, { classId: "demo-class", memberId: "nobody" }))).rejects.toThrow();
  });

  it("Attempt (T5): no black button; Agree and Choose level grey and the same size; no player, Retry or Learn how", async () => {
    for (const attemptId of ["aziza-2", "bekzod-1", "jasur-1", "madina-1"]) {
      const markup = await html(AttemptPage(props(T, { classId: "demo-class", attemptId })));
      expect(markup.match(BLACK)).toBeNull();
      expect(markup).not.toMatch(SMALL);
      expect(markup).toMatch(/CEFRO: Part 2 · Band \d · (Below B1|(Lower|Higher) B1|(Lower|Higher) B2|Above B2)/);
      const actions = /data-testid="your-view-actions"[^>]*>(.*?)<\/div>/.exec(markup)![1];
      const buttons = [...actions.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)</g)];
      expect(buttons.map((b) => b[2])).toEqual(["Agree", "Choose level"]);
      expect(buttons[0][1]).toBe(buttons[1][1]); // the same classes: same colour and size
      expect(buttons[0][1]).toContain("bg-well");
      for (const absent of ["Retry with this goal", "Learn how", "Play recording", "<audio", "Your result"]) expect(markup).not.toContain(absent);
      expectMockLinksOnly(markup);
    }
  });

  it("the attempt of a retry shows the comparison only for shared originals", async () => {
    expect(await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "aziza-2" })))).toContain("Goal met");
    expect(await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "aziza-1" })))).not.toContain("Band 2 → ");
  });

  it("the read-only lesson: no black button, no drill, back to the class", async () => {
    const markup = await html(TeacherLessonPage(props({ ...T, class: "demo-class" }, { lessonId: "l-t1" })));
    expect(markup).toContain("Lesson · read-only");
    expect(markup.match(BLACK)).toBeNull();
    expect(markup).not.toContain("Retry with this goal");
    expect(markup).not.toMatch(SMALL);
    expectMockLinksOnly(markup);
  });

  it("Account page: a quiet Your classes link, no student classes", async () => {
    const markup = await html(ProfilePage(props(T)));
    expect(markup).toContain('data-testid="your-classes-link"');
    expect(markup).not.toContain('data-testid="my-classes"');
    expectScreen(markup, 1);
    expectMockLinksOnly(markup);
  });
});

describe("the demo student: Join, Share, My classes", () => {
  it("Join (S1): the code field and the black Continue", async () => {
    const markup = await html(JoinPage(props({ mock: "1" })));
    expect(markup).toContain(DEMO_CHANGES_TEXT);
    expect(markup).toContain("Class code");
    expectScreen(markup, 1);
    expectMockLinksOnly(markup, false);
  });

  it("Share (S2): name prefilled, will / won't see, leaving, the black Share with this teacher, quiet Not now", async () => {
    const markup = await html(JoinPage(props({ mock: "1", code: "demo42" })));
    expect(markup).toContain("Demo teacher · Demo class");
    expect(markup).toMatch(/id="shown-name"[^>]*value="Student"/);
    for (const text of ["Will see", "Won’t see", "Earlier attempts, email, recordings, exam date.", "Your teacher loses access to everything.", "anonymous number pair", "Not now"]) {
      expect(markup).toContain(text);
    }
    expectScreen(markup, 1);
    expect(markup).toMatch(/<button[^>]*bg-primary text-on-primary[^>]*>Share with this teacher/);
    expectMockLinksOnly(markup, false);
  });

  it("Account page: grey Join a class; after joining, the class with Sharing since and a quiet Leave class", async () => {
    const before = await html(ProfilePage(props({ mock: "1" })));
    expect(before).toContain('data-testid="my-classes"');
    expect(before).not.toContain('data-testid="membership"');
    expect(before).toMatch(/<a[^>]*bg-well[^>]*>.*Join a class/);
    const after = await html(ProfilePage(props({ mock: "1", joined: "DEMO42" })));
    expect(after).toContain("Demo teacher · Demo class");
    expect(after).toMatch(/Sharing since \d\d\.\d\d\.\d\d/);
    expect(after).toContain("Leave class");
    for (const markup of [before, after]) {
      expectScreen(markup, 1);
      expectMockLinksOnly(markup, false);
    }
  });
});

describe("real pages while the Teacher view is off (no parent consent yet): 404, nothing read", () => {
  it.each([
    ["Create class", () => NewClassPage(props({}))],
    ["Class", () => ClassPage(props({}, { classId: "x" }))],
    ["Student", () => StudentPage(props({}, { classId: "x", memberId: "y" }))],
    ["Attempt", () => AttemptPage(props({}, { classId: "x", attemptId: "y" }))],
    ["Lesson", () => TeacherLessonPage(props({ class: "x" }, { lessonId: "l-t1" }))],
    ["Join", () => JoinPage(props({}))],
  ])("%s", async (_name, page) => {
    await expect(page()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
