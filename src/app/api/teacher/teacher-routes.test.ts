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
vi.setConfig({ testTimeout: 60_000 });

import { eq } from "drizzle-orm";
import { SHARE_TEXT_VERSION } from "@/domain/teacher/rules";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { listAttemptHistory, getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classMembers, classes, ratingPairs, teacherRatings, users } from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { teacherCanSee } from "@/server/teacher/teacher-store";
import { PASSWORD, signUp } from "../../../../test/auth-helpers";
import { TASK_ID } from "../../../../test/db-helpers";
import { fakeWebm } from "../../../../test/fixtures";
import { jar } from "../../../../test/next-headers-mock";
import { PUT as putExamDate } from "../account/exam-date/route";
import { PUT as putName } from "../account/name/route";
import { PUT as putRole } from "../account/role/route";
import { GET as getMe } from "../account/me/route";
import { POST as postSession } from "../sessions/route";
import { GET as getAudio } from "../speaking/attempts/[attemptId]/audio/route";
import { GET as getOwnAttempt } from "../speaking/attempts/[attemptId]/route";
import { POST as postAttempt } from "../speaking/attempts/route";
import { POST as postLeave } from "../classes/[memberId]/leave/route";
import { POST as postLookup } from "../classes/lookup/route";
import { GET as getMyClasses, POST as postShare } from "../classes/route";
import { GET as getAttempt } from "./classes/[classId]/attempts/[attemptId]/route";
import { PUT as putRating } from "./classes/[classId]/attempts/[attemptId]/rating/route";
import { POST as postClose } from "./classes/[classId]/close/route";
import { POST as postCode } from "./classes/[classId]/code/route";
import { GET as getClass } from "./classes/[classId]/route";
import { DELETE as deleteStudent, GET as getStudent } from "./classes/[classId]/students/[memberId]/route";
import { GET as getClasses, POST as postClass } from "./classes/route";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * The Teacher view's server side (docs/teacher-plan.md, sections 3–5 and 8), through the real route handlers, as
 * cross-user.test.ts does: each "browser" is a cookie jar. Every endpoint × the class's teacher, another teacher, a
 * student, a stranger and an anonymous browser; what a teacher may read (never an email, account name, recording or
 * exam date); Leave / Remove / Close; anonymous pairs; the join-code limit; and the release switch.
 */

let db: Db;
let dir: string;
let ipCounter = 0;
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
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) }) as never;

async function register(email: string, name: string, role: "student" | "teacher" = "student"): Promise<Browser> {
  jar.clear();
  expect((await signUp(email, PASSWORD, { ip: `10.20.0.${++ipCounter}` })).status).toBe(200);
  expect((await putName(req("/api/account/name", "PUT", { name }))).status).toBe(200);
  // Teachers sign themselves up (PUT /api/account/role) or the owner's script sets it; here, the same UPDATE.
  if (role === "teacher") await db.update(users).set({ role: "teacher" }).where(eq(users.email, email)).run();
  return snapshot();
}

/** Record and score one answer as the current browser (mock providers). `retryOf`: the attempt it retries. */
async function practise(retryOf?: string): Promise<string> {
  const sessionId = ((await (await postSession()).json()) as { sessionId: string }).sessionId;
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  form.set("sessionId", sessionId);
  if (retryOf) form.set("previousAttemptId", retryOf);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  expect(response.status).toBe(201);
  const id = ((await response.json()) as { attempt: { id: string } }).attempt.id;
  while (afterTasks.length) await afterTasks.shift()!();
  return id;
}

const body = async (response: Response) => (response.status === 204 ? "" : await response.text());

interface World {
  teacher: Browser;
  otherTeacher: Browser;
  alice: Browser;
  bob: Browser;
  classId: string;
  code: string;
  memberId: string;
  /** Alice's attempt made before she shared, and two after (the second a retry of the first). */
  before: string;
  shared: string;
  sharedRetry: string;
  /** A retry, after sharing, of the attempt from before sharing. */
  retryOfBefore: string;
  examDate: string;
}

/** Ms Karimova's class; Alice practises, shares as "Ali", practises again; Bob is a student elsewhere. */
async function world(): Promise<World> {
  const teacher = await register("karimova@school.example", "Ms Karimova", "teacher");
  const created = await postClass(req("/api/teacher/classes", "POST", { name: "Group B" }), ctx({}));
  expect(created.status).toBe(201);
  const { class: cls } = (await created.json()) as { class: { id: string; joinCode: string } };
  const otherTeacher = await register("other@school.example", "Mr Other", "teacher");
  const bob = await register("bob@example.com", "Bob Bobson");

  const alice0 = await register("alice@example.com", "Alice Example");
  const examDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  expect((await putExamDate(req("/api/account/exam-date", "PUT", { date: examDate }))).status).toBe(204);
  const before = await practise();
  expect((await postShare(req("/api/classes", "POST", { code: cls.joinCode.toLowerCase(), shownName: "Ali" }), ctx({}))).status).toBe(201);
  const shared = await practise();
  const sharedRetry = await practise(shared);
  const retryOfBefore = await practise(before);
  const memberId = (await db.select().from(classMembers).get())!.id;
  void alice0;
  return { teacher, otherTeacher, alice: snapshot(), bob, classId: cls.id, code: cls.joinCode, memberId, before, shared, sharedRetry, retryOfBefore, examDate };
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-teacher-"));
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

/** Every teacher endpoint for one world, as (name, call). */
function teacherEndpoints(w: World) {
  const c = { classId: w.classId };
  return [
    ["GET classes", () => getClasses(req("/api/teacher/classes"), ctx({}))],
    ["GET class", () => getClass(req(`/x`), ctx(c))],
    ["GET student", () => getStudent(req(`/x`), ctx({ ...c, memberId: w.memberId }))],
    ["GET attempt", () => getAttempt(req(`/x`), ctx({ ...c, attemptId: w.shared }))],
    ["PUT rating", () => putRating(req(`/x`, "PUT", { agrees: true }), ctx({ ...c, attemptId: w.shared }))],
    ["POST code", () => postCode(req(`/x`, "POST"), ctx(c))],
    ["DELETE student", () => deleteStudent(req(`/x`, "DELETE"), ctx({ ...c, memberId: w.memberId }))],
    ["POST close", () => postClose(req(`/x`, "POST"), ctx(c))],
  ] as const;
}

describe("access: every teacher endpoint × caller", () => {
  it("only the class's teacher gets in; another teacher, a student, a stranger and an anonymous browser get 404", async () => {
    const w = await world();
    const stranger = await register("stranger@example.com", "Stranger Danger");
    jar.clear();
    const anonymous = snapshot();
    // Read and rating endpoints first (close/remove end the class).
    for (const [name, call] of teacherEndpoints(w)) {
      if (name === "GET classes") continue; // everyone's own list: tested below
      for (const [who, browser] of [["other teacher", w.otherTeacher], ["student", w.alice], ["stranger", stranger], ["anonymous", anonymous]] as const) {
        actAs(browser);
        expect((await call()).status, `${name} as ${who}`).toBe(404);
      }
    }
    // Nothing was changed by those calls.
    expect(await db.select().from(teacherRatings).all()).toHaveLength(0);
    expect((await db.select().from(classes).get())!.closedAt).toBeNull();

    // GET classes: a teacher sees only their own; anyone else 404.
    actAs(w.otherTeacher);
    expect(await (await getClasses(req("/x"), ctx({}))).json()).toEqual({ classes: [] });
    for (const browser of [w.alice, stranger, anonymous]) {
      actAs(browser);
      expect((await getClasses(req("/x"), ctx({}))).status).toBe(404);
      expect((await postClass(req("/x", "POST", { name: "Mine" }), ctx({}))).status).toBe(404);
    }

    actAs(w.teacher);
    for (const [name, call] of teacherEndpoints(w)) expect((await call()).status, name).toBeLessThan(300);
  });

  it("responses never hold an email, an account name, a recording or the exam date", async () => {
    const w = await world();
    actAs(w.teacher);
    const texts = [
      await body(await getClasses(req("/x"), ctx({}))),
      await body(await getClass(req("/x"), ctx({ classId: w.classId }))),
      await body(await getStudent(req("/x"), ctx({ classId: w.classId, memberId: w.memberId }))),
      await body(await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.shared }))),
      await body(await putRating(req("/x", "PUT", { agrees: false, band: 4 }), ctx({ classId: w.classId, attemptId: w.shared }))),
    ];
    for (const text of texts) {
      expect(text).not.toContain("@");
      expect(text).not.toContain("Alice");
      expect(text).not.toContain("Example");
      expect(text).not.toContain(w.examDate);
      // No storage key, no student recording route; the only audio address is the teacher's own route (and only when
      // the teacher may hear it: teacher-v1.test.ts).
      expect(text.replace(/\/api\/teacher\/classes\/[^"]+\/audio/g, "")).not.toContain("/audio");
      expect(text).not.toContain("/api/speaking/");
      expect(text.toLowerCase()).not.toContain("storage");
      expect(text).not.toMatch(/"recording/i);
    }
    expect(texts[1]).toContain('"name":"Ali"');
    // The recording and the student's own attempt endpoints refuse the teacher.
    expect((await getAudio(req("/x"), ctx({ attemptId: w.shared }))).status).toBe(404);
    expect((await getOwnAttempt(req("/x"), ctx({ attemptId: w.shared }))).status).toBe(404);
  });

  it("the student's side: lookup shows the teacher's name and the class only; my classes show only my own", async () => {
    const w = await world();
    actAs(w.bob);
    const lookup = await postLookup(req("/x", "POST", { code: ` ${w.code.slice(0, 3)}-${w.code.slice(3).toLowerCase()} ` }), ctx({}));
    expect(await lookup.json()).toEqual({ className: "Group B", teacherName: "Ms Karimova" });
    expect(await (await getMyClasses(req("/x"), ctx({}))).json()).toEqual({ classes: [] });
    actAs(w.alice);
    const mine = (await (await getMyClasses(req("/x"), ctx({}))).json()) as { classes: Record<string, unknown>[] };
    expect(mine.classes).toEqual([{ id: w.memberId, className: "Group B", teacherName: "Ms Karimova", shownName: "Ali", sharedAt: expect.any(String), endedBy: null, needsUpgrade: false, hasPin: false }]);
    expect(JSON.stringify(mine)).not.toContain("@");
    // Anonymous: 401 on the student endpoints.
    jar.clear();
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(401);
    expect((await postShare(req("/x", "POST", { code: w.code, shownName: "X" }), ctx({}))).status).toBe(401);
    expect((await getMyClasses(req("/x"), ctx({}))).status).toBe(401);
    // A stranger can't leave Alice's membership.
    actAs(w.bob);
    expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
  });

  it("writes from another site are refused (403)", async () => {
    const w = await world();
    actAs(w.teacher);
    const evil = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
    expect((await postClose(evil, ctx({ classId: w.classId }))).status).toBe(403);
    expect((await db.select().from(classes).get())!.closedAt).toBeNull();
  });
});

describe("teacherCanSee", () => {
  it("not a teacher, another teacher, before shared_at: no; the class's teacher after shared_at: yes", async () => {
    const w = await world();
    const id = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())!.id;
    const [teacherId, otherId, aliceId] = [await id("karimova@school.example"), await id("other@school.example"), await id("alice@example.com")];
    expect(await teacherCanSee(teacherId, w.shared)).toMatchObject({ classId: w.classId, memberId: w.memberId, shownName: "Ali" });
    expect(await teacherCanSee(teacherId, w.before)).toBeNull();
    expect(await teacherCanSee(otherId, w.shared)).toBeNull();
    expect(await teacherCanSee(aliceId, w.shared)).toBeNull();
    expect(await teacherCanSee(teacherId, "no-such-attempt")).toBeNull();
    // A teacher whose role is taken away sees nothing.
    await db.update(users).set({ role: "student" }).where(eq(users.id, teacherId)).run();
    expect(await teacherCanSee(teacherId, w.shared)).toBeNull();
  });

  it("ended: no; rejoined: only attempts after the NEW shared_at; closed: no", async () => {
    const w = await world();
    const teacherId = (await db.select({ id: classes.teacherUserId }).from(classes).get())!.id;
    actAs(w.alice);
    expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(204);
    expect(await teacherCanSee(teacherId, w.shared)).toBeNull();
    const between = await practise();
    expect((await postShare(req("/x", "POST", { code: w.code, shownName: "Ali" }), ctx({}))).status).toBe(201);
    const after = await practise();
    expect(await teacherCanSee(teacherId, w.shared)).toBeNull();
    expect(await teacherCanSee(teacherId, between)).toBeNull();
    expect(await teacherCanSee(teacherId, after)).not.toBeNull();
    actAs(w.teacher);
    expect((await postClose(req("/x", "POST"), ctx({ classId: w.classId }))).status).toBe(204);
    expect(await teacherCanSee(teacherId, after)).toBeNull();
  });
});

describe("what a teacher reads", () => {
  it("only shared Part 2 attempts; a retry of an attempt from before sharing has no comparison", async () => {
    const w = await world();
    actAs(w.teacher);
    const student = (await (await getStudent(req("/x"), ctx({ classId: w.classId, memberId: w.memberId }))).json()) as {
      student: { name: string; rows: { id: string; href: string; retry: unknown }[] };
    };
    expect(student.student.name).toBe("Ali");
    expect(student.student.rows.map((r) => r.id)).toEqual([w.retryOfBefore, w.sharedRetry, w.shared]);
    expect(student.student.rows[0].retry).toBeNull(); // its original was before sharing: not even marked a retry
    expect(student.student.rows[1].retry).not.toBeNull();
    expect(student.student.rows[0].href).toBe(`/teacher/classes/${w.classId}/attempts/${w.retryOfBefore}`);

    const retry = (await (await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.sharedRetry }))).json()) as { attempt: { previousResult: unknown; transcript: string } };
    expect(retry.attempt.previousResult).not.toBeNull();
    expect(retry.attempt.transcript.length).toBeGreaterThan(0);
    const ofBefore = (await (await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.retryOfBefore }))).json()) as { attempt: { previousResult: unknown } };
    expect(ofBefore.attempt.previousResult).toBeNull();
    expect((await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.before }))).status).toBe(404);

    const overview = (await (await getClass(req("/x"), ctx({ classId: w.classId }))).json()) as { students: { attempts: number }[]; commonProblems: { count: number; of: number }[] };
    expect(overview.students).toHaveLength(1);
    expect(overview.students[0].attempts).toBe(3);
    expect(overview.commonProblems[0]).toMatchObject({ count: 1, of: 1 });
  });

  it("ratings: Agree, Choose level, Change; never change the student's result, dashboard data or History", async () => {
    const w = await world();
    const aliceId = (await db.select({ id: users.id }).from(users).where(eq(users.email, "alice@example.com")).get())!.id;
    const resultBefore = await getAttemptViewForUser(aliceId, w.shared);
    const historyBefore = await listAttemptHistory(aliceId);
    actAs(w.teacher);
    const at = ctx({ classId: w.classId, attemptId: w.shared });
    expect(await (await putRating(req("/x", "PUT", { agrees: true }), at)).json()).toEqual({ rating: { agrees: true } });
    expect(await (await putRating(req("/x", "PUT", { agrees: false, band: 4 }), at)).json()).toEqual({ rating: { agrees: false, band: 4 } });
    for (const bad of [{}, { agrees: false }, { agrees: false, band: 9 }, { agrees: false, band: -1 }, { agrees: false, band: 2.5 }, { band: 3 }]) {
      expect((await putRating(req("/x", "PUT", bad), at)).status, JSON.stringify(bad)).toBe(400);
    }
    const rows = await db.select().from(teacherRatings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agrees: false, teacherBand: 4, classId: w.classId });
    expect(typeof rows[0].appBand).toBe("number");
    expect(rows[0].evaluatorVersion).toBeTruthy();
    const attempt = (await (await getAttempt(req("/x"), at)).json()) as { attempt: { rating: unknown } };
    expect(attempt.attempt.rating).toEqual({ agrees: false, band: 4 });

    expect(await getAttemptViewForUser(aliceId, w.shared)).toEqual(resultBefore);
    expect(await listAttemptHistory(aliceId)).toEqual(historyBefore);
  });
});

describe("Leave, Remove, Close: 404 at once; each rating becomes one id-free pair", () => {
  const PAIR_COLUMNS = ["appBand", "evaluatorVersion", "month", "part", "rubricVersion", "teacherBand"];

  async function rateTwo(w: World) {
    actAs(w.teacher);
    await putRating(req("/x", "PUT", { agrees: true }), ctx({ classId: w.classId, attemptId: w.shared }));
    await putRating(req("/x", "PUT", { agrees: false, band: 1 }), ctx({ classId: w.classId, attemptId: w.sharedRetry }));
    expect(await db.select().from(teacherRatings).all()).toHaveLength(2);
  }

  async function expectPairs(w: World) {
    expect(await db.select().from(teacherRatings).all()).toHaveLength(0);
    const pairs = await db.select().from(ratingPairs).all();
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) {
      expect(Object.keys(pair).sort()).toEqual(PAIR_COLUMNS);
      expect(pair.part).toBe("2");
      expect(pair.month).toMatch(/^\d{4}-\d{2}$/);
      expect(JSON.stringify(pair)).not.toMatch(new RegExp([w.classId, w.memberId, w.shared, w.sharedRetry].join("|")));
    }
    expect(pairs.map((p) => p.teacherBand).sort()).toEqual([1, pairs.find((p) => p.teacherBand !== 1)?.appBand ?? 1].sort());
    // The teacher's next request is a 404, and the student is gone from the overview and its counts.
    actAs(w.teacher);
    expect((await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.shared }))).status).toBe(404);
    expect((await getStudent(req("/x"), ctx({ classId: w.classId, memberId: w.memberId }))).status).toBe(404);
  }

  it("Leave (the student)", async () => {
    const w = await world();
    await rateTwo(w);
    actAs(w.alice);
    expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(204);
    await expectPairs(w);
    const overview = (await (await getClass(req("/x"), ctx({ classId: w.classId }))).json()) as { students: unknown[]; commonProblems: unknown[] };
    expect(overview.students).toEqual([]);
    expect(overview.commonProblems).toEqual([]);
    expect((await db.select().from(classMembers).get())!.endedBy).toBe("student");
    // A student who left no longer lists the class.
    actAs(w.alice);
    expect(await (await getMyClasses(req("/x"), ctx({}))).json()).toEqual({ classes: [] });
  });

  it("Remove (the teacher): the student sees \"no longer in this class\" (endedBy teacher)", async () => {
    const w = await world();
    await rateTwo(w);
    expect((await deleteStudent(req("/x", "DELETE"), ctx({ classId: w.classId, memberId: w.memberId }))).status).toBe(204);
    await expectPairs(w);
    actAs(w.alice);
    const mine = (await (await getMyClasses(req("/x"), ctx({}))).json()) as { classes: { endedBy: string }[] };
    expect(mine.classes[0].endedBy).toBe("teacher");
  });

  it("Close (the teacher): the class leaves the teacher's list; the student sees endedBy class_closed; the code stops working", async () => {
    const w = await world();
    await rateTwo(w);
    expect((await postClose(req("/x", "POST"), ctx({ classId: w.classId }))).status).toBe(204);
    await expectPairs(w);
    expect(await (await getClasses(req("/x"), ctx({}))).json()).toEqual({ classes: [] });
    expect((await getClass(req("/x"), ctx({ classId: w.classId }))).status).toBe(404);
    actAs(w.alice);
    expect(((await (await getMyClasses(req("/x"), ctx({}))).json()) as { classes: { endedBy: string }[] }).classes[0].endedBy).toBe("class_closed");
    actAs(w.bob);
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(404);
  });

  it("Reset code: the old code stops, the new one works, members stay", async () => {
    const w = await world();
    actAs(w.teacher);
    const { joinCode } = (await (await postCode(req("/x", "POST"), ctx({ classId: w.classId }))).json()) as { joinCode: string };
    expect(joinCode).not.toBe(w.code);
    expect(joinCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    actAs(w.bob);
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(404);
    expect((await postLookup(req("/x", "POST", { code: joinCode }), ctx({}))).status).toBe(200);
    actAs(w.teacher);
    expect((await getStudent(req("/x"), ctx({ classId: w.classId, memberId: w.memberId }))).status).toBe(200);
  });
});

describe("joining", () => {
  it("nothing is stored before the Share tap", async () => {
    const w = await world();
    actAs(w.bob);
    const before = (await db.select().from(classMembers).all()).length;
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(200);
    expect(await db.select().from(classMembers).all()).toHaveLength(before);
    expect((await postShare(req("/x", "POST", { code: w.code, shownName: "Bobby" }), ctx({}))).status).toBe(201);
    expect(await db.select().from(classMembers).all()).toHaveLength(before + 1);
    // Twice: 409, nothing new.
    expect((await postShare(req("/x", "POST", { code: w.code, shownName: "Bobby" }), ctx({}))).status).toBe(409);
    const row = (await db.select().from(classMembers).all()).find((m) => m.shownName === "Bobby")!;
    expect(row.shareTextVersion).toBe(SHARE_TEXT_VERSION);
    expect(SHARE_TEXT_VERSION).toBe("v1-all-parts-audio");
  });

  it("the shown name: required, no email, at most 30 characters", async () => {
    const w = await world();
    actAs(w.bob);
    for (const shownName of ["", "   ", "bob@example.com", "x".repeat(31), 42]) {
      expect((await postShare(req("/x", "POST", { code: w.code, shownName }), ctx({}))).status, String(shownName)).toBe(400);
    }
  });

  it("10 wrong codes per account per hour; then even the right code waits; another account is unaffected", async () => {
    const w = await world();
    actAs(w.bob);
    for (let i = 0; i < 10; i++) {
      const response = await postLookup(req("/x", "POST", { code: `WRONG${i}` }), ctx({}));
      expect(response.status).toBe(404);
      expect(((await response.json()) as { error: { message: string } }).error.message).toBe("We can't find a class with this code.");
    }
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(429);
    expect((await postShare(req("/x", "POST", { code: w.code, shownName: "Bob" }), ctx({}))).status).toBe(429);
    actAs(await register("carol@example.com", "Carol"));
    expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(200);
  });
});

describe("roles: only the caller's own role endpoint (and the owner's script) set one", () => {
  it("sign-up, the name endpoint and the class endpoints never set a role", async () => {
    jar.clear();
    const response = await signUp("sneaky@example.com", PASSWORD, { ip: "10.30.0.1" });
    expect(response.status).toBe(200);
    await putName(req("/x", "PUT", { name: "Sneaky", role: "teacher" }));
    await postClass(req("/x", "POST", { name: "Mine", role: "teacher" }), ctx({}));
    await postShare(req("/x", "POST", { code: "ABCDEF", shownName: "S", role: "teacher" }), ctx({}));
    expect((await db.select({ role: users.role }).from(users).where(eq(users.email, "sneaky@example.com")).get())!.role).toBe("student");
    expect(JSON.stringify(await (await getMe()).json())).not.toContain("role");
  });

  it("a person takes the teacher role for their own account, with the terms stored; a student role closes their classes", async () => {
    actAs(await register("tina@example.com", "Tina"));
    const roleOf = async () => db.select({ role: users.role, v: users.teacherTermsVersion, at: users.teacherTermsAt }).from(users).where(eq(users.email, "tina@example.com")).get();
    // Not without the terms, and only the two known roles.
    expect((await putRole(req("/x", "PUT", { role: "teacher" }))).status).toBe(400);
    expect((await putRole(req("/x", "PUT", { role: "teacher", acceptedTerms: "yes" }))).status).toBe(400);
    expect((await putRole(req("/x", "PUT", { role: "admin", acceptedTerms: true }))).status).toBe(400);
    expect((await roleOf())!.role).toBe("student");
    expect((await putRole(req("/x", "PUT", { role: "teacher", acceptedTerms: true }))).status).toBe(204);
    const taken = (await roleOf())!;
    expect(taken.role).toBe("teacher");
    expect(taken.v).toBe("teacher-terms-v1");
    expect(taken.at).toBeTruthy();
    // She can now run a class; giving the role back closes it.
    const made = await postClass(req("/x", "POST", { name: "Evening group" }), ctx({}));
    expect(made.status).toBe(201);
    const classId = ((await made.json()) as { class: { id: string } }).class.id;
    expect((await putRole(req("/x", "PUT", { role: "student" }))).status).toBe(204);
    const back = (await roleOf())!;
    expect(back.role).toBe("student");
    expect(back.v).toBeNull();
    expect(back.at).toBeNull();
    expect((await db.select({ closedAt: classes.closedAt }).from(classes).where(eq(classes.id, classId)).get())!.closedAt).toBeTruthy();
    expect((await postClass(req("/x", "POST", { name: "Again" }), ctx({}))).status).toBe(404);
  });

  it("an anonymous browser cannot take the role, and the role never changes someone else's account", async () => {
    jar.clear();
    expect((await putRole(req("/x", "PUT", { role: "teacher", acceptedTerms: true }))).status).toBe(403);
    actAs(await register("uma@example.com", "Uma"));
    // The id is never read from the request.
    expect((await putRole(req("/x", "PUT", { role: "teacher", acceptedTerms: true, userId: "someone-else" }))).status).toBe(204);
    const roles = await db.select({ email: users.email, role: users.role }).from(users).all();
    expect(roles.filter((r) => r.role === "teacher").map((r) => r.email)).toEqual(["uma@example.com"]);
  });

  it("the release switch closes the role endpoint's effect too: a teacher page stays a 404 when it is off", async () => {
    actAs(await register("vera@example.com", "Vera"));
    expect((await putRole(req("/x", "PUT", { role: "teacher", acceptedTerms: true }))).status).toBe(204);
    setTeacherLiveForTesting(false);
    expect((await getClasses(req("/x"), ctx({}))).status).toBe(404);
  });

  it("no route file under src/app/api writes users.role", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name === "route.ts") files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src/app/api"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/role\s*:/);
  });
});

describe("the release switch (no parent consent yet): every endpoint is a 404 for everyone", () => {
  it("teacher and student endpoints", async () => {
    const w = await world();
    setTeacherLiveForTesting(false);
    for (const browser of [w.teacher, w.alice]) {
      actAs(browser);
      for (const [name, call] of teacherEndpoints(w)) expect((await call()).status, name).toBe(404);
      expect((await postClass(req("/x", "POST", { name: "New" }), ctx({}))).status).toBe(404);
      expect((await postLookup(req("/x", "POST", { code: w.code }), ctx({}))).status).toBe(404);
      expect((await postShare(req("/x", "POST", { code: w.code, shownName: "A" }), ctx({}))).status).toBe(404);
      expect((await getMyClasses(req("/x"), ctx({}))).status).toBe(404);
      expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
    }
    expect(await db.select().from(teacherRatings).all()).toHaveLength(0);
    expect((await db.select().from(classes).get())!.closedAt).toBeNull();
  });

  it("is off in the code: TEACHER_LIVE is false", async () => {
    setTeacherLiveForTesting(undefined);
    const { TEACHER_LIVE } = await import("@/config/features");
    expect(TEACHER_LIVE).toBe(false);
  });
});
