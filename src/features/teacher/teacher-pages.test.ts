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
import MockPage from "@/app/teacher/classes/[classId]/mocks/[mockId]/page";
import JoinLinkPage from "@/app/join/[code]/page";
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

describe("teacher pages: no link to /, the task list is /practice with ?mock=1", () => {
  const links = (markup: string) => [...markup.matchAll(/href="(\/[^"]*)"/g)].map((m) => new URL(m[1].replaceAll("&amp;", "&"), "http://x"));
  it.each([
    ["Home (T1)", () => DashboardPage(props(T))],
    ["Create class", () => NewClassPage(props(T))],
    ["Class (T3)", () => ClassPage(props(T, { classId: "demo-class" }))],
    ["Student (T4)", () => StudentPage(props(T, { classId: "demo-class", memberId: DEMO_MEMBER_IDS[0] }))],
    ["Attempt (T5)", () => AttemptPage(props(T, { classId: "demo-class", attemptId: "aziza-2" }))],
    ["Lesson", () => TeacherLessonPage(props({ ...T, class: "demo-class" }, { lessonId: "l-t1" }))],
    ["Join (S1)", () => JoinPage(props({ mock: "1" }))],
  ] as const)("%s", async (_name, page) => {
    const all = links(await html(page())).filter((url) => !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/tasks/"));
    expect(all.filter((url) => url.pathname === "/").map((url) => url.href)).toEqual([]);
    const taskList = all.filter((url) => url.pathname === "/practice");
    expect(taskList.length).toBeGreaterThan(0); // the Practice tab
    for (const url of all) expect(url.searchParams.get("mock"), url.href).toBe("1");
  });
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
    // The one black control is "Start exam laptop" (docs/v1-plan.md, T3); Copy join code and Copy join link are grey.
    expect(markup).toMatch(/<a[^>]*bg-primary text-on-primary[^>]*href="\/teacher\/classes\/demo-class\/exam\?mock=1&amp;as=teacher"[^>]*>.*Start exam laptop/);
    expect(markup).toMatch(/<button[^>]*bg-well[^>]*>.*Copy join code/);
    expect(markup).toContain('data-testid="class-mocks"');
    expect(markup).toContain("Mock 3");
    expect(markup).toContain("2 of 6 finished");
    // The join link is a second, grey button; each student shows their last mock (level, date), and Sardor's Part 2-only note.
    expect(markup).toMatch(/<button[^>]*bg-well[^>]*>Copy join link/);
    expect(markup.match(/data-testid="last-mock"/g)).toHaveLength(6);
    expect(markup).toMatch(/Last mock: <\/span>(B1|B2|C1|Below B1|Not ready) · \d\d\.\d\d\.\d\d/);
    expect(markup).toMatch(/Last mock: <\/span>Not finished · \d\d\.\d\d\.\d\d/);
    expect(markup).toContain("Shares Part 2 only");
    expectMockLinksOnly(markup);
    await expect(ClassPage(props(T, { classId: "someone-else" }))).rejects.toThrow();
  });

  it("Student (T4): mocks first, then single attempts; Open latest mock (or attempt) is the one black button; Part 2-only note", async () => {
    const aziza = await html(StudentPage(props(T, { classId: "demo-class", memberId: "s1" })));
    expect(aziza.indexOf('data-testid="student-mocks"')).toBeGreaterThan(0);
    expect(aziza.indexOf('data-testid="student-mocks"')).toBeLessThan(aziza.indexOf('data-testid="student-attempts"'));
    expect(aziza).toMatch(/<a[^>]*bg-primary text-on-primary[^>]*>.*Open latest mock/);
    expect(aziza).toContain('href="/teacher/classes/demo-class/mocks/aziza-mock?mock=1&amp;as=teacher"');
    expect(aziza).not.toContain("Shares Part 2 only");
    const sardor = await html(StudentPage(props(T, { classId: "demo-class", memberId: "s6" })));
    expect(sardor).toContain("Shares Part 2 only");
    expect(sardor).toMatch(/<a[^>]*bg-primary text-on-primary[^>]*>.*Open latest attempt/);
    expect(sardor).not.toContain('data-testid="student-mocks"');
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
      for (const absent of ["Retry with this goal", "Learn how", "Play recording", "Your result"]) expect(markup).not.toContain(absent);
      expect(markup.replaceAll("nodownload", "")).not.toContain("download"); // no download button or link; the player switches the native one off
      expectMockLinksOnly(markup);
    }
  });

  it("Attempt (T5): the teacher's player (speed chips, no download) or the deleted note; the student's own player is never used", async () => {
    const playable = await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "aziza-2" })));
    expect(playable).toContain('data-testid="teacher-player"');
    expect(playable).toContain("/audio/demo-recording.wav");
    expect(playable).toContain('controlsList="nodownload noplaybackrate"');
    for (const speed of ["1x", "1.25x", "1.5x"]) expect(playable).toContain(`>${speed}<`);
    expect(playable).not.toContain("Your recorded answer");
    const gone = await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "madina-1" })));
    expect(gone).toContain('data-testid="teacher-audio-deleted"');
    expect(gone).not.toContain("<audio");
  });

  it("Attempt (T5) for Part 3: its own read-only page with the same Your view, no black button, no Retry", async () => {
    const markup = await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "aziza-p3" })));
    expect(markup.match(BLACK)).toBeNull();
    expect(markup).not.toMatch(SMALL);
    expect(markup).toContain("Part 3");
    expect(markup).toMatch(/CEFRO: Part 3 · Band \d · /);
    expect(markup).toContain('data-testid="points-card"');
    expect(markup).toContain('data-testid="teacher-player"');
    const buttons = [...(/data-testid="your-view-actions"[^>]*>(.*?)<\/div>/.exec(markup)![1]).matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)</g)];
    expect(buttons.map((b) => b[2])).toEqual(["Agree", "Choose level"]);
    expect(buttons[0][1]).toBe(buttons[1][1]);
    for (const absent of ["Retry with this goal", "Your result", "Your answer"]) expect(markup).not.toContain(absent);
    expectMockLinksOnly(markup);
    // Part 1.2 too.
    const part12 = await html(AttemptPage(props(T, { classId: "demo-class", attemptId: "dilnoza-p12" })));
    expect(part12.match(BLACK)).toBeNull();
    expect(part12).toMatch(/CEFRO: Part 1\.2 · Band \d/);
  });

  it("Student's mock (T6): estimated level, date, status; four part cards with player, transcript, band and grey Agree / Choose level; NO black button", async () => {
    const markup = await html(MockPage(props(T, { classId: "demo-class", mockId: "aziza-mock" })));
    expect(markup.match(BLACK)).toBeNull();
    expect(markup).not.toMatch(SMALL);
    expect(markup).toMatch(/Mock exam · \d\d\.\d\d\.\d\d/);
    expect(markup).toContain('data-testid="mock-status"');
    expect(markup).toContain("Finished");
    expect(markup).toMatch(/data-testid="mock-estimate"[^>]*>(B1|B2|C1|Below B1)</);
    expect(markup.match(/data-testid="mock-part"/g)).toHaveLength(4);
    expect(markup.match(/data-testid="teacher-player"/g)).toHaveLength(4);
    expect(markup.match(/data-testid="transcript-fixes"/g)).toHaveLength(4);
    expect(markup.match(/data-testid="your-view"/g)).toHaveLength(4);
    for (const part of ["Part 1.1", "Part 1.2", "Part 2", "Part 3"]) expect(markup).toContain(part);
    expect(markup).toContain('data-testid="mock-level-view"');
    // Agree and Choose level are the same grey pill everywhere on the page (4 parts + the whole mock).
    const pills = [...markup.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(Agree|Choose level)</g)];
    expect(pills).toHaveLength(10);
    expect(new Set(pills.map((p) => p[1].replace(/disabled:\S+/g, ""))).size).toBe(1);
    expect(pills[0][1]).toContain("bg-well");
    expect(markup.replaceAll("nodownload", "")).not.toContain("download");
    expectMockLinksOnly(markup);
    // A mock that was not finished says so and keeps the parts it has.
    const unfinished = await html(MockPage(props(T, { classId: "demo-class", mockId: "bekzod-mock" })));
    expect(unfinished).toContain("Not finished");
    expect(unfinished).toContain("This part was not done.");
    expect(unfinished.match(BLACK)).toBeNull();
    await expect(MockPage(props(T, { classId: "demo-class", mockId: "nobody" }))).rejects.toThrow();
    await expect(MockPage(props(T, { classId: "someone-else", mockId: "aziza-mock" }))).rejects.toThrow();
  });

  it("the join link opens the normal Join + Share screens: /join/DEMO42 goes to Share, with nothing shared", async () => {
    await expect(JoinLinkPage(props({ mock: "1" }, { code: "demo42" }))).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(JoinLinkPage(props({ mock: "1" }, { code: "demo42" }))).rejects.toMatchObject({ digest: expect.stringContaining("/profile/classes/join?code=DEMO42&mock=1") });
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
    for (const text of [
      "Will see",
      "Won’t see",
      "Earlier attempts, email, exam date.",
      "Every part you practise from now on: 1.1, 1.2, 2 and 3",
      "Every mock you make from now on",
      "Transcripts and feedback",
      "Your recordings (deleted after 30 days)",
      "Your teacher loses access to everything.",
      "anonymous number pair",
      "Not now",
    ]) {
      expect(markup).toContain(text);
    }
    // "Won't see: recordings" is gone, and the screen no longer says Part 2 only.
    expect(markup).not.toMatch(/Won’t see[^]*recordings[^]*Your teacher loses/);
    expect(markup).not.toContain("Part 2 attempt");
    expectScreen(markup, 1);
    expect(markup).toMatch(/<button[^>]*bg-primary text-on-primary[^>]*>Share with this teacher/);
    expectMockLinksOnly(markup, false);
  });

  it("Account page: an old membership gets one 'Share recordings too?' card with two grey buttons; the Account page's one black button stays", async () => {
    const markup = await html(ProfilePage(props({ mock: "1", joined: "DEMO42", legacy: "1" })));
    expect(markup).toContain('data-testid="share-more"');
    expect(markup).toContain("Share recordings too?");
    expect(markup).toContain("Nothing from before that is shared.");
    expect(markup).toMatch(/<button[^>]*bg-well[^>]*>Share recordings too</);
    expect(markup).toMatch(/<button[^>]*bg-well[^>]*>Not now</);
    expectScreen(markup, 1);
    // Not for a membership on the current wording.
    expect(await html(ProfilePage(props({ mock: "1", joined: "DEMO42" })))).not.toContain('data-testid="share-more"');
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
    ["Student's mock", () => MockPage(props({}, { classId: "x", mockId: "y" }))],
    ["Join link", () => JoinLinkPage(props({}, { code: "ABC234" }))],
    ["Lesson", () => TeacherLessonPage(props({ class: "x" }, { lessonId: "l-t1" }))],
    ["Join", () => JoinPage(props({}))],
  ])("%s", async (_name, page) => {
    await expect(page()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
