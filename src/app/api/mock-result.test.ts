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
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 60_000 });

import { eq } from "drizzle-orm";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classes, practiceSessions, speakingAttempts, teacherRatings, users } from "@/server/db/schema";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { createPracticeSession } from "@/server/sessions/session-service";
import { listMockHistory } from "@/server/sessions/mock-history";
import { startOrResumeMock } from "@/server/sessions/mock-service";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { buildHistoryView } from "@/features/history/view-model";
import type { MockResultSource } from "@/features/mock-result/part-source";
import { buildMockResultView } from "@/features/mock-result/view-model";
import { PASSWORD, signUp } from "../../../test/auth-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { jar } from "../../../test/next-headers-mock";
import MockResultPage from "../practice/mock/[sessionId]/page";
import { GET as getResult } from "./mock-exams/[mockId]/result/route";
import { POST as postFinish } from "./mock-exams/[mockId]/finish/route";
import { POST as postAttempt } from "./speaking/attempts/route";

/*
 * The mock result route and page through the real handlers (mock providers only, no model call): the four parts as the
 * result page reads them, the 24-hour rule, the teacher's level when one exists, and that no one but the owner can read a mock.
 */
const TASKS = {
  "1.1": "a2-part1-1-daily-life",
  "1.2": "b1-part1-2-shopping",
  "2": "b2-part2-advice-from-someone",
  "3": "c1-part3-cars-in-city-centres",
} as const;
type Part = keyof typeof TASKS;

let db: Db;
let dir: string;
let ip = 0;
type Browser = Map<string, string>;
const browsers: Record<string, Browser> = {};
const as = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
async function register(name: string) {
  jar.clear();
  expect((await signUp(`${name}@example.com`, PASSWORD, { ip: `10.9.0.${++ip}` })).status).toBe(200);
  browsers[name] = new Map(jar);
}
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const json = async (response: Response) => (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const drain = async () => {
  while (afterTasks.length) await afterTasks.shift()!();
};
const userId = async (name: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, `${name}@example.com`)).get())!.id;
const readResult = async (id: string) => getResult(new Request("http://localhost/x"), ctx({ mockId: id }));
const resultOf = async (id: string) => (await json(await readResult(id))).result as MockResultSource;

async function upload(part: Part, sessionId: string, options: { scored?: boolean } = {}) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASKS[part]);
  form.set("durationMs", "110000");
  if (part === "3") form.set("chosenPoints", JSON.stringify(["F1", "F2", "A1", "A2"]));
  if (part === "1.1" || part === "1.2") form.set("questionOffsetsMs", JSON.stringify([0, 30000, 60000]));
  form.set("sessionId", sessionId);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  expect(response.status, part).toBe(201);
  if (options.scored !== false) await drain();
  return (await json(response)).attempt.id as string;
}

/** A finished mock of `name` with all four parts scored by the mock evaluator. */
async function finishedMock(name: string) {
  as(browsers[name]);
  const { mock } = await startOrResumeMock(await userId(name));
  const ids: Record<string, string> = {};
  for (const part of ["1.1", "1.2", "2", "3"] as const) ids[part] = await upload(part, mock.id);
  expect((await postFinish(new Request("http://localhost/x", { method: "POST" }), ctx({ mockId: mock.id }))).status).toBe(200);
  return { id: mock.id, ids };
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-mockresult-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  afterTasks.length = 0;
  await register("alice");
  await register("bob");
  browsers.anonymous = new Map();
});
afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the mock result route", () => {
  it("gives the owner the four parts as their own result pages read them, with an estimate and the biggest fix", async () => {
    const { id, ids } = await finishedMock("alice");
    const result = await resultOf(id);
    expect(result).toMatchObject({ id, status: "finished" });
    expect(result.parts.map((p) => [p.part, p.state, p.attemptId, p.detailHref])).toEqual(
      (["1.1", "1.2", "2", "3"] as const).map((part) => [part, "scored", ids[part], `/result/${ids[part]}`]),
    );
    for (const p of result.parts) expect(p.band, p.part).toMatchObject({ band: expect.any(Number), label: expect.any(String) });
    const view = buildMockResultView(result);
    expect(view.headline.kind).toBe("level");
    expect(view.line).toBe("Speaking only. An estimate from this mock, not an official UZBMB score.");
    expect(view.scoring).toBe(false);
    expect(view.fix?.retryHref).toMatch(/^\/(practice\/speaking|practice\/part3)\//);
    expect(view.fix?.retryHref).toContain("retry=");
    expect(view.levels.map((l) => l.name)).toEqual(["CEFRO"]); // no teacher has rated: nothing about a teacher
    // Never a score, Passed / Failed or "certificate level" anywhere in what the route sends.
    expect(JSON.stringify(result)).not.toMatch(/passed|failed|certificate|\/\s?75|\/\s?120/i);
  });

  it("a part still being scored is 'scoring' and there is no estimate yet, never a guess", async () => {
    as(browsers.alice);
    const { mock } = await startOrResumeMock(await userId("alice"));
    await upload("1.1", mock.id);
    await upload("1.2", mock.id);
    await upload("2", mock.id, { scored: false });
    await upload("3", mock.id, { scored: false });
    const result = await resultOf(mock.id);
    expect(result.parts.map((p) => p.state)).toEqual(["scored", "scored", "scoring", "scoring"]);
    const view = buildMockResultView(result);
    expect(view.headline).toMatchObject({ kind: "not_ready", title: "Estimate not ready yet" });
    expect(view.levels).toEqual([{ name: "CEFRO", value: null }]);
    expect(view.rows.map((r) => r.status)).toEqual([null, null, "Scoring Part 2…", "Scoring Part 3…"]);
    expect(view.fix).toBeNull();
    // The rows fill in when ready.
    await drain();
    const later = buildMockResultView(await resultOf(mock.id));
    expect(later.headline.kind).toBe("level");
    expect(later.rows.every((r) => r.state === "scored")).toBe(true);
  });

  it("a mock closed after 24 hours is 'not_finished', keeps the parts it has, and says Part 3 was not done", async () => {
    as(browsers.alice);
    const { mock } = await startOrResumeMock(await userId("alice"));
    const part11 = await upload("1.1", mock.id);
    await upload("2", mock.id);
    await db.update(practiceSessions).set({ createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }).where(eq(practiceSessions.id, mock.id)).run();
    const result = await resultOf(mock.id);
    expect(result.status).toBe("not_finished");
    expect(result.parts.map((p) => p.state)).toEqual(["scored", "not_done", "scored", "not_done"]);
    expect(result.parts[0].detailHref).toBe(`/result/${part11}`);
    const view = buildMockResultView(result);
    expect(view.notFinishedNote).toMatch(/^Not finished/);
    expect(view.headline).toMatchObject({ kind: "not_ready", reason: "Part 1.2 was not done · Part 3 was not done." });
    expect(view.rows.map((r) => r.status)).toEqual([null, "Not done", null, "Not done"]);
  });

  it("when scoring cannot run, the part says 'AI score not ready yet' and the estimate waits", async () => {
    const { id, ids } = await finishedMock("alice");
    await db.update(speakingAttempts).set({ status: "failed", failureStage: "evaluation", failureCode: "evaluation_failed" }).where(eq(speakingAttempts.id, ids["3"])).run();
    const view = buildMockResultView(await resultOf(id));
    expect(view.rows[3]).toMatchObject({ state: "not_scored", status: "AI score not ready yet" });
    expect(view.headline).toMatchObject({ kind: "not_ready", reason: "Part 3 has no AI score yet." });
    expect(view.fix).not.toBeNull(); // nothing is still scoring: the other parts' fix shows
  });

  it("shows the teacher's level beside ours only once a teacher has rated, per part and for the mock", async () => {
    const { id, ids } = await finishedMock("alice");
    const before = buildMockResultView(await resultOf(id));
    expect(before.rows.map((r) => r.teacherLevel)).toEqual([null, null, null, null]);
    expect(before.levels).toHaveLength(1);

    const teacherId = await userId("bob"); // any account can be a teacher row for this test
    await db.insert(classes).values({ id: "class-1", teacherUserId: teacherId, name: "G", joinCode: "ABCDEF", createdAt: new Date().toISOString() }).run();
    const rate = (attemptId: string, band: number, agrees = false) =>
      db
        .insert(teacherRatings)
        .values({
          id: `r-${attemptId}`,
          attemptId,
          teacherUserId: teacherId,
          classId: "class-1",
          agrees,
          teacherBand: agrees ? null : band,
          appBand: band,
          evaluatorVersion: "v",
          rubricVersion: "v",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
    // Only Part 2 rated: shown on its row, but no teacher level for the mock (the rule needs 1.2, 2 and 3).
    await rate(ids["2"], 4);
    const partial = buildMockResultView(await resultOf(id));
    expect(partial.rows[2].teacherLevel).toBe("B2");
    expect(partial.levels.map((l) => l.name)).toEqual(["CEFRO"]);
    // 1.2 and 3 rated too: "Your teacher" appears next to "CEFRO", never instead of it.
    await rate(ids["1.2"], 3);
    await rate(ids["3"], 4);
    const full = buildMockResultView(await resultOf(id));
    expect(full.levels.map((l) => l.name)).toEqual(["CEFRO", "Your teacher"]);
    expect(full.levels[1].value).toBe("B2");
    expect(full.rows.map((r) => r.teacherLevel)).toEqual([null, "B1", "B2", "B2"]);
  });

  it("only the owner can read a mock: another account, an anonymous browser, a single-task session and bad ids are all the same 404", async () => {
    const { id } = await finishedMock("alice");
    for (const who of ["bob", "anonymous"]) {
      as(browsers[who]);
      const response = await readResult(id);
      expect(response.status, who).toBe(404);
      expect((await json(response)).error.code, who).toBe("mock_not_found");
    }
    as(browsers.alice);
    const single = await createPracticeSession(await userId("alice"));
    expect((await readResult(single)).status).toBe(404);
    expect((await readResult("not-a-uuid")).status).toBe(404);
    expect((await readResult("11111111-1111-4111-8111-111111111111")).status).toBe(404);
    // The owner still can, and the answer for a stranger never mentions the owner's data.
    expect((await readResult(id)).status).toBe(200);
    as(browsers.bob);
    expect(JSON.stringify(await json(await readResult(id)))).not.toMatch(/attemptId|detailHref|band/);
  });

  it("a teacher rating of someone else's attempt never reaches your mock", async () => {
    const alice = await finishedMock("alice");
    const bob = await finishedMock("bob");
    const teacherId = await userId("alice");
    await db.insert(classes).values({ id: "class-2", teacherUserId: teacherId, name: "G", joinCode: "ZXCVBN", createdAt: new Date().toISOString() }).run();
    await db
      .insert(teacherRatings)
      .values({ id: "r1", attemptId: bob.ids["2"], teacherUserId: teacherId, classId: "class-2", agrees: true, teacherBand: null, appBand: 3, evaluatorVersion: "v", rubricVersion: "v", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .run();
    as(browsers.alice);
    expect(buildMockResultView(await resultOf(alice.id)).rows.map((r) => r.teacherLevel)).toEqual([null, null, null, null]);
    as(browsers.bob);
    expect(buildMockResultView(await resultOf(bob.id)).rows[2].teacherLevel).toBe("B2");
  });
});

describe("the mock result page", () => {
  type Props = { props: { children: { props: { initial: MockResultSource; demo?: boolean; practiceHref: string } } } };
  const open = async (sessionId: string, query: Record<string, string> = {}) =>
    ((await MockResultPage({ params: Promise.resolve({ sessionId }), searchParams: Promise.resolve(query) } as never)) as unknown as Props).props.children.props;

  it("opens for its owner, and for no one else (404)", async () => {
    const { id } = await finishedMock("alice");
    as(browsers.alice);
    const props = await open(id);
    expect(props.initial.parts).toHaveLength(4);
    expect(props.practiceHref).toBe("/practice");
    for (const who of ["bob", "anonymous"]) {
      as(browsers[who]);
      await expect(open(id), who).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    }
  });

  it("a mock in progress goes back to the runner", async () => {
    as(browsers.alice);
    const { mock } = await startOrResumeMock(await userId("alice"));
    await expect(open(mock.id)).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("?mock=1 opens only the demo mock, with no account and no database", async () => {
    setDbForTesting(undefined);
    as(browsers.anonymous);
    const props = await open("demo-mock", { mock: "1" });
    expect(props.demo).toBe(true);
    expect(props.initial.parts.map((p) => p.state)).toEqual(["scored", "scored", "scored", "scored"]);
    await expect(open("someone-elses", { mock: "1" })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    // Without mock=1 the demo id is just a malformed id.
    setDbForTesting(db);
    await expect(open("demo-mock")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});

describe("History for mocks", () => {
  it("lists each mock once under All, only your own, and its parts under the part filters", async () => {
    const alice = await finishedMock("alice");
    await finishedMock("bob");
    as(browsers.alice);
    const aliceId = await userId("alice");
    const attempts = await listAttemptHistory(aliceId);
    const mocks = await listMockHistory(aliceId);
    expect(mocks.map((m) => m.id)).toEqual([alice.id]);
    expect(attempts.every((a) => a.sessionId === alice.id)).toBe(true);

    const all = buildHistoryView(attempts, { filter: "all", show: 20 }, mocks);
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0]).toMatchObject({ href: `/practice/mock/${alice.id}`, mock: { status: "finished" } });
    expect(all.rows[0].title).toMatch(/^Mock exam · (B1|B2|C1|Below B1) · \d\d\.\d\d\.\d\d$/);
    expect(all.filters.map((f) => f.label)).toEqual(["All", "Mock exams", "Part 1.1", "Part 1.2", "Part 2", "Part 3"]);
    const part2 = buildHistoryView(attempts, { filter: "2", show: 20 }, mocks);
    expect(part2.rows.map((r) => [r.href, r.partLabel])).toEqual([[`/result/${alice.ids["2"]}`, "Part 2 · Mock exam"]]);
    expect(buildHistoryView(attempts, { filter: "mocks", show: 20 }, mocks).rows).toHaveLength(1);

    // Bob's mock is not in Alice's History, and a mock left open for 24 hours reads as not finished.
    await db.update(practiceSessions).set({ status: "in_progress", createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString() }).where(eq(practiceSessions.id, alice.id)).run();
    const expired = await listMockHistory(aliceId);
    expect(expired).toMatchObject([{ id: alice.id, status: "not_finished" }]);
    const row = buildHistoryView(attempts, { filter: "all", show: 20 }, expired).rows[0];
    expect(row.title).toMatch(/^Mock exam · Not finished · /);
    expect(row.mock?.caption).toBe("Finished: Part 1.1, Part 1.2, Part 2, Part 3 · At home");
  });
});
