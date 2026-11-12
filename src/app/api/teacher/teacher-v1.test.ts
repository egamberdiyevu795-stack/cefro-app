import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
vi.mock("next/headers", async () => (await import("../../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 60_000 });

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getAnySpeakingTask } from "@/content/speaking";
import { LEGACY_SHARE_TEXT_VERSION } from "@/domain/teacher/rules";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import * as repo from "@/server/attempts/attempt-repository";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classMembers, practiceSessions, ratingPairs, recordings, teacherMockRatings, teacherRatings, users } from "@/server/db/schema";
import { demoPartView } from "@/server/demo/demo-mock";
import { newId } from "@/server/ids";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { PASSWORD, signUp } from "../../../../test/auth-helpers";
import { jar } from "../../../../test/next-headers-mock";
import { PUT as putName } from "../account/name/route";
import { GET as getMyAudio } from "../speaking/attempts/[attemptId]/audio/route";
import { GET as getMockResult } from "../mock-exams/[mockId]/result/route";
import { POST as postDecline } from "../classes/[memberId]/decline-upgrade/route";
import { POST as postLeave } from "../classes/[memberId]/leave/route";
import { POST as postUpgrade } from "../classes/[memberId]/upgrade/route";
import { POST as postShare } from "../classes/route";
import { GET as getAttempt } from "./classes/[classId]/attempts/[attemptId]/route";
import { GET as getAudio } from "./classes/[classId]/attempts/[attemptId]/audio/route";
import { PUT as putRating } from "./classes/[classId]/attempts/[attemptId]/rating/route";
import { GET as getMock } from "./classes/[classId]/mocks/[mockId]/route";
import { PUT as putMockRating } from "./classes/[classId]/mocks/[mockId]/rating/route";
import { GET as getStudent } from "./classes/[classId]/students/[memberId]/route";
import { GET as getClass } from "./classes/[classId]/route";
import { POST as postClass } from "./classes/route";
import type { ExamPartId } from "@/domain/speaking/exam-part";

/*
 * Teacher v1 (docs/v1-plan.md, step 6) through the real route handlers: every new route × the class's teacher, another
 * teacher, a student, a stranger and an anonymous browser; no email, account name or exam date anywhere; recordings refused
 * to anyone but the teacher who may hear them; and what happens at Leave, consent withdrawn and audio deletion.
 */

const PARTS: Record<ExamPartId, string> = { "1.1": "a2-part1-1-daily-life", "1.2": "b1-part1-2-shopping", "2": "b2-part2-a-tradition", "3": "c1-part3-cars-in-city-centres" };
const BYTES = Buffer.from("RIFF-fake-audio-bytes-0123456789");

let db: Db;
let dir: string;
let ipCounter = 0;
type Browser = Map<string, string>;
const actAs = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
const snapshot = (): Browser => new Map(jar);
const req = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", origin: "http://localhost", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) }) as never;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = async (response: Response) => (response.status === 204 ? "" : await response.text());

async function register(email: string, name: string, role: "student" | "teacher" = "student"): Promise<{ browser: Browser; id: string }> {
  jar.clear();
  expect((await signUp(email, PASSWORD, { ip: `10.40.0.${++ipCounter}` })).status).toBe(200);
  expect((await putName(req("/api/account/name", "PUT", { name }))).status).toBe(200);
  await db.update(users).set({ role }).where(eq(users.email, email)).run();
  const id = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())!.id;
  return { browser: snapshot(), id };
}

/** One answer of one exam part, scored (the demo answer through the real evaluators), with a recording on disk. */
async function seedAttempt(userId: string, part: ExamPartId, sessionId: string | null): Promise<string> {
  const view = (await demoPartView(part))!;
  const task = getAnySpeakingTask(PARTS[part])!;
  await repo.ensureTaskSnapshot(task);
  const attemptId = newId();
  const key = `audio/${attemptId}.webm`;
  await new LocalAudioStorage(dir).save(key, BYTES, "audio/webm");
  await repo.insertAttemptWithRecording({
    attemptId,
    userId,
    sessionId,
    task,
    previousAttemptId: null,
    retryFocus: null,
    recording: { storageProvider: "local", storageKey: key, mimeType: "audio/webm", sizeBytes: BYTES.length, durationMs: 60_000 },
  });
  const transcript = await repo.saveTranscript({ attemptId, provider: "mock", model: "m", text: view.transcript!.text, language: "en", latencyMs: 1, metrics: computeSpeechMetrics(view.transcript!.text, 60_000, 120) });
  await repo.saveEvaluationAndComplete(
    {
      attemptId,
      transcriptId: transcript.id,
      evaluatorVersion: view.evaluation!.meta.evaluatorVersion,
      rubricVersion: view.evaluation!.meta.rubricVersion,
      schemaVersion: view.evaluation!.meta.schemaVersion,
      promptHash: "h",
      provider: "mock",
      model: "m",
      overallLevel: "B2",
      result: view.evaluation!.result,
    },
    1,
  );
  return attemptId;
}

async function seedMock(userId: string): Promise<{ mockId: string; attempts: Record<ExamPartId, string> }> {
  const mockId = newId();
  await db.insert(practiceSessions).values({ id: mockId, userId, kind: "full_mock", status: "finished", finishedAt: new Date().toISOString() }).run();
  const attempts = {} as Record<ExamPartId, string>;
  for (const part of ["1.1", "1.2", "2", "3"] as const) attempts[part] = await seedAttempt(userId, part, mockId);
  return { mockId, attempts };
}

interface World {
  teacher: Browser;
  otherTeacher: Browser;
  alice: Browser;
  bob: Browser;
  stranger: Browser;
  anonymous: Browser;
  aliceId: string;
  classId: string;
  memberId: string;
  mockId: string;
  parts: Record<ExamPartId, string>;
  /** Alice's mock from before she shared, and a single Part 3 attempt after. */
  oldMockId: string;
  oldPart2: string;
  single3: string;
  examDate: string;
}

async function world(): Promise<World> {
  const teacher = await register("karimova@school.example", "Ms Karimova", "teacher");
  actAs(teacher.browser);
  const created = (await (await postClass(req("/api/teacher/classes", "POST", { name: "Group B" }), ctx({}))).json()) as { class: { id: string; joinCode: string } };
  const other = await register("other@school.example", "Mr Other", "teacher");
  const bob = await register("bob@example.com", "Bob Bobson");
  const stranger = await register("stranger@example.com", "Stranger Danger");
  jar.clear();
  const anonymous = snapshot();

  const alice = await register("alice@example.com", "Alice Example");
  const examDate = "2026-12-01";
  await db.update(users).set({ examDate, consentStatus: "granted", consentAt: new Date().toISOString(), consentTeacherSharing: true }).where(eq(users.id, alice.id)).run();
  const oldMock = await seedMock(alice.id);
  await sleep(4);
  actAs(alice.browser);
  expect((await postShare(req("/api/classes", "POST", { code: created.class.joinCode, shownName: "Ali" }), ctx({}))).status).toBe(201);
  await sleep(4);
  const memberId = (await db.select().from(classMembers).get())!.id;
  const mock = await seedMock(alice.id);
  const single3 = await seedAttempt(alice.id, "3", null);
  return {
    teacher: teacher.browser,
    otherTeacher: other.browser,
    alice: alice.browser,
    bob: bob.browser,
    stranger: stranger.browser,
    anonymous,
    aliceId: alice.id,
    classId: created.class.id,
    memberId,
    mockId: mock.mockId,
    parts: mock.attempts,
    oldMockId: oldMock.mockId,
    oldPart2: oldMock.attempts["2"],
    single3,
    examDate,
  };
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-teacher-v1-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  resetJoinLimiterForTesting();
  setTeacherLiveForTesting(true);
  jar.clear();
});
afterEach(() => {
  setTeacherLiveForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

function newEndpoints(w: World) {
  const c = { classId: w.classId };
  return [
    ["GET mock", () => getMock(req("/x"), ctx({ ...c, mockId: w.mockId }))],
    ["PUT mock rating", () => putMockRating(req("/x", "PUT", { agrees: false, level: "B2" }), ctx({ ...c, mockId: w.mockId }))],
    ["GET recording (mock Part 2)", () => getAudio(req("/x"), ctx({ ...c, attemptId: w.parts["2"] }))],
    ["GET recording (single Part 3)", () => getAudio(req("/x"), ctx({ ...c, attemptId: w.single3 }))],
    ["GET Part 3 attempt", () => getAttempt(req("/x"), ctx({ ...c, attemptId: w.single3 }))],
    ["PUT Part 3 rating", () => putRating(req("/x", "PUT", { agrees: true }), ctx({ ...c, attemptId: w.single3 }))],
  ] as const;
}

describe("every new route × caller", () => {
  it("only the class's teacher gets in; another teacher, a student, a stranger and an anonymous browser get 404", async () => {
    const w = await world();
    for (const [name, call] of newEndpoints(w)) {
      for (const [who, browser] of [["other teacher", w.otherTeacher], ["alice (the student)", w.alice], ["bob", w.bob], ["stranger", w.stranger], ["anonymous", w.anonymous]] as const) {
        actAs(browser);
        expect((await call()).status, `${name} as ${who}`).toBe(404);
      }
    }
    expect(await db.select().from(teacherMockRatings).all()).toHaveLength(0);
    expect(await db.select().from(teacherRatings).all()).toHaveLength(0);
    actAs(w.teacher);
    for (const [name, call] of newEndpoints(w)) expect((await call()).status, name).toBeLessThan(300);
  });

  it("the student's own recording route still refuses every other account, the teacher included", async () => {
    const w = await world();
    for (const browser of [w.teacher, w.otherTeacher, w.bob, w.stranger]) {
      actAs(browser);
      expect((await getMyAudio(req("/x"), ctx({ attemptId: w.parts["2"] }))).status).toBe(404);
    }
    actAs(w.alice);
    expect((await getMyAudio(req("/x"), ctx({ attemptId: w.parts["2"] }))).status).toBe(200);
  });

  it("the student-side routes: Not signed in is 401; another account's membership is 404; nothing happens to it", async () => {
    const w = await world();
    for (const call of [() => postUpgrade(req("/x", "POST"), ctx({ memberId: w.memberId })), () => postDecline(req("/x", "POST"), ctx({ memberId: w.memberId }))]) {
      actAs(w.anonymous);
      expect((await call()).status).toBe(401);
      for (const browser of [w.bob, w.stranger, w.teacher]) {
        actAs(browser);
        expect((await call()).status).toBe(404);
      }
      // Alice is on the current wording: there is nothing to upgrade or decline.
      actAs(w.alice);
      expect((await call()).status).toBe(404);
    }
    const member = (await db.select().from(classMembers).get())!;
    expect(member.allPartsFrom).toBeNull();
    expect(member.upgradeDeclinedAt).toBeNull();
  });

  it("writes from another site are refused (403)", async () => {
    const w = await world();
    actAs(w.teacher);
    const evil = req("/x", "PUT", { agrees: true }, { origin: "https://evil.example" });
    expect((await putMockRating(evil, ctx({ classId: w.classId, mockId: w.mockId }))).status).toBe(403);
  });

  it("while the release switch is off every new route is a 404 for everyone", async () => {
    const w = await world();
    setTeacherLiveForTesting(false);
    for (const browser of [w.teacher, w.alice]) {
      actAs(browser);
      for (const [name, call] of newEndpoints(w)) expect((await call()).status, name).toBe(404);
      expect((await postUpgrade(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
      expect((await postDecline(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
    }
  });
});

describe("what the teacher reads", () => {
  it("a mock: four parts with transcripts, sentences to improve, bands and an address to play each recording; no email, name or exam date", async () => {
    const w = await world();
    actAs(w.teacher);
    const raw = await text(await getMock(req("/x"), ctx({ classId: w.classId, mockId: w.mockId })));
    const { mock } = JSON.parse(raw) as {
      mock: { studentName: string; status: string; parts: { part: string; state: string; band: { band: number } | null; transcript: string; fixes: unknown; listen: { state: string; src: string } | null }[] };
    };
    expect(mock.studentName).toBe("Ali");
    expect(mock.status).toBe("finished");
    expect(mock.parts.map((p) => p.part)).toEqual(["1.1", "1.2", "2", "3"]);
    for (const part of mock.parts) {
      expect(part.state, part.part).toBe("scored");
      expect(part.band, part.part).not.toBeNull();
      expect(part.transcript.length, part.part).toBeGreaterThan(20);
      expect(part.fixes, part.part).not.toBeNull();
      expect(part.listen?.state, part.part).toBe("playable");
      expect(part.listen!.src).toBe(`/api/teacher/classes/${w.classId}/attempts/${w.parts[part.part as ExamPartId]}/audio`);
    }
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("Alice");
    expect(raw).not.toContain("Example");
    expect(raw).not.toContain(w.examDate);
    expect(raw).not.toContain("storage");
    expect(raw).not.toContain("/api/speaking/");

    // The mock from before Alice shared is the same 404 as a stranger's, and so is its recording.
    expect((await getMock(req("/x"), ctx({ classId: w.classId, mockId: w.oldMockId }))).status).toBe(404);
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.oldPart2 }))).status).toBe(404);
    // A wrong class id: 404 (the mock is not in that class).
    expect((await getMock(req("/x"), ctx({ classId: "other", mockId: w.mockId }))).status).toBe(404);
  });

  it("a Part 3 attempt page's data (every part is visible); Part 3 can be rated like the others", async () => {
    const w = await world();
    actAs(w.teacher);
    const raw = await text(await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.single3 })));
    const { attempt } = JSON.parse(raw) as { attempt: { part: string; result: { kind: string; scoring: { band: number } }; listen: { state: string }; mockId: string | null } };
    expect(attempt.part).toBe("3");
    expect(attempt.result.kind).toBe("multilevel_q8");
    expect(attempt.listen.state).toBe("playable");
    expect(attempt.mockId).toBeNull();
    expect(raw).not.toContain("@");
    expect(await (await putRating(req("/x", "PUT", { agrees: false, band: 5 }), ctx({ classId: w.classId, attemptId: w.single3 }))).json()).toEqual({ rating: { agrees: false, band: 5 } });
    expect((await putRating(req("/x", "PUT", { agrees: false, band: 9 }), ctx({ classId: w.classId, attemptId: w.single3 }))).status).toBe(400);
    // A part of a mock links back to its mock.
    const part2 = (await (await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).json()) as { attempt: { mockId: string } };
    expect(part2.attempt.mockId).toBe(w.mockId);
  });

  it("T3 and T4: the student's last mock, and mocks before single attempts", async () => {
    const w = await world();
    actAs(w.teacher);
    const overview = (await (await getClass(req("/x"), ctx({ classId: w.classId }))).json()) as { students: { lastMock: string; scopeNote: string | null }[] };
    expect(overview.students[0].lastMock).toMatch(/^(B1|B2|C1|Below B1|Not ready) · \d\d\.\d\d\.\d\d$/);
    expect(overview.students[0].scopeNote).toBeNull();
    const student = (await (await getStudent(req("/x"), ctx({ classId: w.classId, memberId: w.memberId }))).json()) as {
      student: { mockRows: { id: string; mock: { status: string } }[]; rows: { id: string }[]; latestMockId: string };
    };
    expect(student.student.mockRows.map((r) => r.id)).toEqual([w.mockId]);
    expect(student.student.latestMockId).toBe(w.mockId);
    // The four mock parts are inside the mock; only the single attempt is listed on its own.
    expect(student.student.rows.map((r) => r.id)).toEqual([w.single3]);
  });

  it("the whole mock's level: Agree, Choose level, Change; bad levels refused; never in the student's own mock data apart from 'Your teacher'", async () => {
    const w = await world();
    actAs(w.teacher);
    const at = ctx({ classId: w.classId, mockId: w.mockId });
    expect(await (await putMockRating(req("/x", "PUT", { agrees: true }), at)).json()).toEqual({ rating: { agrees: true } });
    const row = (await db.select().from(teacherMockRatings).get())!;
    expect(row.agrees).toBe(true);
    expect(row.appLevel).toMatch(/B1|B2|C1/);
    expect(await (await putMockRating(req("/x", "PUT", { agrees: false, level: "C1" }), at)).json()).toEqual({ rating: { agrees: false, level: "C1" } });
    expect(await db.select().from(teacherMockRatings).all()).toHaveLength(1); // one per mock and teacher
    for (const body of [{ agrees: false, level: "A1" }, { agrees: false }, { level: "B2" }, {}]) {
      expect((await putMockRating(req("/x", "PUT", body), at)).status, JSON.stringify(body)).toBe(400);
    }
    const reread = (await (await getMock(req("/x"), at)).json()) as { mock: { rating: unknown } };
    expect(reread.mock.rating).toEqual({ agrees: false, level: "C1" });

    // The student sees it as "Your teacher", next to CEFRO's level.
    actAs(w.alice);
    const result = (await (await getMockResult(req("/x"), ctx({ mockId: w.mockId }))).json()) as { result: { teacherLevel: string } };
    expect(result.result.teacherLevel).toBe("C1");
  });
});

describe("recordings", () => {
  it("play (with Range) for the teacher: never cached, inline, the stored bytes", async () => {
    const w = await world();
    actAs(w.teacher);
    const whole = await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("cache-control")).toBe("no-store");
    expect(whole.headers.get("content-disposition")).toBe("inline");
    expect(whole.headers.get("content-type")).toBe("audio/webm");
    expect(Buffer.from(await whole.arrayBuffer()).equals(BYTES)).toBe(true);
    const part = await getAudio(req("/x", "GET", undefined, { range: "bytes=0-3" }), ctx({ classId: w.classId, attemptId: w.parts["2"] }));
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("RIFF");
  });

  it("consent withdrawn: the teacher stops seeing and hearing at once", async () => {
    const w = await world();
    actAs(w.teacher);
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).status).toBe(200);
    await db.update(users).set({ consentTeacherSharing: false }).where(eq(users.id, w.aliceId)).run();
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).status).toBe(404);
    // The text pages follow the same switch the app already had (CONSENT_REQUIRED); the audio never needs it to be on.
  });

  it("audio deleted after 30 days: the page says so and nothing plays; the transcript stays", async () => {
    const w = await world();
    await db.update(recordings).set({ audioDeletedAt: new Date().toISOString() }).where(eq(recordings.attemptId, w.parts["2"])).run();
    actAs(w.teacher);
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).status).toBe(404);
    const { attempt } = (await (await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).json()) as { attempt: { listen: { state: string; src?: string }; transcript: string } };
    expect(attempt.listen.state).toBe("deleted");
    expect(attempt.listen.src).toBeUndefined();
    expect(attempt.transcript.length).toBeGreaterThan(0);
  });

  it("Leave: mock, attempts and recordings are a 404 at once; ratings leave an id-free pair (parts) or nothing (whole mock)", async () => {
    const w = await world();
    actAs(w.teacher);
    await putRating(req("/x", "PUT", { agrees: false, band: 4 }), ctx({ classId: w.classId, attemptId: w.single3 }));
    await putRating(req("/x", "PUT", { agrees: true }), ctx({ classId: w.classId, attemptId: w.parts["2"] }));
    await putMockRating(req("/x", "PUT", { agrees: false, level: "B2" }), ctx({ classId: w.classId, mockId: w.mockId }));
    expect(await db.select().from(teacherRatings).all()).toHaveLength(2);

    actAs(w.alice);
    expect((await postLeave(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(204);
    actAs(w.teacher);
    for (const [name, call] of newEndpoints(w)) expect((await call()).status, name).toBe(404);
    expect(await db.select().from(teacherRatings).all()).toHaveLength(0);
    expect(await db.select().from(teacherMockRatings).all()).toHaveLength(0);
    const pairs = await db.select().from(ratingPairs).all();
    expect(pairs.map((p) => p.part).sort()).toEqual(["2", "3"]);
    for (const pair of pairs) expect(Object.keys(pair).sort()).toEqual(["appBand", "evaluatorVersion", "month", "part", "rubricVersion", "teacherBand"]);
  });
});

describe("an old membership (first Share wording)", () => {
  async function makeLegacy(w: World) {
    await db.update(classMembers).set({ shareTextVersion: LEGACY_SHARE_TEXT_VERSION }).where(eq(classMembers.id, w.memberId)).run();
  }

  it("keeps Part 2 attempts only: no mocks, no other parts, no recordings, and a quiet note on T3", async () => {
    const w = await world();
    await makeLegacy(w);
    const part2 = await seedAttempt(w.aliceId, "2", null);
    actAs(w.teacher);
    expect((await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: part2 }))).status).toBe(200);
    const { attempt } = (await (await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: part2 }))).json()) as { attempt: { listen: unknown } };
    expect(attempt.listen).toBeNull(); // nothing to play, nothing to say: the audio was never shared under that wording
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: part2 }))).status).toBe(404);
    for (const [name, call] of newEndpoints(w)) expect((await call()).status, name).toBe(404);
    const overview = (await (await getClass(req("/x"), ctx({ classId: w.classId }))).json()) as { students: { scopeNote: string; attempts: number; lastMock: string }[] };
    expect(overview.students[0]).toMatchObject({ scopeNote: "Shares Part 2 only", attempts: 2, lastMock: "—" }); // the two Part 2 answers (one was played inside a mock: the mock itself is not shared)
  });

  it("Share recordings too: nothing changes until the tap; then new answers (not old ones) open up; asked once", async () => {
    const w = await world();
    await makeLegacy(w);
    actAs(w.alice);
    expect(((await (await (await import("../classes/route")).GET(req("/x"), ctx({}))).json()) as { classes: { needsUpgrade: boolean }[] }).classes[0].needsUpgrade).toBe(true);
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: w.parts["2"] }))).status).toBe(404); // alice is not a teacher

    expect((await postUpgrade(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(204);
    expect((await postUpgrade(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404); // asked once
    expect((await postDecline(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
    await sleep(4);
    const fresh = await seedAttempt(w.aliceId, "1.2", null);
    actAs(w.teacher);
    expect((await getAudio(req("/x"), ctx({ classId: w.classId, attemptId: fresh }))).status).toBe(200);
    // Everything made before the tap stays closed.
    expect((await getAttempt(req("/x"), ctx({ classId: w.classId, attemptId: w.single3 }))).status).toBe(404);
    expect((await getMock(req("/x"), ctx({ classId: w.classId, mockId: w.mockId }))).status).toBe(404);
  });

  it("Not now: nothing changes and the card is gone", async () => {
    const w = await world();
    await makeLegacy(w);
    actAs(w.alice);
    expect((await postDecline(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(204);
    expect((await postUpgrade(req("/x", "POST"), ctx({ memberId: w.memberId }))).status).toBe(404);
    const member = (await db.select().from(classMembers).get())!;
    expect(member.allPartsFrom).toBeNull();
    expect(member.upgradeDeclinedAt).not.toBeNull();
    actAs(w.teacher);
    for (const [name, call] of newEndpoints(w)) expect((await call()).status, name).toBe(404);
  });
});
