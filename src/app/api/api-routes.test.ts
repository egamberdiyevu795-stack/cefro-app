import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Development-only providers: allowed because NODE_ENV is "test". No real provider is ever contacted.
vi.hoisted(() => {
  process.env.TRANSCRIPTION_PROVIDER = "mock";
  process.env.EVALUATION_PROVIDER = "mock";
});

const jar = vi.hoisted(() => new Map<string, string>());
const afterTasks = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
}));
vi.mock("@/server/config/provider-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/config/provider-config")>();
  return { ...actual, validateProviderConfig: vi.fn(actual.validateProviderConfig) };
});

import { eq } from "drizzle-orm";
import { MAX_AUDIO_BYTES } from "@/server/attempts/attempt-service";
import { validateProviderConfig } from "@/server/config/provider-config";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts } from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { TASK_ID, seedAttempt, seedSession, seedUsers } from "../../../test/db-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { POST as postAnalytics } from "./analytics/events/route";
import { POST as postSession } from "./sessions/route";
import { POST as postAttempt } from "./speaking/attempts/route";
import { POST as postProcess } from "./speaking/attempts/[attemptId]/process/route";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const URL_BASE = "http://localhost";

let db: Db;
let storageDir: string;

beforeEach(() => {
  db = openDatabase(":memory:");
  setDbForTesting(db);
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-routes-"));
  setAudioStorageForTesting(new LocalAudioStorage(storageDir));
  jar.clear();
  jar.set("cefro_uid", USER);
  afterTasks.length = 0;
});
afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(storageDir, { recursive: true, force: true });
  vi.mocked(validateProviderConfig).mockClear();
});

function uploadForm(fields: Record<string, string> = {}, audio: Buffer = fakeWebm(2048)) {
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(audio)], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const post = (path: string, init: RequestInit) => new Request(`${URL_BASE}${path}`, { method: "POST", ...init });
interface Json {
  sessionId: string;
  attempt: { id: string };
  error: { code: string; message: string };
}
const json = (response: Response) => response.json() as Promise<Json>;

describe("POST /api/sessions", () => {
  it("creates a server-generated session for the cookie user", async () => {
    const response = await postSession();
    expect(response.status).toBe(201);
    const { sessionId } = await json(response);
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).get()).toMatchObject({ userId: USER, kind: "single_task" });
  });

  it("creates the anonymous user when the browser has no cookie yet", async () => {
    jar.clear();
    const response = await postSession();
    expect(response.status).toBe(201);
    expect(jar.get("cefro_uid")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rate-limits session creation with a stable code and Retry-After", async () => {
    jar.set("cefro_uid", "99999999-9999-4999-8999-999999999999");
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await postSession();
    expect(last!.status).toBe(429);
    expect((await json(last!)).error.code).toBe("session_rate_limited");
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("POST /api/analytics/events: session correlation", () => {
  const event = (extra: Record<string, unknown> = {}) => ({ name: "practice_opened", occurredAt: new Date().toISOString(), taskId: TASK_ID, ...extra });
  const send = (events: unknown[]) =>
    postAnalytics(post("/api/analytics/events", { headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) }));
  const stored = () => db.select().from(analyticsEvents).all();

  it("keeps a session id that was issued to this user", async () => {
    seedUsers(db, USER);
    const sessionId = seedSession(db, USER, "33333333-3333-4333-8333-333333333333");
    expect((await send([event({ sessionId })])).status).toBe(204);
    expect(stored()).toMatchObject([{ userId: USER, sessionId, name: "practice_opened" }]);
  });

  it("never stores another user's session id (the event is kept, without a session)", async () => {
    seedUsers(db, USER, OTHER);
    const foreign = seedSession(db, OTHER, "44444444-4444-4444-8444-444444444444");
    expect((await send([event({ sessionId: foreign })])).status).toBe(204);
    expect(stored()).toMatchObject([{ userId: USER, sessionId: null }]);
  });

  it("treats unknown, malformed and missing session ids as no session", async () => {
    seedUsers(db, USER);
    const ok = await send([
      event({ sessionId: "55555555-5555-4555-8555-555555555555" }), // well-formed but never issued
      event({ sessionId: "not-a-session" }),
      event(),
      event({ sessionId: null }),
    ]);
    expect(ok.status).toBe(204);
    expect(stored().map((e) => e.sessionId)).toEqual([null, null, null, null]);
  });

  it("still ignores a client-supplied user id", async () => {
    seedUsers(db, USER);
    await send([event({ userId: OTHER })]);
    expect(stored()[0].userId).toBe(USER);
  });

  it("rate-limits an event flood per user", async () => {
    jar.set("cefro_uid", "88888888-8888-4888-8888-888888888888");
    const batch = Array.from({ length: 25 }, () => event());
    let last: Response | undefined;
    for (let i = 0; i < 13; i++) last = await send(batch); // 13 × 25 = 325 > 300 per minute
    expect(last!.status).toBe(429);
    expect((await json(last!)).error.code).toBe("rate_limited");
  });
});

describe("POST /api/speaking/attempts: upload size and validation", () => {
  it("accepts a valid recording, creates a session for it and starts processing", async () => {
    const response = await postAttempt(post("/api/speaking/attempts", { body: uploadForm() }));
    expect(response.status).toBe(201);
    const { attempt } = await json(response);
    const row = db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt.id)).get()!;
    expect(row.sessionId).not.toBeNull();
    expect(db.select().from(practiceSessions).get()?.id).toBe(row.sessionId);
    expect(afterTasks).toHaveLength(1); // background processing was scheduled
  });

  it("uses the client's session id only when it belongs to the user", async () => {
    seedUsers(db, USER, OTHER);
    const mine = seedSession(db, USER, "66666666-6666-4666-8666-666666666666");
    const theirs = seedSession(db, OTHER, "77777777-7777-4777-8777-777777777777");

    const a = await json(await postAttempt(post("/api/speaking/attempts", { body: uploadForm({ sessionId: mine }) })));
    expect(db.select().from(speakingAttempts).where(eq(speakingAttempts.id, a.attempt.id)).get()?.sessionId).toBe(mine);

    const b = await json(await postAttempt(post("/api/speaking/attempts", { body: uploadForm({ sessionId: theirs }) })));
    const bSession = db.select().from(speakingAttempts).where(eq(speakingAttempts.id, b.attempt.id)).get()?.sessionId;
    expect(bSession).not.toBe(theirs);
    expect(bSession).not.toBeNull();
  });

  it("rejects an oversized upload that declares an honest Content-Length", async () => {
    const big = Buffer.alloc(MAX_AUDIO_BYTES + 200_000, 1);
    big.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    const response = await postAttempt(post("/api/speaking/attempts", { body: uploadForm({}, big) }));
    expect(response.status).toBe(413);
    expect((await json(response)).error.code).toBe("audio_too_large");
    expect(db.select().from(speakingAttempts).all()).toHaveLength(0);
  });

  it("stops reading an oversized chunked upload that has NO Content-Length, long before the end", async () => {
    let chunksRead = 0;
    const chunk = new Uint8Array(256 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        if (chunksRead > 4_000) return controller.close(); // would be ~1 GB if the server kept reading
        controller.enqueue(chunk);
      },
    });
    const request = post("/api/speaking/attempts", { body, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=x" } } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();

    const response = await postAttempt(request);
    expect(response.status).toBe(413);
    expect(chunksRead).toBeLessThan(120); // ~20 MB limit / 256 KB ≈ 80 chunks (+ stream read-ahead)
  });

  it("does not trust a Content-Length that understates the body", async () => {
    const big = Buffer.alloc(MAX_AUDIO_BYTES + 200_000, 1);
    const form = uploadForm({}, big);
    const request = post("/api/speaking/attempts", { body: form, headers: { "content-length": "1000" } });
    const response = await postAttempt(request);
    expect(response.status).toBe(413);
  });

  it("keeps validating content: wrong bytes, wrong type, and a missing audio part", async () => {
    const notAudio = await postAttempt(post("/api/speaking/attempts", { body: uploadForm({}, Buffer.from("<?php echo 1; ?>")) }));
    expect(notAudio.status).toBe(415);
    const noAudio = new FormData();
    noAudio.set("taskId", TASK_ID);
    noAudio.set("durationMs", "1");
    const missing = await postAttempt(post("/api/speaking/attempts", { body: noAudio }));
    expect(missing.status).toBe(400);
    expect((await json(missing)).error.code).toBe("missing_audio");
    const notMultipart = await postAttempt(post("/api/speaking/attempts", { body: "hello", headers: { "content-type": "text/plain" } }));
    expect(notMultipart.status).toBe(400);
  });

  it("refuses early, before storing anything, when providers are not configured", async () => {
    vi.mocked(validateProviderConfig).mockReturnValueOnce([{ variable: "GEMINI_API_KEY", message: "required" }]);
    const response = await postAttempt(post("/api/speaking/attempts", { body: uploadForm() }));
    expect(response.status).toBe(503);
    const body = await json(response);
    expect(body.error.code).toBe("service_not_configured");
    expect(JSON.stringify(body)).not.toContain("GEMINI"); // no configuration detail reaches the browser
    expect(db.select().from(speakingAttempts).all()).toHaveLength(0);
    expect(fs.readdirSync(storageDir)).toHaveLength(0);
  });

  it("enforces the submission limits with their stable error codes", async () => {
    seedUsers(db, USER);
    // Two answers still being processed (the default concurrent limit).
    for (let i = 0; i < 2; i++) {
      seedAttempt(db, { userId: USER, attemptNumber: i + 1, status: "processing", processingStartedAt: new Date().toISOString() });
    }
    const response = await postAttempt(post("/api/speaking/attempts", { body: uploadForm() }));
    expect(response.status).toBe(429);
    expect((await json(response)).error.code).toBe("too_many_in_progress");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fs.readdirSync(storageDir)).toHaveLength(0); // nothing stored for a refused submission
  });
});

describe("POST /api/speaking/attempts/:id/process: restart limit", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ attemptId: id }) }) as never;
  const ID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("restarts a failed attempt that still has runs left", async () => {
    seedUsers(db, USER);
    seedAttempt(db, { id: ID, userId: USER, attemptNumber: 1, status: "failed", processingRuns: 1 });
    const response = await postProcess(post(`/api/speaking/attempts/${ID}/process`, {}), ctx(ID));
    expect(response.status).toBe(202);
    expect(afterTasks).toHaveLength(1);
  });

  it("refuses with restart_limit_reached once the attempt is out of runs, and runs nothing", async () => {
    seedUsers(db, USER);
    seedAttempt(db, { id: ID, userId: USER, attemptNumber: 1, status: "failed", processingRuns: 3 });
    const response = await postProcess(post(`/api/speaking/attempts/${ID}/process`, {}), ctx(ID));
    expect(response.status).toBe(429);
    expect((await json(response)).error.code).toBe("restart_limit_reached");
    expect(afterTasks).toHaveLength(0);
  });

  it("does not let one user restart another user's attempt", async () => {
    seedUsers(db, USER, OTHER);
    seedAttempt(db, { id: ID, userId: OTHER, attemptNumber: 1, status: "failed", processingRuns: 1 });
    const response = await postProcess(post(`/api/speaking/attempts/${ID}/process`, {}), ctx(ID));
    expect(response.status).toBe(404);
  });
});
