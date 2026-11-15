import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
/** Parts 1.1, 1.2 and 3 are not live on their own; the full mock opens only with all four (or the test switch). */
const live = vi.hoisted(() => ({ mock: true }));
vi.mock("@/config/features", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/config/features")>();
  return {
    ...original,
    PART_LIVE: { "1.1": false, "1.2": false, "2": true, "3": false },
    fullMockLive: () => live.mock,
  };
});
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 60_000 });

import { eq } from "drizzle-orm";
import { MOCK_EXPIRES_AFTER_MS } from "@/domain/speaking/full-mock";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { setConsentRequiredForTesting } from "@/server/consent/consent";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { practiceSessions, speakingAttempts, users } from "@/server/db/schema";
import { createPracticeSession } from "@/server/sessions/session-service";
import { findInProgressMock, mockTasksForPart, planMockTasks, startOrResumeMock } from "@/server/sessions/mock-service";
import { parsePart11SetId } from "@/content/speaking/part1/part1-1-sets";
import { seededRandom } from "@/domain/speaking/weighted-pick";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { PASSWORD, signUp } from "../../../test/auth-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { jar } from "../../../test/next-headers-mock";
import FullMockPage from "../practice/mock/page";
import MockFinishedPage from "../practice/mock/[sessionId]/page";
import PracticePage from "../practice/page";
import { POST as postMock } from "./mock-exams/route";
import { GET as getMock } from "./mock-exams/[mockId]/route";
import { POST as postFinish } from "./mock-exams/[mockId]/finish/route";
import { GET as getAttempt } from "./speaking/attempts/[attemptId]/route";
import { POST as postAttempt } from "./speaking/attempts/route";

/*
 * The full mock exam through the real route handlers and pages (mock providers only, no model call): the session's life
 * (start, resume, the four parts in any order, finish, the 24-hour rule), the consent lock, and cross-user access.
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
  expect((await signUp(`${name}@example.com`, PASSWORD, { ip: `10.8.0.${++ip}` })).status).toBe(200);
  browsers[name] = new Map(jar);
}
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const json = async (response: Response) => (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const drain = async () => {
  while (afterTasks.length) await afterTasks.shift()!();
};
const req = (init?: RequestInit) => new Request("http://localhost/x", init);

const startMock = async () => json(await postMock(req({ method: "POST" })));
const readMock = async (id: string) => getMock(req(), ctx({ mockId: id }));
const finish = async (id: string) => postFinish(req({ method: "POST" }), ctx({ mockId: id }));

async function upload(part: Part, sessionId: string | null, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASKS[part]);
  form.set("durationMs", "110000");
  if (part === "3") form.set("chosenPoints", JSON.stringify(["F1", "F2", "A1", "A2"]));
  if (part === "1.1" || part === "1.2") form.set("questionOffsetsMs", JSON.stringify([0, 30000, 60000]));
  if (sessionId) form.set("sessionId", sessionId);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  await drain();
  return { response, body: await json(response) };
}
const attemptRows = async () => db.select().from(speakingAttempts).all();
const userId = async (name: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, `${name}@example.com`)).get())!.id;
const sessionRow = async (id: string) => (await db.select().from(practiceSessions).where(eq(practiceSessions.id, id)).get())!;
const backdate = (id: string, hours: number) =>
  db.update(practiceSessions).set({ createdAt: new Date(Date.now() - hours * 3_600_000).toISOString() }).where(eq(practiceSessions.id, id)).run();

beforeEach(async () => {
  live.mock = true;
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-mockapi-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  afterTasks.length = 0;
  await register("alice");
  await register("bob");
  browsers.anonymous = new Map();
});
afterEach(() => {
  setConsentRequiredForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("starting a mock", () => {
  it("creates one full_mock session, in progress, owned by the caller, with no part done", async () => {
    as(browsers.alice);
    const response = await postMock(req({ method: "POST" }));
    expect(response.status).toBe(201);
    const { mock, resumed } = await json(response);
    expect(resumed).toBe(false);
    expect(mock).toMatchObject({ status: "in_progress", finishedAt: null, nextPart: "1.1" });
    expect(mock.parts.map((p: { part: string; attemptId: string | null }) => [p.part, p.attemptId])).toEqual([["1.1", null], ["1.2", null], ["2", null], ["3", null]]);
    expect(await sessionRow(mock.id)).toMatchObject({ kind: "full_mock", status: "in_progress", finishedAt: null, userId: await userId("alice") });
  });

  it("returns the mock already in progress instead of a second one (two tabs, a double tap)", async () => {
    as(browsers.alice);
    const first = await startMock();
    const response = await postMock(req({ method: "POST" }));
    expect(response.status).toBe(200);
    const second = await json(response);
    expect(second.resumed).toBe(true);
    expect(second.mock.id).toBe(first.mock.id);
    expect(await db.select().from(practiceSessions).where(eq(practiceSessions.kind, "full_mock")).all()).toHaveLength(1);
    as(browsers.bob);
    expect((await startMock()).mock.id).not.toBe(first.mock.id);
  });

  it("is a 404 until all four parts are live: nothing is created", async () => {
    live.mock = false;
    as(browsers.alice);
    expect((await postMock(req({ method: "POST" }))).status).toBe(404);
    expect(await db.select().from(practiceSessions).all()).toHaveLength(0);
  });

  it("does not touch single-task sessions: they keep a null status and finished_at", async () => {
    const id = await createPracticeSession(await userId("alice"));
    expect(await sessionRow(id)).toMatchObject({ kind: "single_task", status: null, finishedAt: null });
  });
});

describe("the four parts", () => {
  it("accepts each part into the mock in any order, scores each one, and finishes only when all four are in", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    // Parts 1.1, 1.2 and 3 are not live on their own: inside the mock they are accepted. Part 1.2 arrives first (Part 1.1's upload was slow).
    const order: Part[] = ["1.2", "1.1", "2", "3"];
    const ids: Record<string, string> = {};
    for (const [i, part] of order.entries()) {
      expect((await finish(mock.id)).status, `before ${part}`).toBe(409);
      const { response, body } = await upload(part, mock.id);
      expect(response.status, part).toBe(201);
      ids[part] = body.attempt.id;
      const state = (await json(await readMock(mock.id))).mock;
      expect(state.parts.filter((p: { attemptId: string | null }) => p.attemptId)).toHaveLength(i + 1);
    }
    expect((await json(await finish(mock.id))).error?.code).toBeUndefined();
    const done = (await json(await readMock(mock.id))).mock;
    expect(done).toMatchObject({ status: "finished", nextPart: null });
    expect(done.finishedAt).toEqual(expect.any(String));
    expect(done.parts.map((p: { part: string; attemptId: string }) => [p.part, p.attemptId])).toEqual([["1.1", ids["1.1"]], ["1.2", ids["1.2"]], ["2", ids["2"]], ["3", ids["3"]]]);
    for (const part of order) {
      const view = await json(await getAttempt(req(), ctx({ attemptId: ids[part] })));
      expect(view.attempt, part).toMatchObject({ status: "completed", taskId: TASKS[part] });
    }
    // Every attempt belongs to the mock's session, and a finished mock takes nothing more.
    expect((await attemptRows()).map((a) => a.sessionId)).toEqual(Array(4).fill(mock.id));
    const late = await upload("2", mock.id);
    expect(late.response.status).toBe(409);
    expect(late.body.error.code).toBe("mock_not_in_progress");
    // Finishing twice is harmless.
    expect((await finish(mock.id)).status).toBe(200);
  });

  it("takes each part once; a resend of the same recording returns the same attempt", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    const key = "33333333-3333-4333-8333-333333333333";
    const first = await upload("1.1", mock.id, { clientAttemptId: key });
    const again = await upload("1.1", mock.id, { clientAttemptId: key });
    expect(again.response.status).toBe(201);
    expect(again.body.attempt.id).toBe(first.body.attempt.id);
    const second = await upload("1.1", mock.id, { clientAttemptId: "44444444-4444-4444-8444-444444444444" });
    expect(second.response.status).toBe(409);
    expect(second.body.error.code).toBe("mock_part_done");
    expect(await attemptRows()).toHaveLength(1);
  });

  it("a part outside the mock is still refused while its own part is not live: nothing stored", async () => {
    as(browsers.alice);
    const { response, body } = await upload("1.1", null);
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("task_not_found");
    expect(await attemptRows()).toHaveLength(0);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it("is refused when the mock is switched off again (all four parts no longer live): its parts are 404 too", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    live.mock = false;
    expect((await upload("1.1", mock.id)).response.status).toBe(404);
    expect(await attemptRows()).toHaveLength(0);
  });
});

describe("resume", () => {
  it("after a break the finished parts are saved, the page continues with the rest, and Practice and the page agree", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    expect((await upload("1.1", mock.id)).response.status).toBe(201);
    expect((await upload("1.2", mock.id)).response.status).toBe(201);

    // The tab was closed. A fresh visit: Start returns the same mock, with the two saved parts.
    const resumed = await startMock();
    expect(resumed).toMatchObject({ resumed: true, mock: { id: mock.id, nextPart: "2" } });
    expect((await findInProgressMock(await userId("alice")))?.parts.filter((p) => p.attemptId).map((p) => p.part)).toEqual(["1.1", "1.2"]);

    const page = (await FullMockPage({ searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{ children: React.ReactElement<{ finished: string[]; plans: { part: string }[]; mock: boolean }> }>;
    expect(page.props.children.props.finished).toEqual(["1.1", "1.2"]);
    expect(page.props.children.props.plans.map((p) => p.part)).toEqual(["2", "3"]);
    expect(page.props.children.props.mock).toBe(false);

    const practice = (await PracticePage({ searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{ children: React.ReactElement<{ mockCard: React.ReactElement<{ state: { kind: string; done: string[] } }> }> }>;
    expect(practice.props.children.props.mockCard.props.state).toMatchObject({ kind: "continue", done: ["1.1", "1.2"] });
  });

  it("a new mock does not repeat tasks the student just did", async () => {
    const alice = await userId("alice");
    as(browsers.alice);
    const { mock } = await startMock();
    for (const part of ["1.1", "1.2", "2", "3"] as const) await upload(part, mock.id);
    await finish(mock.id);
    const plan = await planMockTasks(alice);
    for (const part of ["1.2", "2", "3"] as const) {
      const options = mockTasksForPart(part);
      if (options.length > 1) expect(plan[part], part).not.toBe(TASKS[part]);
      expect(options.map((o) => o.id)).toContain(plan[part]);
    }
    // Part 1.1 is the question bank: a fresh weighted set of three questions (content/speaking/part1/part1-1-sets.ts).
    expect(parsePart11SetId(plan["1.1"]!)).not.toBeNull();
  });

  it("Part 1.1: a new mock leaves out the questions of the student's last set", async () => {
    const alice = await userId("alice");
    as(browsers.alice);
    const { mock } = await startMock();
    const first = (await planMockTasks(alice, ["1.1"], seededRandom(5)))["1.1"]!;
    expect((await upload("1.1", mock.id, { taskId: first })).response.status).toBe(201);
    for (const seed of [1, 2, 3, 4, 6, 7]) {
      const next = (await planMockTasks(alice, ["1.1"], seededRandom(seed)))["1.1"]!;
      for (const n of parsePart11SetId(next)!) expect(parsePart11SetId(first)).not.toContain(n);
    }
  });
});

describe("the 24-hour rule", () => {
  it("closes a mock after 24 hours as not_finished; its finished parts keep their results, and nothing more joins", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    const first = await upload("1.1", mock.id);
    expect(first.response.status).toBe(201);
    await backdate(mock.id, 25);

    const read = (await json(await readMock(mock.id))).mock;
    expect(read).toMatchObject({ status: "not_finished", nextPart: null, finishedAt: null });
    expect((await sessionRow(mock.id)).status).toBe("not_finished");
    expect(read.parts[0].attemptId).toBe(first.body.attempt.id);
    const kept = await json(await getAttempt(req(), ctx({ attemptId: first.body.attempt.id })));
    expect(kept.attempt.status).toBe("completed");

    const late = await upload("1.2", mock.id);
    expect(late.response.status).toBe(409);
    expect(late.body.error.code).toBe("mock_not_in_progress");
    expect((await json(await finish(mock.id))).error.code).toBe("mock_not_in_progress");
    expect(await attemptRows()).toHaveLength(1);
  });

  it("refuses an upload that arrives after the 24 hours even before anything read the mock, and then starts a fresh mock", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    await backdate(mock.id, 25);
    const late = await upload("1.1", mock.id);
    expect(late.response.status).toBe(409);
    expect(late.body.error.code).toBe("mock_expired");
    expect((await sessionRow(mock.id)).status).toBe("not_finished");
    const fresh = await startMock();
    expect(fresh.resumed).toBe(false);
    expect(fresh.mock.id).not.toBe(mock.id);
  });

  it("a mock 23 hours old is still in progress", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    await backdate(mock.id, 23);
    expect((await json(await readMock(mock.id))).mock.status).toBe("in_progress");
    expect(MOCK_EXPIRES_AFTER_MS).toBe(24 * 3_600_000);
  });

  it("the service takes its clock as an argument, so no real waiting is needed", async () => {
    const alice = await userId("alice");
    const { mock } = await startOrResumeMock(alice, Date.now());
    expect((await findInProgressMock(alice, Date.now() + MOCK_EXPIRES_AFTER_MS - 1000))?.id).toBe(mock.id);
    expect(await findInProgressMock(alice, Date.now() + MOCK_EXPIRES_AFTER_MS + 1000)).toBeNull();
  });
});

describe("pilot consent: the lock is exactly the recording lock (CONSENT_REQUIRED)", () => {
  const setConsent = (email: string, status: "granted" | "withdrawn" | null) =>
    db.update(users).set({ consentStatus: status, consentAt: new Date().toISOString() }).where(eq(users.email, email)).run();

  it("guests and accounts without consent cannot start a mock: 403 consent_required, nothing created", async () => {
    setConsentRequiredForTesting(true);
    for (const [who, browser] of [["a guest", browsers.anonymous], ["an account without consent", browsers.alice]] as const) {
      as(browser);
      const response = await postMock(req({ method: "POST" }));
      expect(response.status, who).toBe(403);
      expect((await json(response)).error.code).toBe("consent_required");
    }
    await setConsent("bob@example.com", "withdrawn");
    as(browsers.bob);
    expect((await postMock(req({ method: "POST" }))).status).toBe(403);
    expect(await db.select().from(practiceSessions).where(eq(practiceSessions.kind, "full_mock")).all()).toHaveLength(0);
  });

  it("a granted account starts and records; if consent is withdrawn mid-mock, the next part is refused before anything is stored", async () => {
    await setConsent("alice@example.com", "granted");
    setConsentRequiredForTesting(true);
    as(browsers.alice);
    const { mock } = await startMock();
    expect((await upload("1.1", mock.id)).response.status).toBe(201);
    await setConsent("alice@example.com", "withdrawn");
    const refused = await upload("1.2", mock.id);
    expect(refused.response.status).toBe(403);
    expect(refused.body.error.code).toBe("consent_required");
    expect(await attemptRows()).toHaveLength(1);
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it("the real page asks the server: a guest gets the lock, a consenting account does not", async () => {
    await setConsent("alice@example.com", "granted");
    setConsentRequiredForTesting(true);
    const lockOf = async () => ((await FullMockPage({ searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{ children: React.ReactElement<{ lock: string | null }> }>).props.children.props.lock;
    as(browsers.anonymous);
    expect(await lockOf()).toBe("guest");
    as(browsers.alice);
    expect(await lockOf()).toBeNull();
    live.mock = false;
    await expect(lockOf()).rejects.toThrow();
  });
});

describe("cross-user access", () => {
  it("only the owner can read, finish, upload into or open the finished page of a mock; everyone else sees a 404", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    const mine = await upload("1.1", mock.id);
    expect(mine.response.status).toBe(201);

    for (const [who, browser] of [["bob", browsers.bob], ["a guest", browsers.anonymous]] as const) {
      as(browser);
      const read = await readMock(mock.id);
      expect(read.status, who).toBe(404);
      expect((await json(read)).error.code).toBe("mock_not_found");
      expect((await finish(mock.id)).status, who).toBe(404);
      await expect(MockFinishedPage({ params: Promise.resolve({ sessionId: mock.id }), searchParams: Promise.resolve({}) } as never)).rejects.toThrow();
      // Borrowing the mock's id in an upload does not put the recording into it: Part 1.1 is not live for them, so it is refused...
      const borrowed = await upload("1.1", mock.id);
      expect(borrowed.response.status, who).toBe(404);
      // ... and a part that is live is stored under THEIR OWN new session, never alice's.
      const own = await upload("2", mock.id);
      expect(own.response.status, who).toBe(201);
    }
    const rows = await attemptRows();
    expect(rows.filter((r) => r.sessionId === mock.id)).toHaveLength(1);
    as(browsers.alice);
    expect((await json(await readMock(mock.id))).mock.parts.filter((p: { attemptId: string | null }) => p.attemptId)).toHaveLength(1);
  });

  it("someone else's attempt never becomes a part of your mock, and a single-task session id is not a mock", async () => {
    as(browsers.alice);
    const single = await createPracticeSession(await userId("alice"));
    expect((await readMock(single)).status).toBe(404);
    expect((await finish(single)).status).toBe(404);
    expect((await readMock("not-a-uuid")).status).toBe(404);
    expect((await readMock("11111111-1111-4111-8111-111111111111")).status).toBe(404);
  });

  it("the mock result page opens for its owner with a row linking to each part's own result", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    const ids: string[] = [];
    for (const part of ["1.1", "1.2", "2", "3"] as const) ids.push((await upload(part, mock.id)).body.attempt.id);
    await finish(mock.id);
    const page = (await MockFinishedPage({ params: Promise.resolve({ sessionId: mock.id }), searchParams: Promise.resolve({}) } as never)) as React.ReactElement<{
      children: React.ReactElement<{ initial: { status: string; parts: { part: string; detailHref: string | null }[] } }>;
    }>;
    const { initial } = page.props.children.props;
    expect(initial.status).toBe("finished");
    expect(initial.parts.map((p) => [p.part, p.detailHref])).toEqual(["1.1", "1.2", "2", "3"].map((part, i) => [part, `/result/${ids[i]}`]));
  });

  it("a mock in progress sends the result page back to the runner", async () => {
    as(browsers.alice);
    const { mock } = await startMock();
    await expect(MockFinishedPage({ params: Promise.resolve({ sessionId: mock.id }), searchParams: Promise.resolve({}) } as never)).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

describe("the Practice card", () => {
  const stateOf = async (query: Record<string, string> = {}) =>
    ((await PracticePage({ searchParams: Promise.resolve(query) } as never)) as React.ReactElement<{ children: React.ReactElement<{ mockCard: React.ReactElement<{ state: { kind: string; href?: string; soon?: boolean } }> }> }>).props.children.props.mockCard.props.state;

  it("is Start when all four parts are live, Coming soon (no button) when not, and the demo in mock mode either way", async () => {
    as(browsers.alice);
    expect(await stateOf()).toEqual({ kind: "start", href: "/practice/mock" });
    live.mock = false;
    expect(await stateOf()).toEqual({ kind: "soon" });
    expect(await stateOf({ mock: "1" })).toEqual({ kind: "demo", href: "/practice/mock?mock=1", soon: true });
    live.mock = true;
    expect(await stateOf({ mock: "1" })).toEqual({ kind: "demo", href: "/practice/mock?mock=1", soon: false });
  });
});
