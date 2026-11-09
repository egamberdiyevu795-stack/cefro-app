import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/headers", async () => (await import("../../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
}));
vi.setConfig({ testTimeout: 60_000 });

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardPage from "@/app/dashboard/page";
import JoinPage from "@/app/profile/classes/join/page";
import ProfilePage from "@/app/profile/page";
import AttemptPage from "@/app/teacher/classes/[classId]/attempts/[attemptId]/page";
import ClassPage from "@/app/teacher/classes/[classId]/page";
import StudentPage from "@/app/teacher/classes/[classId]/students/[memberId]/page";
import { createElement } from "react";
import { suggestedShownName } from "@/domain/teacher/rules";
import { JoinClass } from "@/features/teacher/JoinClass";
import { readAccount } from "@/server/account/account-store";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { findCurrentUserId } from "@/server/identity/current-user";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classMembers, users } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { PASSWORD, signUp } from "../../../../test/auth-helpers";
import { TASK_ID } from "../../../../test/db-helpers";
import { fakeWebm } from "../../../../test/fixtures";
import { jar } from "../../../../test/next-headers-mock";
import { GET as getMe } from "../account/me/route";
import { PUT as putName } from "../account/name/route";
import { POST as postLookup } from "../classes/lookup/route";
import { POST as postShare } from "../classes/route";
import { POST as postSession } from "../sessions/route";
import { POST as postAttempt } from "../speaking/attempts/route";
import { GET as getAttempt } from "./classes/[classId]/attempts/[attemptId]/route";
import { GET as getClass } from "./classes/[classId]/route";
import { GET as getStudent } from "./classes/[classId]/students/[memberId]/route";
import { GET as getClasses, POST as postClass } from "./classes/route";

/*
 * Privacy: no part of a student's email ever reaches a teacher (every teacher API response and page) or the Share
 * screen's "Name your teacher sees". A name is never built from the email: an account created by the old sign-up form
 * (named after the email's local part) counts as having no name, and a shown name that is (part of) the email is
 * refused at Share, or shown to the teacher as "Student" if one was stored before this rule.
 */

/** A student email whose every part is unusual enough to be searched for in any page or response. */
const EMAIL = "qx7handle.wq9@mailhost-example.com";
const PARTS = ["qx7handle", "wq9", "mailhost", "mailhost-example.com", EMAIL];
const LEGACY_EMAIL = "zk4oldform@legacyhost-example.com";
const LEGACY_PARTS = ["zk4oldform", "legacyhost"];

let db: Db;
let dir: string;
let ip = 0;
type Browser = Map<string, string>;

const actAs = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
const snapshot = (): Browser => new Map(jar);
const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const props = (params: Record<string, string> = {}, query: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }) as never;
const render = async (page: Promise<unknown>) => renderToStaticMarkup((await page) as React.ReactElement);

async function account(email: string, name?: string): Promise<Browser> {
  jar.clear();
  expect((await signUp(email, PASSWORD, { ip: `10.30.0.${++ip}`, name })).status).toBe(200);
  return snapshot();
}

async function practise(): Promise<string> {
  const sessionId = ((await (await postSession()).json()) as { sessionId: string }).sessionId;
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  form.set("sessionId", sessionId);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  expect(response.status).toBe(201);
  const id = ((await response.json()) as { attempt: { id: string } }).attempt.id;
  while (afterTasks.length) await afterTasks.shift()!();
  return id;
}

/**
 * The Share screen (S2, "Name your teacher sees") as the join page builds it for the signed-in student: the name it
 * prefills comes from `suggestedShownName(readAccount(...).name)`, exactly as in src/app/profile/classes/join/page.tsx.
 */
async function shareScreen(): Promise<{ markup: string; prefilled: string }> {
  const account = await readAccount(await findCurrentUserId());
  expect(account.kind).toBe("registered");
  const prefilled = suggestedShownName(account.kind === "registered" ? account.name : null);
  const markup = renderToStaticMarkup(
    createElement(JoinClass, { suggestedName: prefilled, accountHref: "/profile", demo: false, initialInvite: { className: "Group B", teacherName: "Ms Karimova" }, initialCode: "ABC234" }),
  );
  expect(markup).toContain('name="shownName"');
  return { markup, prefilled };
}

function expectNoPart(text: string, parts: readonly string[], where: string) {
  for (const part of parts) expect(text.toLowerCase(), `${where} contains "${part}"`).not.toContain(part.toLowerCase());
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-email-privacy-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  resetJoinLimiterForTesting();
  setTeacherLiveForTesting(true);
  afterTasks.length = 0;
  jar.clear();
});
afterEach(() => {
  setTeacherLiveForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("a student's email never reaches a teacher or the Share screen", () => {
  it("no name typed at sign-up: none stored, none shown; the Share screen's name starts empty", async () => {
    const student = await account(EMAIL);
    expect((await db.select({ name: users.name }).from(users).where(eq(users.email, EMAIL)).get())!.name).toBeNull();
    actAs(student);
    expect(await (await getMe()).json()).toEqual({ state: "authenticated", email: EMAIL, name: null });
    expectNoPart(await render(JoinPage(props())), PARTS, "Join page");
    const share = await shareScreen();
    expect(share.prefilled).toBe(""); // typed by the student, never prefilled from the email
    expectNoPart(share.markup, PARTS, "Share screen");
  });

  it("an account the old form named after its email counts as having no name (Account menu, Profile, Share screen)", async () => {
    const legacy = await account(LEGACY_EMAIL);
    // What the old sign-up form stored: the email's local part as typed.
    await db.update(users).set({ name: "ZK4oldform" }).where(eq(users.email, LEGACY_EMAIL)).run();
    actAs(legacy);
    expect(((await (await getMe()).json()) as { name: unknown }).name).toBeNull();
    const profile = await render(ProfilePage(props()));
    expect(profile).not.toMatch(/data-testid="profile-name"[^>]*>ZK4oldform</i);
    expectNoPart(await render(JoinPage(props())), LEGACY_PARTS, "Join page");
    const share = await shareScreen();
    expect(share.prefilled).toBe("");
    expectNoPart(share.markup, LEGACY_PARTS, "Share screen");
  });

  it("Share refuses a shown name that is the email, its local part or its domain; a typed name is shared", async () => {
    const teacher = await account("teacher@school.example", "Ms Karimova");
    await db.update(users).set({ role: "teacher" }).where(eq(users.email, "teacher@school.example")).run();
    const { class: cls } = (await (await postClass(req("/x", "POST", { name: "Group B" }), ctx({}))).json()) as { class: { id: string; joinCode: string } };
    const student = await account(EMAIL);
    actAs(student);
    for (const shownName of [EMAIL, "qx7handle.wq9", "QX7HANDLE.WQ9", "qx7handle.wq9 A", "mailhost-example.com"]) {
      const response = await postShare(req("/x", "POST", { code: cls.joinCode, shownName }), ctx({}));
      expect(response.status, shownName).toBe(400);
      expect(((await response.json()) as { error: { message: string } }).error.message, shownName).toMatch(/email address/);
    }
    expect((await db.select().from(classMembers).all())).toEqual([]);
    expect((await postLookup(req("/x", "POST", { code: cls.joinCode }), ctx({}))).status).toBe(200);
    expect((await postShare(req("/x", "POST", { code: cls.joinCode, shownName: "Dilnoza" }), ctx({}))).status).toBe(201);
    const shared = await practise();
    const memberId = (await db.select().from(classMembers).get())!.id;

    // A legacy share (stored before this rule) whose shown name is the other student's local part.
    const legacy = await account(LEGACY_EMAIL);
    const legacyId = (await db.select({ id: users.id }).from(users).where(eq(users.email, LEGACY_EMAIL)).get())!.id;
    await db.insert(classMembers).values({ id: newId(), classId: cls.id, studentUserId: legacyId, shownName: "zk4oldform", sharedAt: new Date(Date.now() - 1000).toISOString(), shareTextVersion: "2026-11-07" }).run();
    actAs(legacy);
    await practise();

    // Everything the teacher can read: every API response and every page.
    actAs(teacher);
    const c = { classId: cls.id };
    const texts: [string, string][] = [
      ["GET classes", await (await getClasses(req("/x"), ctx({}))).text()],
      ["GET class", await (await getClass(req("/x"), ctx(c))).text()],
      ["GET student", await (await getStudent(req("/x"), ctx({ ...c, memberId }))).text()],
      ["GET attempt", await (await getAttempt(req("/x"), ctx({ ...c, attemptId: shared }))).text()],
      ["dashboard page", await render(DashboardPage(props()))],
      ["class page", await render(ClassPage(props(c)))],
      ["student page", await render(StudentPage(props({ ...c, memberId })))],
      ["attempt page", await render(AttemptPage(props({ ...c, attemptId: shared })))],
    ];
    const classBody = texts[1][1];
    expect(classBody).toContain("Dilnoza");
    expect(classBody).toContain('"name":"Student"'); // the legacy share, shown without the email's part
    for (const [where, text] of texts) {
      expectNoPart(text, PARTS, where);
      expectNoPart(text, LEGACY_PARTS, where);
    }
  });
});

describe("server-side name rules: sign-up, Account page, Share", () => {
  it("sign-up: empty = no name; trimmed; 1–50 characters; never an email address", async () => {
    expect((await signUp("one@example.com", PASSWORD, { ip: "10.31.0.1", name: "   " })).status).toBe(200);
    expect((await db.select({ name: users.name }).from(users).where(eq(users.email, "one@example.com")).get())!.name).toBeNull();
    expect((await signUp("two@example.com", PASSWORD, { ip: "10.31.0.2", name: "  Nodira   Rahimova " })).status).toBe(200);
    expect((await db.select({ name: users.name }).from(users).where(eq(users.email, "two@example.com")).get())!.name).toBe("Nodira Rahimova");
    for (const [name, message] of [
      ["x".repeat(51), "Use at most 50 characters."],
      ["three@example.com", "Use your name, not an email address."],
      ["gmail.com", "Use your name, not an email address."],
    ] as const) {
      jar.clear();
      const response = await signUp(`n${++ip}@example.com`, PASSWORD, { ip: `10.31.1.${ip}`, name });
      expect(response.status, name).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "invalid_name", message } });
    }
    expect(await db.select().from(users).where(eq(users.email, "three@example.com")).all()).toEqual([]);
  });

  it("Account page name: 1–50 characters, trimmed, not an email address", async () => {
    await account("four@example.com");
    for (const [name, status] of [["", 400], ["   ", 400], ["x".repeat(51), 400], ["four@example.com", 400], ["  Ali  Valiyev ", 200]] as const) {
      expect((await putName(req("/x", "PUT", { name }))).status, JSON.stringify(name)).toBe(status);
    }
    expect((await (await getMe()).json()) as { name: string }).toMatchObject({ name: "Ali Valiyev" });
  });
});
