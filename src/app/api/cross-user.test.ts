import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
  connection: async () => undefined, // pages call it to opt out of prerendering; there is no request scope in tests
}));

import { eq } from "drizzle-orm";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts } from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { PASSWORD, authRequest, signOut, signUp } from "../../../test/auth-helpers";
import { TASK_ID } from "../../../test/db-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { jar } from "../../../test/next-headers-mock";
import { POST as postAnalytics } from "./analytics/events/route";
import { GET as getAudio } from "./speaking/attempts/[attemptId]/audio/route";
import { GET as getAttempt } from "./speaking/attempts/[attemptId]/route";
import { POST as postProcess } from "./speaking/attempts/[attemptId]/process/route";
import { POST as postAttempt } from "./speaking/attempts/route";
import { GET as getTaskAttempts } from "./speaking/tasks/[taskId]/attempts/route";
import { POST as postSession } from "./sessions/route";
import { GET as getMe } from "./account/me/route";
import HistoryPage from "../history/page";
import { PUT as putExamDate } from "./account/exam-date/route";
import { users } from "@/server/db/schema";
import { todayIn, addDays } from "@/domain/exam-date";
import type { HistoryView } from "@/features/history/view-model";

/** The History page as this actor's browser gets it: the view it renders (the shell around it is not needed). */
async function historyFor(actor: Actor, query: Record<string, string> = {}): Promise<HistoryView> {
  actAs(actor);
  const page = (await HistoryPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never)) as React.ReactElement<{
    children: React.ReactElement<{ view: HistoryView }>;
  }>;
  return page.props.children.props.view;
}

/**
 * Cross-user access through the real route handlers. "Actors" are browsers: each has its own cookie jar, either a
 * signed-in account or an anonymous identity. Whatever one actor sends, it must never reach another actor's data.
 */
let db: Db;
let dir: string;
let ip = 0;
type Actor = Map<string, string>;
const actors: Record<string, Actor> = {};

function actAs(actor: Actor) {
  jar.clear();
  for (const [name, value] of actor) jar.set(name, value);
}
function saveActor(name: string) {
  actors[name] = new Map(jar);
}
async function registerActor(name: string) {
  jar.clear();
  expect((await signUp(`${name}@example.com`, PASSWORD, { ip: `10.4.0.${++ip}` })).status).toBe(200);
  saveActor(name);
}
const ctxFor = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const post = (url: string, init: RequestInit = {}) => new Request(`http://localhost${url}`, { method: "POST", ...init });
const get = (url: string) => new Request(`http://localhost${url}`);
const json = async (response: Response) => (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function uploadForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(2048))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
async function upload(fields: Record<string, string> = {}) {
  const response = await postAttempt(post("/api/speaking/attempts", { body: uploadForm(fields) }));
  return { response, body: await json(response) };
}

let attemptOfA: string;
let sessionOfA: string;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-xuser-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  resetAuthLimitersForTesting();
  afterTasks.length = 0;
  await registerActor("alice");
  await registerActor("bob");
  actors.anonymous = new Map(); // a browser with no cookies yet

  actAs(actors.alice);
  sessionOfA = (await json(await postSession())).sessionId;
  const { body } = await upload({ sessionId: sessionOfA });
  attemptOfA = body.attempt.id;
});
afterEach(async () => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the owner", () => {
  it("can read, play back and list their own attempt", async () => {
    actAs(actors.alice);
    expect((await getAttempt(get(`/api/speaking/attempts/${attemptOfA}`), ctxFor({ attemptId: attemptOfA }))).status).toBe(200);
    const audio = await getAudio(get("/x"), ctxFor({ attemptId: attemptOfA }));
    expect(audio.status).toBe(200);
    expect((await audio.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const list = await json(await getTaskAttempts(get("/x"), ctxFor({ taskId: TASK_ID })));
    expect(list.attempts.map((a: { id: string }) => a.id)).toEqual([attemptOfA]);
  });
});

describe("History page: only the owner's attempts (same owner check as the result page)", () => {
  it("lists alice's attempt for alice, and nothing of hers for bob or a new browser", async () => {
    expect((await historyFor(actors.alice)).rows.map((r) => r.id)).toEqual([attemptOfA]);
    for (const other of [actors.bob, actors.anonymous]) {
      const view = await historyFor(other);
      expect(view.total).toBe(0); // the empty state
      expect(JSON.stringify(view)).not.toContain(attemptOfA);
    }
  });

  it("each browser sees only its own attempts, signed in or anonymous", async () => {
    actAs(actors.bob);
    const { body: ofBob } = await upload();
    // An anonymous browser gets its identity on its first API call, then records its own answer.
    jar.clear();
    const { body: ofAnon } = await upload();
    const anonymous: Actor = new Map(jar);

    expect((await historyFor(actors.alice)).rows.map((r) => r.id)).toEqual([attemptOfA]);
    expect((await historyFor(actors.bob)).rows.map((r) => r.id)).toEqual([ofBob.attempt.id]);
    expect((await historyFor(anonymous)).rows.map((r) => r.id)).toEqual([ofAnon.attempt.id]);
  });

  it("an attempt id that is not yours, put in the query, changes nothing", async () => {
    const view = await historyFor(actors.bob, { part: attemptOfA, show: attemptOfA });
    expect(view.total).toBe(0);
  });
});

describe("exam date: saved per user, only ever the caller's own", () => {
  const put = (body: unknown) => putExamDate(new Request("http://localhost/api/account/exam-date", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const dateOf = async (email: string) =>
    (await db.select({ examDate: users.examDate, skipped: users.examDateSkippedAt }).from(users).where(eq(users.email, email)).get())!;
  const inDays = (n: number) => addDays(todayIn(new Date()), n);

  it("saves alice's date on alice only; bob's stays empty", async () => {
    actAs(actors.alice);
    expect((await put({ date: inDays(20) })).status).toBe(204);
    expect(await dateOf("alice@example.com")).toEqual({ examDate: inDays(20), skipped: null });
    expect(await dateOf("bob@example.com")).toEqual({ examDate: null, skipped: null });
  });

  it("refuses a past date, a malformed one and an empty body (400), changing nothing", async () => {
    actAs(actors.alice);
    for (const body of [{ date: inDays(-1) }, { date: "28.11.26" }, { date: "2026-02-30" }, {}, { userId: "x", date: 5 }]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      expect((await json(response)).error.code).toBe("invalid_exam_date");
    }
    expect(await dateOf("alice@example.com")).toEqual({ examDate: null, skipped: null });
  });

  it("Skip is remembered, and saving a date later clears it", async () => {
    actAs(actors.alice);
    expect((await put({ skip: true })).status).toBe(204);
    expect((await dateOf("alice@example.com")).skipped).not.toBeNull();
    await put({ date: inDays(3) });
    expect(await dateOf("alice@example.com")).toEqual({ examDate: inDays(3), skipped: null });
  });

  it("an anonymous visitor's date carries over when they create an account", async () => {
    jar.clear();
    expect((await put({ date: inDays(30) })).status).toBe(204); // gets an anonymous identity on the way
    expect((await signUp("carol@example.com", PASSWORD, { ip: "10.4.9.9" })).status).toBe(200);
    expect((await dateOf("carol@example.com")).examDate).toBe(inDays(30));
  });
});

describe.each([["another signed-in user (bob)", "bob"], ["an anonymous visitor", "anonymous"]])("%s cannot reach alice's data", (_label, who) => {
  beforeEach(() => actAs(actors[who]));

  it("cannot read her attempt", async () => {
    const response = await getAttempt(get("/x"), ctxFor({ attemptId: attemptOfA }));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await json(response))).not.toContain(attemptOfA); // no hint that it exists
  });

  it("cannot download her audio", async () => {
    expect((await getAudio(get("/x"), ctxFor({ attemptId: attemptOfA }))).status).toBe(404);
  });

  it("cannot (re)start her attempt's processing", async () => {
    await db.update(speakingAttempts).set({ status: "failed", failureStage: "evaluation", failureCode: "evaluation_failed" }).where(eq(speakingAttempts.id, attemptOfA)).run();
    afterTasks.length = 0;
    expect((await postProcess(post("/x"), ctxFor({ attemptId: attemptOfA }))).status).toBe(404);
    expect(afterTasks).toHaveLength(0);
    expect((await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptOfA)).get())?.status).toBe("failed"); // untouched
  });

  it("sees only their own history for the task", async () => {
    expect((await json(await getTaskAttempts(get("/x"), ctxFor({ taskId: TASK_ID })))).attempts).toEqual([]);
  });

  it("cannot attach events or recordings to her session", async () => {
    const events = [{ name: "practice_opened", occurredAt: new Date().toISOString(), taskId: TASK_ID, sessionId: sessionOfA }];
    expect((await postAnalytics(post("/x", { headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) }))).status).toBe(204);
    const stored = (await db.select().from(analyticsEvents).where(eq(analyticsEvents.name, "practice_opened")).all()).filter((e) => e.userId !== null);
    expect(stored.some((e) => e.sessionId === sessionOfA)).toBe(false);

    const { body } = await upload({ sessionId: sessionOfA });
    const row = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, body.attempt.id)).get())!;
    expect(row.sessionId).not.toBe(sessionOfA);
    expect((await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionOfA)).get())?.userId).not.toBe(row.userId);
  });

  it("cannot retry her attempt (the link is refused)", async () => {
    const { response, body } = await upload({ previousAttemptId: attemptOfA });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_previous_attempt");
  });

  it("cannot make an upload belong to her by naming her in the request", async () => {
    const aliceId = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptOfA)).get())!.userId;
    const { body } = await upload({ userId: aliceId, user_id: aliceId, accountId: aliceId });
    const row = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, body.attempt.id)).get())!;
    expect(row.userId).not.toBe(aliceId);
  });
});

describe("identity cannot be modified or spoofed from outside", () => {
  it("a query-string or header user id changes nothing", async () => {
    actAs(actors.bob);
    const aliceId = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptOfA)).get())!.userId;
    const request = new Request(`http://localhost/api/speaking/attempts/${attemptOfA}?userId=${aliceId}`, { headers: { "x-user-id": aliceId, "x-forwarded-user": aliceId } });
    expect((await getAttempt(request, ctxFor({ attemptId: attemptOfA }))).status).toBe(404);
  });

  it("user-management endpoints of the auth library are not reachable", async () => {
    actAs(actors.bob);
    for (const path of ["/update-user", "/change-email", "/change-password", "/delete-user", "/set-password"]) {
      expect((await authRequest(path, { name: "x", newPassword: "x".repeat(12) })).status, path).toBe(404);
    }
  });
});

describe("signing out ends access", () => {
  it("alice's resources and account state disappear for her browser after sign-out", async () => {
    actAs(actors.alice);
    expect((await json(await getMe())).state).toBe("authenticated");
    await signOut();
    expect((await json(await getMe())).state).toBe("anonymous");
    expect((await getAttempt(get("/x"), ctxFor({ attemptId: attemptOfA }))).status).toBe(404);
    expect((await json(await getTaskAttempts(get("/x"), ctxFor({ taskId: TASK_ID })))).attempts).toEqual([]);
  });

  it("the replayed old session cookie no longer authenticates", async () => {
    const stale = new Map(actors.alice);
    actAs(actors.alice);
    await signOut();
    actAs(stale);
    expect((await json(await getMe())).state).toBe("anonymous");
    expect((await getAttempt(get("/x"), ctxFor({ attemptId: attemptOfA }))).status).toBe(404);
  });

  it("/api/account/me never returns ids (only state, email and display name, for the Account menu)", async () => {
    actAs(actors.alice);
    const body = await json(await getMe());
    expect(body).toEqual({ state: "authenticated", email: "alice@example.com", name: "alice" });
  });
});
