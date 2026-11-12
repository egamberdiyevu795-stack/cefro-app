import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
const mockSwitch = vi.hoisted(() => ({ on: true }));
vi.mock("@/config/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/features")>();
  return { ...original, PART_LIVE: { "1.1": false, "1.2": false, "2": true, "3": false }, fullMockLive: () => mockSwitch.on };
});
vi.mock("next/headers", async () => (await import("../../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 120_000 });

import { and, eq } from "drizzle-orm";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { setConsentRequiredForTesting } from "@/server/consent/consent";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { authSessions, classMembers, classMocks, examPasses, practiceSessions, speakingAttempts, users } from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { PASSWORD, signIn, signUp } from "../../../../test/auth-helpers";
import { fakeWebm } from "../../../../test/fixtures";
import { applySetCookies, jar } from "../../../../test/next-headers-mock";
import { PUT as putName } from "../account/name/route";
import { GET as getMyAudio } from "../speaking/attempts/[attemptId]/audio/route";
import { POST as postLeave } from "../classes/[memberId]/leave/route";
import { PUT as putPin } from "../classes/[memberId]/pin/route";
import { GET as getMyClasses, POST as postShare } from "../classes/route";
import { GET as getMockResult } from "../mock-exams/[mockId]/result/route";
import { POST as postFinish } from "../mock-exams/[mockId]/finish/route";
import { POST as postStartMock } from "../mock-exams/route";
import { GET as getAttempt } from "../speaking/attempts/[attemptId]/route";
import { POST as postAttempt } from "../speaking/attempts/route";
import { POST as postEnd } from "../exam-laptop/[mockId]/end/route";
import { POST as postPin } from "../exam-laptop/[mockId]/pin/route";
import { GET as getRoster } from "../exam-laptop/[mockId]/roster/route";
import { POST as postUnlock } from "../exam-laptop/[mockId]/unlock/route";
import { GET as getResults } from "./classes/[classId]/exam/[mockId]/results/route";
import { GET as getExam, POST as postExam } from "./classes/[classId]/exam/route";
import { GET as getAttemptRoute } from "./classes/[classId]/attempts/[attemptId]/route";
import { GET as getTeacherAudio } from "./classes/[classId]/attempts/[attemptId]/audio/route";
import { PUT as putAttemptRating } from "./classes/[classId]/attempts/[attemptId]/rating/route";
import { POST as postCode } from "./classes/[classId]/code/route";
import { GET as getClassRoute } from "./classes/[classId]/route";
import { GET as getMockRoute } from "./classes/[classId]/mocks/[mockId]/route";
import { PUT as putMockRating } from "./classes/[classId]/mocks/[mockId]/rating/route";
import { GET as getStudentRoute } from "./classes/[classId]/students/[memberId]/route";
import { GET as getTeacherClasses } from "./classes/route";
import AttemptPage from "@/app/teacher/classes/[classId]/attempts/[attemptId]/page";
import MockPage from "@/app/teacher/classes/[classId]/mocks/[mockId]/page";
import ResultsPage from "@/app/teacher/classes/[classId]/exam/[classMockId]/page";
import StartPage from "@/app/teacher/classes/[classId]/exam/page";
import ClassPage from "@/app/teacher/classes/[classId]/page";
import AccountPage from "@/app/profile/page";
import { POST as postClose } from "./classes/[classId]/close/route";
import { DELETE as deleteStudent } from "./classes/[classId]/students/[memberId]/route";
import { POST as postClass } from "./classes/route";

/*
 * Exam laptop mode (docs/v1-plan.md, step 7) through the real route handlers, mock providers only: the class PIN, the
 * pass (wrong student, expired, used up, other laptop, locked), cross-user access, "a pass can't write to another student",
 * "a teacher can't record into their own account through it", End exam laptop, and no PIN or hash in any response.
 */

const L1 = "laptop-one-aaaaaaaaaaaa";
const L2 = "laptop-two-bbbbbbbbbbbb";
const ALICE_PIN = "4821";
const BOB_PIN = "7319";
const TASKS = { "1.1": "a2-part1-1-daily-life", "1.2": "b1-part1-2-shopping", "2": "b2-part2-advice-from-someone", "3": "c1-part3-cars-in-city-centres" } as const;
type Part = keyof typeof TASKS;

let db: Db;
let dir: string;
let ipCounter = 0;
type Browser = Map<string, string>;
const bodies: string[] = [];

const actAs = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
const snapshot = (): Browser => new Map(jar);
const req = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", origin: "http://localhost", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
/** Every response body the tests read is kept, so one test can prove none of them ever held a PIN or a hash. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (response: Response): Promise<Record<string, any>> => {
  if (response.status === 204) return {};
  const text = await response.text();
  bodies.push(text);
  return JSON.parse(text);
};
const drain = async () => {
  while (afterTasks.length) await afterTasks.shift()!();
};
const passHeaders = (passId: string) => ({ "x-exam-pass": passId });

async function register(email: string, name: string, role: "student" | "teacher" = "student"): Promise<{ browser: Browser; id: string }> {
  jar.clear();
  expect((await signUp(email, PASSWORD, { ip: `10.50.0.${++ipCounter}` })).status).toBe(200);
  expect((await putName(req("/api/account/name", "PUT", { name }))).status).toBe(200);
  await db.update(users).set({ role }).where(eq(users.email, email)).run();
  const id = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())!.id;
  return { browser: snapshot(), id };
}

interface World {
  teacher: Browser;
  teacherId: string;
  otherTeacher: Browser;
  alice: Browser;
  aliceId: string;
  bob: Browser;
  bobId: string;
  stranger: Browser;
  anonymous: Browser;
  classId: string;
  aliceMember: string;
  bobMember: string;
  classMockId: string;
  /** Each laptop's browser: the exam laptop DEVICE session (no teacher login), made by "Start exam laptop" / joining. */
  devices: Record<string, Browser>;
}

const ROOMS: Record<string, string> = { [L1]: "Room 1", [L2]: "Room 2" };
/** "Start exam laptop" (or joining) on a laptop: the teacher's login on that browser is replaced by a device session. */
/** A fresh browser with its own teacher login. (A successful Start signs THAT login out, so a test that starts twice needs two.) */
async function loginTeacher(): Promise<Browser> {
  jar.clear();
  expect((await signIn("karimova@school.example", PASSWORD, { ip: `10.51.0.${++ipCounter}` })).status).toBe(200);
  return snapshot();
}
async function startLaptop(classId: string, laptop: string): Promise<{ browser: Browser; body: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Each laptop is its own browser with its OWN teacher login (Start signs that one login out, never the teacher's other sessions).
  jar.clear();
  expect((await signIn("karimova@school.example", PASSWORD, { ip: `10.51.0.${++ipCounter}` })).status).toBe(200);
  return startLaptopFor(classId, laptop);
}
async function startLaptopFor(classId: string, laptop: string): Promise<{ browser: Browser; body: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const response = await postExam(req(`/api/teacher/classes/${classId}/exam`, "POST", { mode: "different", laptopId: laptop, room: ROOMS[laptop] }), ctx({ classId }));
  expect(response.status).toBeLessThan(300);
  applySetCookies(response);
  const body = await read(response);
  return { browser: snapshot(), body };
}

async function world(options: { bobPin?: boolean } = {}): Promise<World> {
  const teacher = await register("karimova@school.example", "Ms Karimova", "teacher");
  actAs(teacher.browser);
  const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group B" }), ctx({})))) as { class: { id: string; joinCode: string } };
  const other = await register("other@school.example", "Mr Other", "teacher");
  const stranger = await register("stranger@example.com", "Stranger Danger");
  jar.clear();
  const anonymous = snapshot();
  const alice = await register("alice@example.com", "Alice Example");
  const bob = await register("bob@example.com", "Bob Bobson");
  for (const id of [alice.id, bob.id]) await db.update(users).set({ consentStatus: "granted", consentAt: new Date().toISOString(), consentTeacherSharing: true }).where(eq(users.id, id)).run();
  actAs(alice.browser);
  expect((await postShare(req("/api/classes", "POST", { code: created.class.joinCode, shownName: "Aziza", pin: ALICE_PIN }), ctx({}))).status).toBe(201);
  actAs(bob.browser);
  expect((await postShare(req("/api/classes", "POST", { code: created.class.joinCode, shownName: "Bekzod", ...(options.bobPin === false ? {} : { pin: BOB_PIN }) }), ctx({}))).status).toBe(201);
  const members = await db.select().from(classMembers).all();
  actAs(teacher.browser);
  const started = await startLaptop(created.class.id, L1);
  return {
    teacher: teacher.browser,
    teacherId: teacher.id,
    otherTeacher: other.browser,
    alice: alice.browser,
    aliceId: alice.id,
    bob: bob.browser,
    bobId: bob.id,
    stranger: stranger.browser,
    anonymous,
    classId: created.class.id,
    aliceMember: members.find((m) => m.studentUserId === alice.id)!.id,
    bobMember: members.find((m) => m.studentUserId === bob.id)!.id,
    classMockId: started.body.classMock.id,
    devices: { [L1]: started.browser },
  };
}

/** The browser of one laptop (joining the open class mock the first time a second laptop is asked for). */
async function dev(w: World, laptop: string): Promise<Browser> {
  return (w.devices[laptop] ??= (await startLaptop(w.classId, laptop)).browser);
}

/** The device routes' context (`/api/exam-laptop/[mockId]/…`) and the teacher's (`…/classes/[classId]/exam/[mockId]/results`). */
const examCtx = (w: World) => ctx({ mockId: w.classMockId });
const resultsCtx = (w: World) => ctx({ classId: w.classId, mockId: w.classMockId });
const enter = async (w: World, memberId: string, pin: string, laptop = L1) => {
  actAs(await dev(w, laptop));
  return postPin(req(`/api/exam-laptop/${w.classMockId}/pin`, "POST", { memberId, pin }), examCtx(w));
};
const rosterOf = async (w: World, laptop = L1) => {
  actAs(await dev(w, laptop));
  return getRoster(req("/x"), examCtx(w));
};
/** The student types a PIN on the laptop; returns the pass id. */
async function pass(w: World, who: "alice" | "bob" = "alice", laptop = L1): Promise<string> {
  const response = await enter(w, who === "alice" ? w.aliceMember : w.bobMember, who === "alice" ? ALICE_PIN : BOB_PIN, laptop);
  expect(response.status).toBe(200);
  return (await read(response)).passId;
}
const startMockWith = async (w: World, passId: string, laptop = L1) => {
  actAs(await dev(w, laptop));
  return postStartMock(req("/api/mock-exams", "POST", undefined, passHeaders(passId)));
};
const finishWith = async (w: World, passId: string, mockId: string, laptop = L1) => {
  actAs(await dev(w, laptop));
  return postFinish(req("/x", "POST", undefined, passHeaders(passId)), ctx({ mockId }));
};

function uploadRequest(part: Part, sessionId: string | null, headers: Record<string, string>, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASKS[part]);
  form.set("durationMs", "110000");
  if (part === "3") form.set("chosenPoints", JSON.stringify(["F1", "F2", "A1", "A2"]));
  if (part === "1.1" || part === "1.2") form.set("questionOffsetsMs", JSON.stringify([0, 30000, 60000]));
  if (sessionId) form.set("sessionId", sessionId);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost/api/speaking/attempts", { method: "POST", headers, body: form });
}
/** An upload from a laptop's browser (default Room 1), or from `as` (any other browser). */
async function upload(w: World, part: Part, sessionId: string | null, headers: Record<string, string>, fields: Record<string, string> = {}, as: string | Browser = L1) {
  actAs(typeof as === "string" ? await dev(w, as) : as);
  const response = await postAttempt(uploadRequest(part, sessionId, headers, fields));
  await drain();
  return { response, body: await read(response) };
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-exam-laptop-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  resetJoinLimiterForTesting();
  setTeacherLiveForTesting(true);
  afterTasks.length = 0;
  bodies.length = 0;
  jar.clear();
});
afterEach(() => {
  setTeacherLiveForTesting(undefined);
  setConsentRequiredForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the class PIN, student side", () => {
  it("is set on the Share screen, stored only as a hash, and reported only as 'set'", async () => {
    const w = await world();
    const rows = await db.select().from(classMembers).all();
    for (const row of rows) {
      expect(row.pinHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
      expect(row.pinHash).not.toContain(ALICE_PIN);
      expect(row.pinHash).not.toContain(BOB_PIN);
    }
    expect(rows[0]!.pinHash).not.toBe(rows[1]!.pinHash);
    actAs(w.alice);
    const mine = (await read(await getMyClasses(req("/api/classes"), ctx({})))) as { classes: { hasPin: boolean }[] };
    expect(mine.classes).toHaveLength(1);
    expect(mine.classes[0]!.hasPin).toBe(true);
  });

  it("Share refuses a PIN that is not 4 digits, and stores nothing", async () => {
    const teacher = await register("t@school.example", "Teacher", "teacher");
    actAs(teacher.browser);
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "C" }), ctx({})))) as { class: { joinCode: string } };
    const student = await register("s@example.com", "S");
    actAs(student.browser);
    for (const pin of ["123", "12345", "abcd", 1234, "12 4"]) {
      const response = await postShare(req("/api/classes", "POST", { code: created.class.joinCode, shownName: "Sam", pin }), ctx({}));
      expect(response.status, String(pin)).toBe(400);
      expect((await read(response)).error.code).toBe("invalid_pin");
    }
    expect(await db.select().from(classMembers).all()).toHaveLength(0);
  });

  it("only the student can set or change it, for their own open membership; the teacher and everyone else get 404", async () => {
    const w = await world();
    const before = (await db.select().from(classMembers).where(eq(classMembers.id, w.aliceMember)).get())!.pinHash;
    for (const [who, browser] of [["the teacher", w.teacher], ["bob", w.bob], ["other teacher", w.otherTeacher], ["stranger", w.stranger]] as const) {
      actAs(browser);
      expect((await putPin(req("/x", "PUT", { pin: "0000" }), ctx({ memberId: w.aliceMember }))).status, who).toBe(404);
    }
    actAs(w.anonymous);
    expect((await putPin(req("/x", "PUT", { pin: "0000" }), ctx({ memberId: w.aliceMember }))).status).toBe(401); // not signed in
    expect((await db.select().from(classMembers).where(eq(classMembers.id, w.aliceMember)).get())!.pinHash).toBe(before);
    actAs(w.alice);
    expect((await putPin(req("/x", "PUT", { pin: "12" }), ctx({ memberId: w.aliceMember }))).status).toBe(400);
    const ok = await putPin(req("/x", "PUT", { pin: "0000" }), ctx({ memberId: w.aliceMember }));
    expect(ok.status).toBe(200);
    expect(await read(ok)).toEqual({ hasPin: true });
    expect((await db.select().from(classMembers).where(eq(classMembers.id, w.aliceMember)).get())!.pinHash).not.toBe(before);
    // The new PIN is the one that works.
    actAs(w.teacher);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(403);
    expect((await enter(w, w.aliceMember, "0000")).status).toBe(200);
  });

  it("changing the PIN also clears a lock", async () => {
    const w = await world();
    actAs(w.teacher);
    for (let i = 0; i < 5; i++) await enter(w, w.aliceMember, "1111");
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(403);
    actAs(w.alice);
    expect((await putPin(req("/x", "PUT", { pin: "2222" }), ctx({ memberId: w.aliceMember }))).status).toBe(200);
    actAs(w.teacher);
    expect((await enter(w, w.aliceMember, "2222")).status).toBe(200);
  });

  it("leaving the class removes the PIN and the pass", async () => {
    const w = await world();
    const passId = await pass(w);
    actAs(w.alice);
    expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.aliceMember }))).status).toBe(204);
    const row = (await db.select().from(classMembers).where(eq(classMembers.id, w.aliceMember)).get())!;
    expect(row).toMatchObject({ pinHash: null, pinFailures: null });
    expect((await db.select().from(examPasses).where(eq(examPasses.id, passId)).get())!.usedUpAt).not.toBeNull();
    const start = await startMockWith(w, passId);
    expect(start.status).toBe(403);
  });
});

describe("every exam route × caller", () => {
  it("the device routes accept only the exam laptop's own device session: a teacher login, another teacher, a student, a stranger and an anonymous browser get 404", async () => {
    const w = await world();
    const calls = (): [string, () => Promise<Response>][] => [
      ["GET roster", () => getRoster(req("/x"), examCtx(w))],
      ["POST pin", () => postPin(req("/x", "POST", { memberId: w.aliceMember, pin: ALICE_PIN }), examCtx(w))],
      ["POST unlock", () => postUnlock(req("/x", "POST", { memberId: w.aliceMember, email: "karimova@school.example", password: PASSWORD }), examCtx(w))],
      ["POST end", () => postEnd(req("/x", "POST", { email: "karimova@school.example", password: PASSWORD, close: true }), examCtx(w))],
    ];
    for (const [name, call] of calls()) {
      for (const [who, browser] of [["the teacher's own login", w.teacher], ["other teacher", w.otherTeacher], ["alice (a student)", w.alice], ["bob", w.bob], ["stranger", w.stranger], ["anonymous", w.anonymous]] as const) {
        actAs(browser);
        expect((await call()).status, `${name} as ${who}`).toBe(404);
      }
    }
    expect(await db.select().from(examPasses).all()).toHaveLength(0);
    expect((await db.select().from(classMocks).get())!.closedAt).toBeNull();
    // A device session for ANOTHER class mock is refused too.
    const other = await register("t2@school.example", "Teacher Two", "teacher");
    actAs(other.browser);
    const second = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group Z" }), ctx({})))) as { class: { id: string } };
    jar.clear();
    expect((await signIn("t2@school.example", PASSWORD, { ip: "10.51.9.9" })).status).toBe(200);
    const elsewhere = await startLaptopFor(second.class.id, L2);
    actAs(elsewhere.browser);
    expect((await getRoster(req("/x"), examCtx(w))).status).toBe(404);
    // The right device session works.
    actAs(await dev(w, L1));
    for (const [name, call] of calls().filter(([n]) => n === "GET roster")) expect((await call()).status, name).toBe(200);
  });

  it("the teacher's own exam routes (Start, results) accept only the class's teacher login: a device session gets 404 like everyone else", async () => {
    const w = await world();
    const teacherCalls = (): [string, () => Promise<Response>][] => [
      ["GET exam", () => getExam(req("/x"), ctx({ classId: w.classId }))],
      ["POST exam", () => postExam(req("/x", "POST", { mode: "different", laptopId: L1, room: "Room 1" }), ctx({ classId: w.classId }))],
      ["GET results", () => getResults(req("/x"), resultsCtx(w))],
    ];
    for (const [name, call] of teacherCalls()) {
      for (const [who, browser] of [["the exam laptop's device session", await dev(w, L1)], ["other teacher", w.otherTeacher], ["alice", w.alice], ["stranger", w.stranger], ["anonymous", w.anonymous]] as const) {
        actAs(browser);
        expect((await call()).status, `${name} as ${who}`).toBe(404);
      }
    }
    actAs(w.teacher);
    for (const [name, call] of teacherCalls().filter(([n]) => n !== "POST exam")) expect((await call()).status, name).toBeLessThan(300);
  });

  it("is a 404 for everyone while the Teacher view is off", async () => {
    const w = await world();
    const passId = await pass(w);
    setTeacherLiveForTesting(false);
    actAs(await dev(w, L1));
    expect((await getRoster(req("/x"), examCtx(w))).status).toBe(404);
    expect((await postPin(req("/x", "POST", { memberId: w.aliceMember, pin: ALICE_PIN }), examCtx(w))).status).toBe(404);
    // And a pass is worth nothing then.
    expect((await startMockWith(w, passId)).status).toBe(404);
    actAs(w.teacher);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(404);
  });
});

describe("starting and joining a class mock", () => {
  it("is refused with a clear message while the full mock is switched off (FULL_MOCK_LIVE), and works again when it is on", async () => {
    const w = await world();
    actAs(w.teacher);
    mockSwitch.on = false;
    try {
      const refused = await postExam(req("/x", "POST", { mode: "different", laptopId: L1, room: "Room 1" }), ctx({ classId: w.classId }));
      expect(refused.status).toBe(409);
      const body = (await read(refused)) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("mock_not_live");
      expect(body.error.message).toContain("FULL_MOCK_LIVE");
      // No device cookie was handed out (the browser stays a teacher login).
      expect(refused.headers.get("set-cookie")).toBeNull();
      expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(200);
    } finally {
      mockSwitch.on = true;
    }
    // On again: it starts (or joins the class mock the test world already has open).
    expect((await postExam(req("/x", "POST", { mode: "different", laptopId: L1, room: "Room 1" }), ctx({ classId: w.classId }))).status).toBeLessThan(300);
  });

  it("'same paper' suggests four tasks nobody in the class has done; the second laptop joins the open class mock", async () => {
    const w = await world();
    actAs(await loginTeacher());
    // A second class with no mock yet: the suggestion and the paper.
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group C" }), ctx({})))) as { class: { id: string } };
    const exam = (await read(await getExam(req("/x"), ctx({ classId: created.class.id })))) as { open: unknown; suggestion: { part: string; taskId: string; title: string }[] };
    expect(exam.open).toBeNull();
    expect(exam.suggestion.map((s) => s.part)).toEqual(["1.1", "1.2", "2", "3"]);
    // The screen sends the paper it showed, so what the teacher saw is what is used.
    const shown = Object.fromEntries(exam.suggestion.map((s) => [s.part, s.taskId]));
    const started = await postExam(req("/x", "POST", { mode: "same", tasks: shown, laptopId: L1, room: "Room 1" }), ctx({ classId: created.class.id }));
    expect(started.status).toBe(201);
    const first = (await read(started)) as { classMock: { id: string; title: string; paper: { part: string; taskId: string }[] }; joined: boolean };
    expect(first.joined).toBe(false);
    expect(first.classMock.title).toBe("Mock 1");
    expect(first.classMock.paper!.map((p) => p.taskId)).toEqual(exam.suggestion.map((s) => s.taskId));
    // The other laptop (its own browser, its own login) starts "again": it joins the same row, whatever mode it asks for.
    actAs(await loginTeacher());
    const second = await postExam(req("/x", "POST", { mode: "different", laptopId: L2, room: "Room 2" }), ctx({ classId: created.class.id }));
    expect(second.status).toBe(200);
    expect(await read(second)).toMatchObject({ joined: true, classMock: { id: first.classMock.id } });
    expect(await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all()).toHaveLength(1);
  });

  it("Start needs a laptop id and a room name, and nothing changes without them", async () => {
    const w = await world();
    actAs(w.teacher);
    for (const body of [{ mode: "different" }, { mode: "different", laptopId: "short", room: "Room 1" }, { mode: "different", laptopId: L1 }, { mode: "different", laptopId: L1, room: "" }]) {
      const response = await postExam(req("/x", "POST", body), ctx({ classId: w.classId }));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.headers.getSetCookie()).toEqual([]); // still the teacher's login: nothing signed out
    }
  });

  it("two laptops pressing Start at the same moment end up on ONE class mock", async () => {
    const w = await world();
    actAs(w.teacher);
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group F" }), ctx({})))) as { class: { id: string } };
    const c = () => ctx({ classId: created.class.id });
    const answers = await Promise.all([
      postExam(req("/x", "POST", { mode: "different", laptopId: L1, room: "Room 1" }), c()),
      postExam(req("/x", "POST", { mode: "different", laptopId: L2, room: "Room 2" }), c()),
    ]);
    const ids = new Set((await Promise.all(answers.map(read))).map((a) => a.classMock.id));
    expect(ids.size).toBe(1);
    const rows = await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all();
    expect(rows).toHaveLength(1);
    expect([...ids][0]).toBe(rows[0]!.id);
  });

  it("refuses a made-up paper or mode, and a task in the wrong part", async () => {
    const w = await world();
    actAs(await loginTeacher());
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group D" }), ctx({})))) as { class: { id: string } };
    const c = ctx({ classId: created.class.id });
    const ids = { laptopId: L1, room: "Room 1" };
    expect((await postExam(req("/x", "POST", { mode: "everyone", ...ids }), c)).status).toBe(400);
    // "same" without a paper uses the app's own suggestion: four valid tasks.
    const other = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group E" }), ctx({})))) as { class: { id: string } };
    const plain = await read(await postExam(req("/x", "POST", { mode: "same", ...ids }), ctx({ classId: other.class.id })));
    expect(plain.classMock.paper).toHaveLength(4);
    actAs(await loginTeacher());
    expect((await postExam(req("/x", "POST", { ...ids }), c)).status).toBe(400);
    expect((await postExam(req("/x", "POST", { mode: "same", tasks: { "1.1": "nope", "1.2": "x", "2": "y", "3": "z" }, ...ids }), c)).status).toBe(400);
    expect((await postExam(req("/x", "POST", { mode: "same", tasks: { ...TASKS, "2": TASKS["1.1"] }, ...ids }), c)).status).toBe(400);
    expect(await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all()).toHaveLength(0);
  });

  it("the list shows Not started, In progress (Room 2) and Done, and a student in progress on one laptop can't be picked on the other", async () => {
    const w = await world();
    const list = async (laptop: string) => ((await read(await rosterOf(w, laptop))) as { students: Record<string, any>[] }).students; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((await list(L1)).map((s) => [s.name, s.state, s.pickable])).toEqual([["Aziza", "not_started", true], ["Bekzod", "not_started", true]]);
    const passId = await pass(w, "alice", L2); // Aziza starts in Room 2
    const onL1 = await list(L1);
    expect(onL1.find((s) => s.name === "Aziza")).toMatchObject({ state: "in_progress", room: "Room 2", pickable: false });
    expect(onL1.find((s) => s.name === "Bekzod")).toMatchObject({ state: "not_started", pickable: true });
    expect((await list(L2)).find((s) => s.name === "Aziza")).toMatchObject({ state: "in_progress", pickable: true }); // her own laptop (a reload)
    const refused = await enter(w, w.aliceMember, ALICE_PIN, L1);
    expect(refused.status).toBe(409);
    expect((await read(refused)).error.code).toBe("in_progress_elsewhere");
    // She finishes: Done on both, never pickable again for this class mock.
    await sessionFinished(w, passId, L2);
    expect((await list(L1)).find((s) => s.name === "Aziza")).toMatchObject({ state: "done", pickable: false });
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN, L1))).error.code).toBe("already_done");
  });

  it("a student without a PIN can't be picked", async () => {
    const w = await world({ bobPin: false });
    const students = ((await read(await rosterOf(w))) as { students: Record<string, any>[] }).students; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(students.find((s) => s.name === "Bekzod")).toMatchObject({ hasPin: false, pickable: false });
    const response = await enter(w, w.bobMember, "1234");
    expect(response.status).toBe(409);
    expect((await read(response)).error.code).toBe("no_pin");
  });
});

describe("the device session", () => {
  it("Start exam laptop signs the teacher out of THAT browser (the login session row is gone) and leaves a device cookie, no login cookie", async () => {
    const w = await world();
    const device = w.devices[L1]!;
    expect([...device.keys()].filter((k) => k.includes("session_token"))).toEqual([]);
    expect([...device.keys()]).toContain("cefro_exam_device");
    // A login made for another laptop is signed out by ITS Start: the old cookie is worthless even if it was copied; other logins live on.
    const login = await loginTeacher();
    const before = await db.select().from(authSessions).where(eq(authSessions.userId, w.teacherId)).all();
    actAs(login);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(200);
    const started = await postExam(req("/x", "POST", { mode: "different", laptopId: L2, room: "Room 2" }), ctx({ classId: w.classId }));
    expect(started.status).toBeLessThan(300);
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, w.teacherId)).all()).toHaveLength(before.length - 1);
    actAs(login);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(404); // the signed-out login is dead
    actAs(w.teacher);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(200); // the teacher's other login is untouched
  });

  it("is scoped to the one class mock and laptop it was made for, and expires on its own", async () => {
    const w = await world();
    const cookie = [...(await dev(w, L1)).entries()].find(([k]) => k === "cefro_exam_device")![1];
    const { parseDeviceCookie, signDeviceSession } = await import("@/server/exam-laptop/device-session");
    expect(parseDeviceCookie(cookie)).toMatchObject({ teacherId: w.teacherId, classId: w.classId, classMockId: w.classMockId, laptopId: L1, room: "Room 1" });
    expect(parseDeviceCookie(`${cookie}x`)).toBeNull(); // tampered signature
    expect(parseDeviceCookie(cookie.replace(/^[^.]+/, (b) => b.slice(0, -2) + "AA"))).toBeNull(); // tampered body
    expect(parseDeviceCookie(cookie, Date.now() + 13 * 3_600_000)).toBeNull(); // 12 hours at most
    const forged = signDeviceSession({ teacherId: w.teacherId, classId: w.classId, classMockId: "00000000-0000-4000-8000-000000000000", laptopId: L1, room: "Room 1" });
    actAs(new Map([["cefro_exam_device", forged]]));
    expect((await getRoster(req("/x"), ctx({ mockId: "00000000-0000-4000-8000-000000000000" }))).status).toBe(404); // no such class mock
  });

  it("ends when the class mock closes: the list and PINs are refused and the dead cookie is removed", async () => {
    const w = await world();
    await db.update(classMocks).set({ closedAt: new Date().toISOString() }).run();
    actAs(await dev(w, L1));
    const response = await getRoster(req("/x"), examCtx(w));
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie().join(";")).toMatch(/cefro_exam_device=;.*Max-Age=0/);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(404);
  });

  it("End and Unlock need the teacher's EMAIL and password, then give back a normal teacher session and remove the device session", async () => {
    const w = await world();
    const device = await dev(w, L1);
    const end = (body: unknown) => {
      actAs(device);
      return postEnd(req("/x", "POST", body), examCtx(w));
    };
    for (const [label, body, status] of [
      ["no credentials", {}, 400],
      ["email only", { email: "karimova@school.example" }, 400],
      ["password only", { password: PASSWORD }, 400],
      ["the wrong password", { email: "karimova@school.example", password: "not the password" }, 400],
      ["another account's email", { email: "alice@example.com", password: PASSWORD }, 400],
      ["another teacher's email and password", { email: "other@school.example", password: PASSWORD }, 400],
    ] as const) {
      const response = await end(body);
      expect(response.status, label).toBe(status);
      expect(response.headers.getSetCookie().filter((l) => l.includes("session_token")), label).toEqual([]);
    }
    expect((await db.select().from(classMocks).get())!.closedAt).toBeNull();
    const ok = await end({ email: "  Karimova@School.example ", password: PASSWORD });
    expect(ok.status).toBe(204);
    applySetCookies(ok);
    // The browser is a normal teacher browser again: a session cookie, no device cookie, teacher pages work.
    expect([...jar.keys()].some((k) => k.includes("session_token"))).toBe(true);
    expect(jar.has("cefro_exam_device")).toBe(false);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(200);
    // ... a new login session (the spare one plus this one); the device never held a login.
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, w.teacherId)).all()).toHaveLength(2);
  });
});

describe("what a device session can NOT reach", () => {
  it("every teacher route answers 404 (the same as a stranger), whatever the class, attempt or mock", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    const attemptId = (await upload(w, "2", mock, passHeaders(passId))).body.attempt.id as string;
    const c = { classId: w.classId };
    const calls: [string, () => Promise<Response>][] = [
      ["GET teacher classes", () => getTeacherClasses(req("/x"), ctx({}))],
      ["POST teacher classes", () => postClass(req("/x", "POST", { name: "Sneaky" }), ctx({}))],
      ["GET class (T3)", () => getClassRoute(req("/x"), ctx(c))],
      ["POST close class", () => postClose(req("/x", "POST"), ctx(c))],
      ["POST reset code", () => postCode(req("/x", "POST"), ctx(c))],
      ["GET student (T4)", () => getStudentRoute(req("/x"), ctx({ ...c, memberId: w.aliceMember }))],
      ["DELETE student", () => deleteStudent(req("/x", "DELETE"), ctx({ ...c, memberId: w.aliceMember }))],
      ["GET attempt (T5)", () => getAttemptRoute(req("/x"), ctx({ ...c, attemptId }))],
      ["PUT attempt rating", () => putAttemptRating(req("/x", "PUT", { agrees: true }), ctx({ ...c, attemptId }))],
      ["GET teacher recording", () => getTeacherAudio(req("/x"), ctx({ ...c, attemptId }))],
      ["GET mock (T6)", () => getMockRoute(req("/x"), ctx({ ...c, mockId: mock }))],
      ["PUT mock rating", () => putMockRating(req("/x", "PUT", { agrees: true }), ctx({ ...c, mockId: mock }))],
      ["GET results (T8)", () => getResults(req("/x"), resultsCtx(w))],
      ["GET Start page data", () => getExam(req("/x"), ctx(c))],
      ["POST Start", () => postExam(req("/x", "POST", { mode: "different", laptopId: L1, room: "Room 1" }), ctx(c))],
      ["GET the student's own recording", () => getMyAudio(req("/x"), ctx({ attemptId }))],
      ["GET the student's attempt", () => getAttempt(req("/x"), ctx({ attemptId }))],
      ["GET the student's mock result", () => getMockResult(req("/x"), ctx({ mockId: mock }))],
    ];
    actAs(await dev(w, L1));
    for (const [name, call] of calls) expect((await call()).status, name).toBe(404);
    // And nothing changed.
    expect((await db.select().from(classMocks).all())).toHaveLength(1);
    expect(await db.select().from(classMembers).all()).toHaveLength(2);
  });

  it("T5, T6, T8, the Start page, T3 and the Account page are the 404 page (not found)", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    const attemptId = (await upload(w, "2", mock, passHeaders(passId))).body.attempt.id as string;
    const p = (params: Record<string, string>) => ({ params: Promise.resolve(params), searchParams: Promise.resolve({}) }) as never;
    actAs(await dev(w, L1));
    const pages: [string, () => Promise<unknown>][] = [
      ["T3", () => ClassPage(p({ classId: w.classId }))],
      ["Start", () => StartPage(p({ classId: w.classId }))],
      ["T5", () => AttemptPage(p({ classId: w.classId, attemptId }))],
      ["T6", () => MockPage(p({ classId: w.classId, mockId: mock }))],
      ["T8", () => ResultsPage(p({ classId: w.classId, classMockId: w.classMockId }))],
      ["Account", () => AccountPage(p({}))],
    ];
    for (const [name, render] of pages) await expect(render(), name).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});

describe("PIN entry and the lock", () => {
  it("a wrong PIN is counted per laptop, the 5th locks the student on that laptop only, and a correct PIN doesn't get through the lock", async () => {
    const w = await world();
    for (let i = 1; i < 5; i++) {
      const response = await enter(w, w.aliceMember, "0000");
      expect(response.status).toBe(403);
      const error = (await read(response)).error;
      expect(error.code).toBe("wrong_pin");
      expect(error.message).toContain(`${5 - i} ${5 - i === 1 ? "try" : "tries"} left`);
    }
    const locked = await enter(w, w.aliceMember, "0000");
    expect(locked.status).toBe(403);
    expect((await read(locked)).error.code).toBe("pin_locked");
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN))).error.code).toBe("pin_locked");
    // The list says so too: not tappable on that laptop (and locked), still tappable on the other.
    const list = async (laptop: string) => ((await read(await rosterOf(w, laptop))) as { students: Record<string, any>[] }).students.find((s) => s.name === "Aziza")!; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(await list(L1)).toMatchObject({ lockedHere: true, locked: true, pickable: false });
    expect(await list(L2)).toMatchObject({ lockedHere: false, locked: true, pickable: true });
    // The other laptop is not locked: its own count starts at zero.
    expect((await enter(w, w.aliceMember, ALICE_PIN, L2)).status).toBe(200);
    // And Bekzod is not affected on the first laptop.
    expect((await enter(w, w.bobMember, BOB_PIN, L1)).status).toBe(200);
    expect(await db.select().from(examPasses).all()).toHaveLength(2);
  });

  it("parallel guesses can't all count as the first one", async () => {
    const w = await world();
    actAs(await dev(w, L1));
    await Promise.all(Array.from({ length: 12 }, () => postPin(req("/x", "POST", { memberId: w.aliceMember, pin: "0000" }), examCtx(w))));
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN))).error.code).toBe("pin_locked");
  });

  it("unlocking needs the teacher's email and password, and hands the teacher session back; then the correct PIN works after starting again", async () => {
    const w = await world();
    for (let i = 0; i < 5; i++) await enter(w, w.aliceMember, "0000");
    const device = await dev(w, L1);
    const unlock = (body: Record<string, unknown>) => {
      actAs(device);
      return postUnlock(req("/x", "POST", { memberId: w.aliceMember, ...body }), examCtx(w));
    };
    expect((await unlock({})).status).toBe(400);
    expect((await unlock({ email: "karimova@school.example", password: "" })).status).toBe(400);
    expect((await unlock({ email: "karimova@school.example", password: "not the password" })).status).toBe(400);
    expect((await unlock({ email: "bob@example.com", password: PASSWORD })).status).toBe(400);
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN))).error.code).toBe("pin_locked");
    const ok = await unlock({ email: "karimova@school.example", password: PASSWORD });
    expect(ok.status).toBe(204);
    applySetCookies(ok);
    expect(jar.has("cefro_exam_device")).toBe(false); // the device session ended with it
    // The teacher starts the exam laptop again (joins the open class mock) and Aziza can type her PIN.
    const again = await startLaptopFor(w.classId, L1);
    w.devices[L1] = again.browser;
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(200);
  });

  it("a correct PIN gives a pass for that student, ~30 minutes, with the four public tasks, and a reload on the same laptop replaces it", async () => {
    const w = await world();
    const response = await enter(w, w.aliceMember, ALICE_PIN);
    const body = await read(response);
    expect(body.name).toBe("Aziza");
    expect(body.plans.map((p: { part: string }) => p.part)).toEqual(["1.1", "1.2", "2", "3"]);
    expect(JSON.stringify(body.plans)).not.toMatch(/guidance|examiner|evaluat/i);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    const again = await read(await enter(w, w.aliceMember, ALICE_PIN));
    expect(again.passId).not.toBe(body.passId);
    const rows = await db.select().from(examPasses).all();
    expect(rows.find((r) => r.id === body.passId)!.usedUpAt).not.toBeNull();
    expect(rows.find((r) => r.id === again.passId)!.usedUpAt).toBeNull();
    expect(rows.every((r) => r.studentUserId === w.aliceId)).toBe(true);
  });

  it("a student whose consent is withdrawn is gone from the list and can't get a pass", async () => {
    setConsentRequiredForTesting(true);
    const w = await world();
    await db.update(users).set({ consentStatus: "withdrawn" }).where(eq(users.id, w.aliceId)).run();
    const students = ((await read(await rosterOf(w))) as { students: { name: string }[] }).students;
    expect(students.map((s) => s.name)).toEqual(["Bekzod"]);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(404);
  });
});

describe("what a pass can do", () => {
  it("starts the pass's student's mock (not the teacher's), marked In class, and records into the STUDENT's account", async () => {
    const w = await world();
    const passId = await pass(w);
    const start = await startMockWith(w, passId);
    expect(start.status).toBe(201);
    const { mock } = (await read(start)) as { mock: { id: string; classMockId: string } };
    expect(mock.classMockId).toBe(w.classMockId);
    const session = (await db.select().from(practiceSessions).where(eq(practiceSessions.id, mock.id)).get())!;
    expect(session).toMatchObject({ userId: w.aliceId, kind: "full_mock", status: "in_progress", classMockId: w.classMockId });
    expect(await db.select().from(practiceSessions).where(eq(practiceSessions.userId, w.teacherId)).all()).toEqual([]);

    const { response, body } = await upload(w, "2", mock.id, passHeaders(passId));
    expect(response.status).toBe(201);
    const attempt = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, body.attempt.id)).get())!;
    expect(attempt).toMatchObject({ userId: w.aliceId, sessionId: mock.id });
    expect(await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, w.teacherId)).all()).toEqual([]);
    // Starting again with the same pass resumes the same mock.
    const again = await read(await startMockWith(w, passId));
    expect(again.mock.id).toBe(mock.id);
    expect(again.resumed).toBe(true);
  });

  it("can't write to another student: another student's mock, the teacher's own mock, no mock at all, or a retry", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice");
    const bobPass = await pass(w, "bob");
    const aliceMock = (await read(await startMockWith(w, alicePass))).mock.id as string;
    const bobMock = (await read(await startMockWith(w, bobPass))).mock.id as string;
    // The teacher's own mock, made with the teacher's own login and no pass.
    actAs(w.teacher);
    const own = (await read(await postStartMock(req("/api/mock-exams", "POST")))).mock.id as string;
    expect((await db.select().from(practiceSessions).where(eq(practiceSessions.id, own)).get())!.userId).toBe(w.teacherId);

    for (const [label, sessionId] of [["bob's mock", bobMock], ["the teacher's own mock", own], ["no mock", null], ["a made-up mock", "00000000-0000-4000-8000-000000000000"]] as const) {
      const { response, body } = await upload(w, "2", sessionId, passHeaders(alicePass));
      expect(response.status, label).toBe(403);
      expect(body.error.code, label).toBe("exam_pass_wrong_student");
    }
    const retry = await upload(w, "2", aliceMock, passHeaders(alicePass), { previousAttemptId: "00000000-0000-4000-8000-000000000001" });
    expect(retry.response.status).toBe(403);
    // Not one recording was stored, for anybody.
    expect(await db.select().from(speakingAttempts).all()).toEqual([]);
    // And the same goes the other way round: Bekzod's pass can't touch Aziza's mock.
    expect((await upload(w, "2", aliceMock, passHeaders(bobPass))).response.status).toBe(403);
    expect((await finishWith(w, bobPass, aliceMock)).status).toBe(403);
  });

  it("a teacher can't record into their own account through it: a pass never makes the teacher the owner", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    await upload(w, "2", mock, passHeaders(passId));
    await upload(w, "1.2", mock, passHeaders(passId));
    const mine = await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, w.teacherId)).all();
    expect(mine).toEqual([]);
    expect((await db.select().from(speakingAttempts).all()).every((a) => a.userId === w.aliceId)).toBe(true);
    // Without the pass the teacher's upload is the teacher's own ordinary attempt: it never joins the student's mock.
    const plain = await upload(w, "2", mock, {}, {}, w.teacher);
    expect(plain.response.status).toBe(201);
    const stored = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, plain.body.attempt.id)).get())!;
    expect(stored.userId).toBe(w.teacherId);
    expect(stored.sessionId).not.toBe(mock);
    // The teacher's login WITH the pass header is no device session: refused, nothing stored.
    const sneaky = await upload(w, "2", mock, passHeaders(passId), {}, w.teacher);
    expect(sneaky.response.status).toBe(403);
    expect(sneaky.body.error.code).toBe("exam_pass_invalid");
  });

  it("is refused for anyone who isn't the exam laptop that made it", async () => {
    const w = await world();
    const passId = await pass(w);
    const refusals: [string, Browser][] = [
      ["alice herself", w.alice],
      ["bob", w.bob],
      ["the teacher's login", w.teacher],
      ["another teacher", w.otherTeacher],
      ["a stranger", w.stranger],
      ["an anonymous browser", w.anonymous],
      ["the other laptop's device session", await dev(w, L2)],
    ];
    for (const [who, browser] of refusals) {
      actAs(browser);
      const response = await postStartMock(req("/api/mock-exams", "POST", undefined, passHeaders(passId)));
      expect(response.status, who).toBe(403);
      expect((await read(response)).error.code, who).toMatch(/^exam_pass_/);
    }
    for (const junk of ["00000000-0000-4000-8000-000000000000", "../../etc/passwd"]) {
      actAs(await dev(w, L1));
      expect((await postStartMock(req("/api/mock-exams", "POST", undefined, passHeaders(junk)))).status, junk).toBe(403);
    }
    expect(await db.select().from(practiceSessions).all()).toEqual([]);
    // The pass still works for its own laptop afterwards.
    expect((await startMockWith(w, passId)).status).toBe(201);
  });

  it("is refused once expired", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    await db.update(examPasses).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(examPasses.id, passId)).run();
    const response = await upload(w, "2", mock, passHeaders(passId));
    expect(response.response.status).toBe(403);
    expect(response.body.error.code).toBe("exam_pass_expired");
    expect((await startMockWith(w, passId)).status).toBe(403);
    expect(await db.select().from(speakingAttempts).all()).toEqual([]);
  });

  it("is used up at the end screen: finish closes the mock and nothing more is accepted", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    expect((await finishWith(w, passId, mock)).status).toBe(409); // not every part is in
    for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(w, part, mock, passHeaders(passId))).response.status, part).toBe(201);
    const done = await finishWith(w, passId, mock);
    expect(done.status).toBe(200);
    expect((await read(done)).mock.status).toBe("finished");
    expect((await db.select().from(examPasses).where(eq(examPasses.id, passId)).get())!.usedUpAt).not.toBeNull();
    for (const [label, call] of [
      ["upload", () => upload(w, "2", mock, passHeaders(passId)).then((r) => r.response)],
      ["start", () => startMockWith(w, passId)],
      ["finish", () => finishWith(w, passId, mock)],
    ] as const) {
      expect((await call()).status, label).toBe(403);
    }
    expect((await db.select().from(speakingAttempts).all()).length).toBe(4);
  });

  it("stops at once when the student becomes locked on that laptop", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    await db.update(classMembers).set({ pinFailures: JSON.stringify({ [L1]: 5 }) }).where(eq(classMembers.id, w.aliceMember)).run();
    const response = await upload(w, "2", mock, passHeaders(passId));
    expect(response.response.status).toBe(403);
    expect(response.body.error.code).toBe("exam_pass_locked");
    // A lock on the OTHER laptop doesn't stop this one.
    await db.update(classMembers).set({ pinFailures: JSON.stringify({ [L2]: 5 }) }).where(eq(classMembers.id, w.aliceMember)).run();
    expect((await upload(w, "2", mock, passHeaders(passId))).response.status).toBe(201);
  });

  it("is only read by the mock's start and finish and the upload: no result, recording, attempt or mock of the student opens with it", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    const attemptId = (await upload(w, "2", mock, passHeaders(passId))).body.attempt.id as string;
    actAs(await dev(w, L1));
    const headers = passHeaders(passId);
    expect((await getAttempt(req("/x", "GET", undefined, headers), ctx({ attemptId }))).status).toBe(404);
    expect((await getMockResult(req("/x", "GET", undefined, headers), ctx({ mockId: mock }))).status).toBe(404);
    expect((await getMyAudio(req("/x", "GET", undefined, headers), ctx({ attemptId }))).status).toBe(404);
    // The device is not even signed in: the student routes see nobody.
    expect((await getMyClasses(req("/api/classes", "GET", undefined, headers), ctx({}))).status).toBe(401);
    // ... and the student's own account still sees the attempt.
    actAs(w.alice);
    expect((await getAttempt(req("/x"), ctx({ attemptId }))).status).toBe(200);
  });

  it("a closed class mock refuses new PINs and new mocks, but a student already under way finishes", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice", L1);
    const aliceMock = (await read(await startMockWith(w, alicePass))).mock.id as string;
    const bobPass = await pass(w, "bob", L2);
    // The teacher ends Room 2 and closes the class mock (Bekzod hasn't tapped Start mock yet).
    await endAs(w, L2, true);
    expect((await db.select().from(classMocks).get())!.closedAt).not.toBeNull();
    // Room 2's browser is a teacher browser again; Room 1's device session is over for the list and for PINs ...
    expect((await enter(w, w.bobMember, BOB_PIN, L1)).status).toBe(404);
    expect((await startMockWith(w, bobPass, L2)).status).toBe(403); // his pass ended with Room 2
    // ... but the student already under way on Room 1 can finish (the pass routes still honour the device session).
    for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(w, part, aliceMock, passHeaders(alicePass))).response.status, part).toBe(201);
    expect((await finishWith(w, alicePass, aliceMock)).status).toBe(200);
  });
});

describe("Remove and Close class", () => {
  it("Remove ends the student's pass and drops their PIN; the other student is untouched", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice");
    const bobPass = await pass(w, "bob", L2);
    actAs(w.teacher);
    expect((await deleteStudent(req("/x", "DELETE"), ctx({ classId: w.classId, memberId: w.aliceMember }))).status).toBe(204);
    const rows = await db.select().from(classMembers).all();
    expect(rows.find((m) => m.id === w.aliceMember)).toMatchObject({ pinHash: null, pinFailures: null, endedBy: "teacher" });
    expect(rows.find((m) => m.id === w.bobMember)!.pinHash).not.toBeNull();
    const passes = await db.select().from(examPasses).all();
    expect(passes.find((p) => p.id === alicePass)!.usedUpAt).not.toBeNull();
    expect(passes.find((p) => p.id === bobPass)!.usedUpAt).toBeNull();
    expect((await startMockWith(w, alicePass)).status).toBe(403);
    expect((await startMockWith(w, bobPass, L2)).status).toBe(201);
  });

  it("Close class closes its class mock, ends every pass, drops every PIN and the device session with it", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice");
    actAs(w.teacher);
    expect((await postClose(req("/x", "POST"), ctx({ classId: w.classId }))).status).toBe(204);
    expect((await db.select().from(classMocks).get())!.closedAt).not.toBeNull();
    expect((await db.select().from(examPasses).where(eq(examPasses.id, alicePass)).get())!.usedUpAt).not.toBeNull();
    expect((await db.select().from(classMembers).all()).every((m) => m.pinHash === null && m.pinFailures === null)).toBe(true);
    expect((await startMockWith(w, alicePass)).status).toBe(403);
    expect((await rosterOf(w)).status).toBe(404);
  });
});

/** "End exam laptop" on a laptop with the teacher's credentials; the browser then holds a normal teacher session. */
async function endAs(w: World, laptop: string, close: boolean): Promise<Response> {
  actAs(await dev(w, laptop));
  const response = await postEnd(req("/x", "POST", { email: "karimova@school.example", password: PASSWORD, close }), examCtx(w));
  expect(response.status).toBe(204);
  applySetCookies(response);
  w.devices[laptop] = snapshot(); // now an ordinary teacher browser
  return response;
}

describe("End exam laptop", () => {
  it("needs the teacher's email and password: wrong or missing changes nothing; the right ones end this laptop's passes only", async () => {
    const w = await world();
    const room1 = await pass(w, "alice", L1);
    const room2 = await pass(w, "bob", L2);
    const end = async (body: unknown, laptop = L1) => {
      actAs(await dev(w, laptop));
      return postEnd(req("/x", "POST", body), examCtx(w));
    };
    for (const bad of [undefined, {}, { password: PASSWORD }, { email: "karimova@school.example", password: "" }, { email: "karimova@school.example", password: "wrong password" }, { email: "karimova@school.example", password: 12345 }]) {
      const response = await end(bad);
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    const open = async () => (await db.select().from(examPasses).all()).filter((p) => p.usedUpAt === null).map((p) => p.id);
    expect((await open()).sort()).toEqual([room1, room2].sort());
    await endAs(w, L1, false);
    expect(await open()).toEqual([room2]);
    expect((await db.select().from(classMocks).get())!.closedAt).toBeNull();
    // A student can't do it: the route is the device's.
    actAs(w.alice);
    expect((await postEnd(req("/x", "POST", { email: "karimova@school.example", password: PASSWORD, close: true }), examCtx(w))).status).toBe(404);
    expect(await open()).toEqual([room2]);
  });

  it("wrong passwords count like failed sign-ins, so the screen can't be used to guess the teacher's password", async () => {
    const w = await world();
    actAs(await dev(w, L1));
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await postEnd(req("/x", "POST", { email: "karimova@school.example", password: `wrong ${i}` }, { "x-forwarded-for": "10.99.0.1" }), examCtx(w))).status;
    expect(last).toBe(429);
    expect((await postEnd(req("/x", "POST", { email: "karimova@school.example", password: PASSWORD }, { "x-forwarded-for": "10.99.0.1" }), examCtx(w))).status).toBe(429);
  });
});

describe("results (T8) and In class / At home", () => {
  it("one row per student with level and part bands, 'In class' for the laptop mock and 'At home' for another; closed mocks keep their results", async () => {
    const w = await world();
    const passId = await pass(w, "alice");
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    for (const part of ["1.1", "1.2", "2", "3"] as const) await upload(w, part, mock, passHeaders(passId));
    await finishWith(w, passId, mock);
    // Bekzod does a mock at home (no pass): At home.
    actAs(w.bob);
    const home = (await read(await postStartMock(req("/api/mock-exams", "POST")))).mock.id as string;
    expect((await db.select().from(practiceSessions).where(eq(practiceSessions.id, home)).get())!.classMockId).toBeNull();

    actAs(w.alice);
    const aliceResult = await read(await getMockResult(req("/x"), ctx({ mockId: mock })));
    expect(aliceResult.result.place).toBe("in_class");
    actAs(w.bob);
    expect((await read(await getMockResult(req("/x"), ctx({ mockId: home })))).result.place).toBe("at_home");

    actAs(w.teacher);
    const results = (await read(await getResults(req("/x"), resultsCtx(w)))) as { rows: Record<string, any>[]; classMock: { title: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(results.classMock.title).toBe("Mock 1");
    expect(results.rows.map((r) => [r.name, r.state])).toEqual([["Aziza", "finished"], ["Bekzod", "not_started"]]);
    const aziza = results.rows[0]!;
    expect(aziza.bands.map((b: { part: string }) => b.part)).toEqual(["1.1", "1.2", "2", "3"]);
    expect(aziza.mockId).toBe(mock);
    // Closing keeps the results readable.
    await endAs(w, L1, true);
    expect((await getResults(req("/x"), resultsCtx(w))).status).toBe(200);
  });
});

describe("no PIN, hash or failure count in any response", () => {
  it("none of the responses read in a whole class session holds one", async () => {
    const w = await world();
    await enter(w, w.aliceMember, "0000"); // a wrong try
    await rosterOf(w).then(read);
    const passId = await pass(w, "alice");
    const mock = (await read(await startMockWith(w, passId))).mock.id as string;
    await upload(w, "2", mock, passHeaders(passId));
    actAs(w.teacher);
    await getResults(req("/x"), resultsCtx(w)).then(read);
    await getExam(req("/x"), ctx({ classId: w.classId })).then(read);
    actAs(w.alice);
    await getMyClasses(req("/api/classes"), ctx({})).then(read);
    await putPin(req("/x", "PUT", { pin: ALICE_PIN }), ctx({ memberId: w.aliceMember })).then(read);
    actAs(w.bob);
    await getMyClasses(req("/api/classes"), ctx({})).then(read);

    expect(bodies.length).toBeGreaterThan(10);
    const all = bodies.join("\n");
    for (const forbidden of ["scrypt", "pin_hash", "pinHash", "pin_failures", "pinFailures", `"${ALICE_PIN}"`, `"${BOB_PIN}"`, `:${ALICE_PIN}`, `:${BOB_PIN}`]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
    // The roster has names and states only.
    const rosterBody = JSON.parse(bodies.find((b) => b.includes('"students"') && b.includes("pickable"))!) as { students: Record<string, unknown>[] };
    expect(Object.keys(rosterBody.students[0]!).sort()).toEqual(["hasPin", "lockedHere", "locked", "memberId", "name", "pickable", "room", "state"].sort());
  });

  it("the roster never exposes another student's PIN state beyond 'has a PIN'", async () => {
    const w = await world();
    const text = JSON.stringify(await read(await rosterOf(w)));
    expect(text).not.toMatch(/scrypt|\$[0-9a-f]{32}/);
    const row = (await db.select().from(classMembers).where(and(eq(classMembers.id, w.aliceMember))).get())!;
    expect(text).not.toContain(row.pinHash!);
  });
});

/** Aziza finishes a whole mock on `laptop` with her pass (helper for the list test). */
async function sessionFinished(w: World, passId: string, laptop: string) {
  const mock = (await read(await startMockWith(w, passId, laptop))).mock.id as string;
  for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(w, part, mock, passHeaders(passId), {}, laptop)).response.status, part).toBe(201);
  expect((await finishWith(w, passId, mock, laptop)).status).toBe(200);
}
