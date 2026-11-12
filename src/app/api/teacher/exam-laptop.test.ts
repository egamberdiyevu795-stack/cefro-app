import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("@/config/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/features")>();
  return { ...original, PART_LIVE: { "1.1": false, "1.2": false, "2": true, "3": false }, fullMockLive: () => true };
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
import { classMembers, classMocks, examPasses, practiceSessions, speakingAttempts, users } from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { PASSWORD, signUp } from "../../../../test/auth-helpers";
import { fakeWebm } from "../../../../test/fixtures";
import { jar } from "../../../../test/next-headers-mock";
import { PUT as putName } from "../account/name/route";
import { POST as postLeave } from "../classes/[memberId]/leave/route";
import { PUT as putPin } from "../classes/[memberId]/pin/route";
import { GET as getMyClasses, POST as postShare } from "../classes/route";
import { GET as getMockResult } from "../mock-exams/[mockId]/result/route";
import { POST as postFinish } from "../mock-exams/[mockId]/finish/route";
import { POST as postStartMock } from "../mock-exams/route";
import { GET as getAttempt } from "../speaking/attempts/[attemptId]/route";
import { POST as postAttempt } from "../speaking/attempts/route";
import { POST as postEnd } from "./classes/[classId]/exam/[mockId]/end/route";
import { POST as postPin } from "./classes/[classId]/exam/[mockId]/pin/route";
import { GET as getResults } from "./classes/[classId]/exam/[mockId]/results/route";
import { GET as getRoster } from "./classes/[classId]/exam/[mockId]/roster/route";
import { POST as postUnlock } from "./classes/[classId]/exam/[mockId]/unlock/route";
import { GET as getExam, POST as postExam } from "./classes/[classId]/exam/route";
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
const passHeaders = (passId: string, laptop = L1) => ({ "x-exam-pass": passId, "x-exam-laptop": laptop });

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
  const started = await read(await postExam(req(`/api/teacher/classes/${created.class.id}/exam`, "POST", { mode: "different" }), ctx({ classId: created.class.id })));
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
    classMockId: started.classMock.id,
  };
}

const examCtx = (w: World) => ctx({ classId: w.classId, mockId: w.classMockId });
const base = (w: World) => `/api/teacher/classes/${w.classId}/exam/${w.classMockId}`;
const enter = async (w: World, memberId: string, pin: string, laptop = L1, room = "Room 1") =>
  postPin(req(`${base(w)}/pin`, "POST", { memberId, pin, laptopId: laptop, room }), examCtx(w));
/** The teacher types a PIN on the laptop; returns the pass id. */
async function pass(w: World, who: "alice" | "bob" = "alice", laptop = L1): Promise<string> {
  actAs(w.teacher);
  const response = await enter(w, who === "alice" ? w.aliceMember : w.bobMember, who === "alice" ? ALICE_PIN : BOB_PIN, laptop, laptop === L1 ? "Room 1" : "Room 2");
  expect(response.status).toBe(200);
  return (await read(response)).passId;
}
const startMockWith = (passId: string, laptop = L1) => postStartMock(req("/api/mock-exams", "POST", undefined, passHeaders(passId, laptop)));

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
async function upload(part: Part, sessionId: string | null, headers: Record<string, string>, fields: Record<string, string> = {}) {
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
    actAs(w.teacher);
    const start = await startMockWith(passId);
    expect(start.status).toBe(403);
  });
});

describe("every exam route × caller", () => {
  it("only the class's teacher gets in: another teacher, a student, a stranger and an anonymous browser get 404", async () => {
    const w = await world();
    const calls = (): [string, () => Promise<Response>][] => [
      ["GET exam", () => getExam(req("/x"), ctx({ classId: w.classId }))],
      ["POST exam", () => postExam(req("/x", "POST", { mode: "different" }), ctx({ classId: w.classId }))],
      ["GET roster", () => getRoster(req(`/x?laptop=${L1}`), examCtx(w))],
      ["POST pin", () => enter(w, w.aliceMember, ALICE_PIN)],
      ["POST unlock", () => postUnlock(req("/x", "POST", { memberId: w.aliceMember, password: PASSWORD }), examCtx(w))],
      ["POST end", () => postEnd(req("/x", "POST", { password: PASSWORD, laptopId: L1, close: true }), examCtx(w))],
      ["GET results", () => getResults(req("/x"), examCtx(w))],
    ];
    for (const [name, call] of calls()) {
      for (const [who, browser] of [["other teacher", w.otherTeacher], ["alice (a student)", w.alice], ["bob", w.bob], ["stranger", w.stranger], ["anonymous", w.anonymous]] as const) {
        actAs(browser);
        expect((await call()).status, `${name} as ${who}`).toBe(404);
      }
    }
    expect(await db.select().from(examPasses).all()).toHaveLength(0);
    expect((await db.select().from(classMocks).get())!.closedAt).toBeNull();
    actAs(w.teacher);
    for (const [name, call] of calls().filter(([n]) => n !== "POST end" && n !== "POST unlock")) expect((await call()).status, name).toBeLessThan(300);
  });

  it("is a 404 for everyone while the Teacher view is off", async () => {
    const w = await world();
    setTeacherLiveForTesting(false);
    actAs(w.teacher);
    expect((await getExam(req("/x"), ctx({ classId: w.classId }))).status).toBe(404);
    expect((await getRoster(req(`/x?laptop=${L1}`), examCtx(w))).status).toBe(404);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(404);
    // And a pass is worth nothing then.
    setTeacherLiveForTesting(true);
    const passId = await pass(w);
    setTeacherLiveForTesting(false);
    expect((await startMockWith(passId)).status).toBe(404);
  });
});

describe("starting and joining a class mock", () => {
  it("'same paper' suggests four tasks nobody in the class has done; the second laptop joins the open class mock", async () => {
    const w = await world();
    actAs(w.teacher);
    // A second class with no mock yet: the suggestion and the paper.
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group C" }), ctx({})))) as { class: { id: string } };
    const exam = (await read(await getExam(req("/x"), ctx({ classId: created.class.id })))) as { open: unknown; suggestion: { part: string; taskId: string; title: string }[] };
    expect(exam.open).toBeNull();
    expect(exam.suggestion.map((s) => s.part)).toEqual(["1.1", "1.2", "2", "3"]);
    // The screen sends the paper it showed, so what the teacher saw is what is used.
    const shown = Object.fromEntries(exam.suggestion.map((s) => [s.part, s.taskId]));
    const started = await postExam(req("/x", "POST", { mode: "same", tasks: shown }), ctx({ classId: created.class.id }));
    expect(started.status).toBe(201);
    const first = (await read(started)) as { classMock: { id: string; title: string; paper: { part: string; taskId: string }[] }; joined: boolean };
    expect(first.joined).toBe(false);
    expect(first.classMock.title).toBe("Mock 1");
    expect(first.classMock.paper!.map((p) => p.taskId)).toEqual(exam.suggestion.map((s) => s.taskId));
    // The other laptop starts "again": it joins the same row, whatever mode it asks for.
    const second = await postExam(req("/x", "POST", { mode: "different" }), ctx({ classId: created.class.id }));
    expect(second.status).toBe(200);
    expect(await read(second)).toMatchObject({ joined: true, classMock: { id: first.classMock.id } });
    expect(await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all()).toHaveLength(1);
  });

  it("two laptops pressing Start at the same moment end up on ONE class mock", async () => {
    const w = await world();
    actAs(w.teacher);
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group F" }), ctx({})))) as { class: { id: string } };
    const c = () => ctx({ classId: created.class.id });
    const answers = await Promise.all([postExam(req("/x", "POST", { mode: "different" }), c()), postExam(req("/x", "POST", { mode: "different" }), c())]);
    const ids = new Set((await Promise.all(answers.map(read))).map((a) => a.classMock.id));
    expect(ids.size).toBe(1);
    const rows = await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all();
    expect(rows).toHaveLength(1);
    expect([...ids][0]).toBe(rows[0]!.id);
  });

  it("refuses a made-up paper or mode, and a task in the wrong part", async () => {
    const w = await world();
    actAs(w.teacher);
    const created = (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group D" }), ctx({})))) as { class: { id: string } };
    const c = ctx({ classId: created.class.id });
    expect((await postExam(req("/x", "POST", { mode: "everyone" }), c)).status).toBe(400);
    // "same" without a paper uses the app's own suggestion: four valid tasks.
    const plain = await read(await postExam(req("/x", "POST", { mode: "same" }), ctx({ classId: (await read(await postClass(req("/api/teacher/classes", "POST", { name: "Group E" }), ctx({})))).class.id })));
    expect(plain.classMock.paper).toHaveLength(4);
    expect((await postExam(req("/x", "POST", {}), c)).status).toBe(400);
    expect((await postExam(req("/x", "POST", { mode: "same", tasks: { "1.1": "nope", "1.2": "x", "2": "y", "3": "z" } }), c)).status).toBe(400);
    expect((await postExam(req("/x", "POST", { mode: "same", tasks: { ...TASKS, "2": TASKS["1.1"] } }), c)).status).toBe(400);
    expect(await db.select().from(classMocks).where(eq(classMocks.classId, created.class.id)).all()).toHaveLength(0);
  });

  it("the list shows Not started, In progress (Room 2) and Done, and a student in progress on one laptop can't be picked on the other", async () => {
    const w = await world();
    actAs(w.teacher);
    const list = async (laptop: string) => ((await read(await getRoster(req(`/x?laptop=${laptop}`), examCtx(w)))) as { students: Record<string, any>[] }).students; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((await list(L1)).map((s) => [s.name, s.state, s.pickable])).toEqual([["Aziza", "not_started", true], ["Bekzod", "not_started", true]]);
    const passId = await pass(w, "alice", L2); // Aziza starts in Room 2
    const onL1 = await list(L1);
    expect(onL1.find((s) => s.name === "Aziza")).toMatchObject({ state: "in_progress", room: "Room 2", pickable: false });
    expect(onL1.find((s) => s.name === "Bekzod")).toMatchObject({ state: "not_started", pickable: true });
    expect((await list(L2)).find((s) => s.name === "Aziza")).toMatchObject({ state: "in_progress", pickable: true }); // her own laptop (a reload)
    actAs(w.teacher);
    const refused = await enter(w, w.aliceMember, ALICE_PIN, L1, "Room 1");
    expect(refused.status).toBe(409);
    expect((await read(refused)).error.code).toBe("in_progress_elsewhere");
    // She finishes: Done on both, never pickable again for this class mock.
    await sessionFinished(w, passId, L2);
    expect((await list(L1)).find((s) => s.name === "Aziza")).toMatchObject({ state: "done", pickable: false });
    actAs(w.teacher);
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN, L1))).error.code).toBe("already_done");
  });

  it("a student without a PIN can't be picked", async () => {
    const w = await world({ bobPin: false });
    actAs(w.teacher);
    const students = ((await read(await getRoster(req(`/x?laptop=${L1}`), examCtx(w)))) as { students: Record<string, any>[] }).students; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(students.find((s) => s.name === "Bekzod")).toMatchObject({ hasPin: false, pickable: false });
    const response = await enter(w, w.bobMember, "1234");
    expect(response.status).toBe(409);
    expect((await read(response)).error.code).toBe("no_pin");
  });
});

describe("PIN entry and the lock", () => {
  it("a wrong PIN is counted per laptop, the 5th locks the student on that laptop only, and a correct PIN doesn't get through the lock", async () => {
    const w = await world();
    actAs(w.teacher);
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
    const list = async (laptop: string) => ((await read(await getRoster(req(`/x?laptop=${laptop}`), examCtx(w)))) as { students: Record<string, any>[] }).students.find((s) => s.name === "Aziza")!; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(await list(L1)).toMatchObject({ lockedHere: true, locked: true, pickable: false });
    expect(await list(L2)).toMatchObject({ lockedHere: false, locked: true, pickable: true });
    // The other laptop is not locked: its own count starts at zero.
    expect((await enter(w, w.aliceMember, ALICE_PIN, L2, "Room 2")).status).toBe(200);
    // And Bekzod is not affected on the first laptop.
    expect((await enter(w, w.bobMember, BOB_PIN, L1)).status).toBe(200);
    expect(await db.select().from(examPasses).all()).toHaveLength(2);
  });

  it("parallel guesses can't all count as the first one", async () => {
    const w = await world();
    actAs(w.teacher);
    await Promise.all(Array.from({ length: 12 }, () => enter(w, w.aliceMember, "0000")));
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN))).error.code).toBe("pin_locked");
  });

  it("only the teacher's password unlocks, then the correct PIN works", async () => {
    const w = await world();
    actAs(w.teacher);
    for (let i = 0; i < 5; i++) await enter(w, w.aliceMember, "0000");
    const unlock = (password: unknown) => postUnlock(req("/x", "POST", { memberId: w.aliceMember, password }), examCtx(w));
    expect((await unlock("")).status).toBe(400);
    expect((await unlock("not the password")).status).toBe(400);
    expect((await read(await enter(w, w.aliceMember, ALICE_PIN))).error.code).toBe("pin_locked");
    expect((await unlock(PASSWORD)).status).toBe(204);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(200);
  });

  it("a correct PIN gives a pass for that student, ~30 minutes, with the four public tasks, and a reload on the same laptop replaces it", async () => {
    const w = await world();
    actAs(w.teacher);
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
    actAs(w.teacher);
    const students = ((await read(await getRoster(req(`/x?laptop=${L1}`), examCtx(w)))) as { students: { name: string }[] }).students;
    expect(students.map((s) => s.name)).toEqual(["Bekzod"]);
    expect((await enter(w, w.aliceMember, ALICE_PIN)).status).toBe(404);
  });
});

describe("what a pass can do", () => {
  it("starts the pass's student's mock (not the teacher's), marked In class, and records into the STUDENT's account", async () => {
    const w = await world();
    const passId = await pass(w);
    const start = await startMockWith(passId);
    expect(start.status).toBe(201);
    const { mock } = (await read(start)) as { mock: { id: string; classMockId: string } };
    expect(mock.classMockId).toBe(w.classMockId);
    const session = (await db.select().from(practiceSessions).where(eq(practiceSessions.id, mock.id)).get())!;
    expect(session).toMatchObject({ userId: w.aliceId, kind: "full_mock", status: "in_progress", classMockId: w.classMockId });
    expect(await db.select().from(practiceSessions).where(eq(practiceSessions.userId, w.teacherId)).all()).toEqual([]);

    const { response, body } = await upload("2", mock.id, passHeaders(passId));
    expect(response.status).toBe(201);
    const attempt = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, body.attempt.id)).get())!;
    expect(attempt).toMatchObject({ userId: w.aliceId, sessionId: mock.id });
    expect(await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, w.teacherId)).all()).toEqual([]);
    // Starting again with the same pass resumes the same mock.
    const again = await read(await startMockWith(passId));
    expect(again.mock.id).toBe(mock.id);
    expect(again.resumed).toBe(true);
  });

  it("can't write to another student: another student's mock, the teacher's own mock, no mock at all, or a retry", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice");
    const bobPass = await pass(w, "bob");
    const aliceMock = (await read(await startMockWith(alicePass))).mock.id as string;
    const bobMock = (await read(await startMockWith(bobPass))).mock.id as string;
    // The teacher's own mock, made without a pass.
    actAs(w.teacher);
    const own = (await read(await postStartMock(req("/api/mock-exams", "POST")))).mock.id as string;
    expect((await db.select().from(practiceSessions).where(eq(practiceSessions.id, own)).get())!.userId).toBe(w.teacherId);

    for (const [label, sessionId] of [["bob's mock", bobMock], ["the teacher's own mock", own], ["no mock", null], ["a made-up mock", "00000000-0000-4000-8000-000000000000"]] as const) {
      const { response, body } = await upload("2", sessionId, passHeaders(alicePass));
      expect(response.status, label).toBe(403);
      expect(body.error.code, label).toBe("exam_pass_wrong_student");
    }
    const retry = await upload("2", aliceMock, passHeaders(alicePass), { previousAttemptId: "00000000-0000-4000-8000-000000000001" });
    expect(retry.response.status).toBe(403);
    // Not one recording was stored, for anybody.
    expect(await db.select().from(speakingAttempts).all()).toEqual([]);
    // And the same goes the other way round: Bekzod's pass can't touch Aziza's mock.
    expect((await upload("2", aliceMock, passHeaders(bobPass))).response.status).toBe(403);
    expect((await postFinish(req("/x", "POST", undefined, passHeaders(bobPass)), ctx({ mockId: aliceMock }))).status).toBe(403);
  });

  it("a teacher can't record into their own account through it: a pass never makes the teacher the owner", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    await upload("2", mock, passHeaders(passId));
    await upload("1.2", mock, passHeaders(passId));
    const mine = await db.select().from(speakingAttempts).where(eq(speakingAttempts.userId, w.teacherId)).all();
    expect(mine).toEqual([]);
    expect((await db.select().from(speakingAttempts).all()).every((a) => a.userId === w.aliceId)).toBe(true);
    // Without the pass the teacher's upload is the teacher's own ordinary attempt: it never joins the student's mock.
    actAs(w.teacher);
    const plain = await upload("2", mock, {});
    expect(plain.response.status).toBe(201);
    const stored = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, plain.body.attempt.id)).get())!;
    expect(stored.userId).toBe(w.teacherId);
    expect(stored.sessionId).not.toBe(mock);
  });

  it("is refused for anyone who isn't the pass's own teacher on the pass's own laptop", async () => {
    const w = await world();
    const passId = await pass(w);
    const refusals: [string, Browser, Record<string, string>][] = [
      ["alice herself", w.alice, passHeaders(passId)],
      ["bob", w.bob, passHeaders(passId)],
      ["another teacher", w.otherTeacher, passHeaders(passId)],
      ["a stranger", w.stranger, passHeaders(passId)],
      ["an anonymous browser", w.anonymous, passHeaders(passId)],
      ["the teacher from another laptop", w.teacher, passHeaders(passId, L2)],
      ["the teacher with no laptop id", w.teacher, { "x-exam-pass": passId }],
      ["the teacher with a made-up pass", w.teacher, passHeaders("00000000-0000-4000-8000-000000000000")],
      ["the teacher with a junk pass", w.teacher, passHeaders("../../etc/passwd")],
    ];
    for (const [who, browser, headers] of refusals) {
      actAs(browser);
      const response = await postStartMock(req("/api/mock-exams", "POST", undefined, headers));
      expect(response.status, who).toBe(403);
      expect((await read(response)).error.code, who).toMatch(/^exam_pass_/);
    }
    expect(await db.select().from(practiceSessions).all()).toEqual([]);
    // The pass still works for the right caller afterwards.
    actAs(w.teacher);
    expect((await startMockWith(passId)).status).toBe(201);
  });

  it("is refused once expired", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    await db.update(examPasses).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(examPasses.id, passId)).run();
    const response = await upload("2", mock, passHeaders(passId));
    expect(response.response.status).toBe(403);
    expect(response.body.error.code).toBe("exam_pass_expired");
    expect((await startMockWith(passId)).status).toBe(403);
    expect(await db.select().from(speakingAttempts).all()).toEqual([]);
  });

  it("is used up at the end screen: finish closes the mock and nothing more is accepted", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    const early = await postFinish(req("/x", "POST", undefined, passHeaders(passId)), ctx({ mockId: mock }));
    expect(early.status).toBe(409); // not every part is in
    for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(part, mock, passHeaders(passId))).response.status, part).toBe(201);
    const done = await postFinish(req("/x", "POST", undefined, passHeaders(passId)), ctx({ mockId: mock }));
    expect(done.status).toBe(200);
    expect((await read(done)).mock.status).toBe("finished");
    expect((await db.select().from(examPasses).where(eq(examPasses.id, passId)).get())!.usedUpAt).not.toBeNull();
    for (const [label, call] of [
      ["upload", () => upload("2", mock, passHeaders(passId)).then((r) => r.response)],
      ["start", () => startMockWith(passId)],
      ["finish", () => postFinish(req("/x", "POST", undefined, passHeaders(passId)), ctx({ mockId: mock }))],
    ] as const) {
      const response = await call();
      expect(response.status, label).toBe(403);
    }
    expect((await db.select().from(speakingAttempts).all()).length).toBe(4);
  });

  it("stops at once when the student becomes locked on that laptop", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    await db.update(classMembers).set({ pinFailures: JSON.stringify({ [L1]: 5 }) }).where(eq(classMembers.id, w.aliceMember)).run();
    const response = await upload("2", mock, passHeaders(passId));
    expect(response.response.status).toBe(403);
    expect(response.body.error.code).toBe("exam_pass_locked");
    // A lock on the OTHER laptop doesn't stop this one.
    await db.update(classMembers).set({ pinFailures: JSON.stringify({ [L2]: 5 }) }).where(eq(classMembers.id, w.aliceMember)).run();
    expect((await upload("2", mock, passHeaders(passId))).response.status).toBe(201);
  });

  it("is only read by the mock's start and finish and the upload: no result, recording, attempt or mock of the student opens with it", async () => {
    const w = await world();
    const passId = await pass(w);
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    const attemptId = (await upload("2", mock, passHeaders(passId))).body.attempt.id as string;
    actAs(w.teacher);
    const headers = passHeaders(passId);
    expect((await getAttempt(req("/x", "GET", undefined, headers), ctx({ attemptId }))).status).toBe(404);
    expect((await getMockResult(req("/x", "GET", undefined, headers), ctx({ mockId: mock }))).status).toBe(404);
    // The teacher's own "classes" is still the teacher's own (the pass never changed who they are on other routes).
    expect(await read(await getMyClasses(req("/api/classes", "GET", undefined, headers), ctx({})))).toEqual({ classes: [] });
    // ... and the student's own account still sees the attempt.
    actAs(w.alice);
    expect((await getAttempt(req("/x"), ctx({ attemptId }))).status).toBe(200);
  });

  it("a closed class mock refuses new PINs and new mocks, but a student already under way finishes", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice", L1);
    const aliceMock = (await read(await startMockWith(alicePass))).mock.id as string;
    const bobPass = await pass(w, "bob", L2);
    actAs(w.teacher);
    // The teacher ends Room 2 and closes the class mock (Bekzod hasn't tapped Start mock yet).
    expect((await postEnd(req("/x", "POST", { password: PASSWORD, laptopId: L2, close: true }), examCtx(w))).status).toBe(204);
    expect((await db.select().from(classMocks).get())!.closedAt).not.toBeNull();
    const closed = await enter(w, w.bobMember, BOB_PIN, L1);
    expect(closed.status).toBe(409);
    expect((await read(closed)).error.code).toBe("class_mock_closed");
    expect((await startMockWith(bobPass, L2)).status).toBe(403); // his pass ended with Room 2
    for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(part, aliceMock, passHeaders(alicePass))).response.status, part).toBe(201);
    expect((await postFinish(req("/x", "POST", undefined, passHeaders(alicePass)), ctx({ mockId: aliceMock }))).status).toBe(200);
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
    expect((await startMockWith(alicePass)).status).toBe(403);
    expect((await startMockWith(bobPass, L2)).status).toBe(201);
  });

  it("Close class closes its class mock, ends every pass and drops every PIN", async () => {
    const w = await world();
    const alicePass = await pass(w, "alice");
    actAs(w.teacher);
    expect((await postClose(req("/x", "POST"), ctx({ classId: w.classId }))).status).toBe(204);
    expect((await db.select().from(classMocks).get())!.closedAt).not.toBeNull();
    expect((await db.select().from(examPasses).where(eq(examPasses.id, alicePass)).get())!.usedUpAt).not.toBeNull();
    expect((await db.select().from(classMembers).all()).every((m) => m.pinHash === null && m.pinFailures === null)).toBe(true);
    expect((await startMockWith(alicePass)).status).toBe(403);
    expect((await getRoster(req(`/x?laptop=${L1}`), examCtx(w))).status).toBe(404); // the class is gone from every list
  });
});

describe("End exam laptop", () => {
  it("needs the teacher's password: wrong or missing changes nothing; the right one ends this laptop's passes only", async () => {
    const w = await world();
    const room1 = await pass(w, "alice", L1);
    const room2 = await pass(w, "bob", L2);
    actAs(w.teacher);
    const end = (password: unknown, laptop = L1, close = false) => postEnd(req("/x", "POST", { password, laptopId: laptop, close }), examCtx(w));
    for (const bad of [undefined, "", "wrong password", 12345]) {
      const response = await end(bad);
      expect(response.status, String(bad)).toBe(400);
    }
    const open = async () => (await db.select().from(examPasses).all()).filter((p) => p.usedUpAt === null).map((p) => p.id);
    expect((await open()).sort()).toEqual([room1, room2].sort());
    expect((await end(PASSWORD)).status).toBe(204);
    expect(await open()).toEqual([room2]);
    expect((await db.select().from(classMocks).get())!.closedAt).toBeNull();
    // A student can't do it: the route is the teacher's.
    actAs(w.alice);
    expect((await postEnd(req("/x", "POST", { password: PASSWORD, laptopId: L2, close: true }), examCtx(w))).status).toBe(404);
    expect(await open()).toEqual([room2]);
  });

  it("wrong passwords count like failed sign-ins, so the screen can't be used to guess the teacher's password", async () => {
    const w = await world();
    actAs(w.teacher);
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await postEnd(req("/x", "POST", { password: `wrong ${i}`, laptopId: L1 }, { "x-forwarded-for": "10.99.0.1" }), examCtx(w))).status;
    expect(last).toBe(429);
    expect((await postEnd(req("/x", "POST", { password: PASSWORD, laptopId: L1 }, { "x-forwarded-for": "10.99.0.1" }), examCtx(w))).status).toBe(429);
  });
});

describe("results (T8) and In class / At home", () => {
  it("one row per student with level and part bands, 'In class' for the laptop mock and 'At home' for another; closed mocks keep their results", async () => {
    const w = await world();
    const passId = await pass(w, "alice");
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    for (const part of ["1.1", "1.2", "2", "3"] as const) await upload(part, mock, passHeaders(passId));
    await postFinish(req("/x", "POST", undefined, passHeaders(passId)), ctx({ mockId: mock }));
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
    const results = (await read(await getResults(req("/x"), examCtx(w)))) as { rows: Record<string, any>[]; classMock: { title: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(results.classMock.title).toBe("Mock 1");
    expect(results.rows.map((r) => [r.name, r.state])).toEqual([["Aziza", "finished"], ["Bekzod", "not_started"]]);
    const aziza = results.rows[0]!;
    expect(aziza.bands.map((b: { part: string }) => b.part)).toEqual(["1.1", "1.2", "2", "3"]);
    expect(aziza.mockId).toBe(mock);
    // Closing keeps the results readable.
    expect((await postEnd(req("/x", "POST", { password: PASSWORD, laptopId: L1, close: true }), examCtx(w))).status).toBe(204);
    expect((await getResults(req("/x"), examCtx(w))).status).toBe(200);
  });
});

describe("no PIN, hash or failure count in any response", () => {
  it("none of the responses read in a whole class session holds one", async () => {
    const w = await world();
    actAs(w.teacher);
    await enter(w, w.aliceMember, "0000"); // a wrong try
    await getRoster(req(`/x?laptop=${L1}`), examCtx(w)).then(read);
    const passId = await pass(w, "alice");
    const mock = (await read(await startMockWith(passId))).mock.id as string;
    await upload("2", mock, passHeaders(passId));
    actAs(w.teacher);
    await getResults(req("/x"), examCtx(w)).then(read);
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

  it("the teacher's pages and the student's list never expose another student's PIN state beyond 'set' (the teacher sees only 'has a PIN')", async () => {
    const w = await world();
    actAs(w.teacher);
    const text = JSON.stringify(await read(await getRoster(req(`/x?laptop=${L1}`), examCtx(w))));
    expect(text).not.toMatch(/scrypt|\$[0-9a-f]{32}/);
    const row = (await db.select().from(classMembers).where(and(eq(classMembers.id, w.aliceMember))).get())!;
    expect(text).not.toContain(row.pinHash!);
  });
});

/** Aziza finishes a whole mock on `laptop` with her pass (helper for the list test). */
async function sessionFinished(w: World, passId: string, laptop: string) {
  actAs(w.teacher);
  const mock = (await read(await startMockWith(passId, laptop))).mock.id as string;
  for (const part of ["1.1", "1.2", "2", "3"] as const) expect((await upload(part, mock, passHeaders(passId, laptop))).response.status, part).toBe(201);
  expect((await postFinish(req("/x", "POST", undefined, passHeaders(passId, laptop)), ctx({ mockId: mock }))).status).toBe(200);
}
