import { execFileSync } from "node:child_process";
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
  connection: async () => undefined,
}));
vi.setConfig({ testTimeout: 60_000 });

import { eq } from "drizzle-orm";
import { audioDeleteDueAt, audioRetentionNote } from "@/domain/audio-retention";
import { canShareWithTeacher, consentLines, parseConsentPreview, recordingLock } from "@/domain/consent";
import { deleteAccount } from "@/server/account/delete-account";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { deleteExpiredAudio } from "@/server/audio-retention/delete-expired-audio";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { readOwnConsent, setConsentRequiredForTesting } from "@/server/consent/consent";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { classMembers, evaluations, recordingBlobs, recordings, speakingAttempts, transcripts, users } from "@/server/db/schema";
import { setAudioStorageForTesting, type AudioStorage } from "@/server/storage";
import { DatabaseAudioStorage } from "@/server/storage/database-audio-storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { resetJoinLimiterForTesting } from "@/server/teacher/routes";
import { teacherCanSee } from "@/server/teacher/teacher-store";
import { PASSWORD, signUp } from "../../../test/auth-helpers";
import { TASK_ID } from "../../../test/db-helpers";
import { fakeWebm } from "../../../test/fixtures";
import { jar } from "../../../test/next-headers-mock";
import { GET as getCron } from "./cron/audio-retention/route";
import { GET as getClass } from "./teacher/classes/[classId]/route";
import { POST as postClass } from "./teacher/classes/route";
import { POST as postShare } from "./classes/route";
import { POST as postSession } from "./sessions/route";
import { POST as postProcess } from "./speaking/attempts/[attemptId]/process/route";
import { POST as postAttempt } from "./speaking/attempts/route";

/*
 * Pilot consent and the 30-day audio deletion (docs/consent-design.md, "Pilot route"), through the real route handlers.
 * Consent is set exactly as scripts/set-consent.mjs sets it (the script itself is run against a database file below).
 */

const ROOT = path.resolve(__dirname, "../../..");
const DAY = 86_400_000;
let db: Db;
let dir: string;
let ip = 0;
type Browser = Map<string, string>;

const use = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
const req = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) }) as never;

async function register(email: string): Promise<Browser> {
  jar.clear();
  expect((await signUp(email, PASSWORD, { ip: `10.30.0.${++ip}` })).status).toBe(200);
  return new Map(jar);
}

/** What scripts/set-consent.mjs writes (the same UPDATE). */
async function setConsent(email: string, status: "granted" | "withdrawn" | null, teacherSharing = false) {
  await db.update(users).set({ consentStatus: status, consentAt: new Date().toISOString(), consentTeacherSharing: teacherSharing }).where(eq(users.email, email)).run();
}

/** Upload one answer as the current browser; returns the response. Runs the scoring (mock providers) when accepted. */
async function upload(): Promise<Response> {
  const sessionId = ((await (await postSession()).json()) as { sessionId: string }).sessionId;
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  form.set("sessionId", sessionId);
  const response = await postAttempt(new Request("http://localhost/api/speaking/attempts", { method: "POST", body: form }));
  while (afterTasks.length) await afterTasks.shift()!();
  return response;
}

async function practise(): Promise<string> {
  const response = await upload();
  expect(response.status).toBe(201);
  return ((await response.json()) as { attempt: { id: string } }).attempt.id;
}

const attemptCount = async () => (await db.select().from(speakingAttempts).all()).length;

function setUp(storage: () => AudioStorage) {
  beforeEach(async () => {
    db = await openDatabase(":memory:");
    setDbForTesting(db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-consent-"));
    setAudioStorageForTesting(storage());
    resetAuthLimitersForTesting();
    resetJoinLimiterForTesting();
    afterTasks.length = 0;
    jar.clear();
  });
  afterEach(() => {
    setConsentRequiredForTesting(undefined);
    setTeacherLiveForTesting(undefined);
    setDbForTesting(undefined);
    setAudioStorageForTesting(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("consent rules (pure)", () => {
  const subject = (consentStatus: "granted" | "withdrawn" | null, sharing = false, kind: "registered" | "anonymous" = "registered") => ({
    kind,
    consentStatus,
    consentTeacherSharing: sharing,
  });

  it("switch off: nobody is locked and teacher sharing is allowed", () => {
    expect(recordingLock(false, null)).toBeNull();
    expect(recordingLock(false, subject(null))).toBeNull();
    expect(canShareWithTeacher(false, subject("withdrawn"))).toBe(true);
  });

  it("switch on: guest, waiting, withdrawn are locked; granted records; sharing needs the flag too", () => {
    expect(recordingLock(true, null)).toBe("guest");
    expect(recordingLock(true, subject("granted", true, "anonymous"))).toBe("guest");
    expect(recordingLock(true, subject(null))).toBe("waiting");
    expect(recordingLock(true, subject("withdrawn"))).toBe("withdrawn");
    expect(recordingLock(true, subject("granted"))).toBeNull();
    expect(canShareWithTeacher(true, subject("granted"))).toBe(false);
    expect(canShareWithTeacher(true, subject("granted", true))).toBe(true);
    expect(canShareWithTeacher(true, subject("withdrawn", true))).toBe(false);
    expect(canShareWithTeacher(true, null)).toBe(false);
  });
});

describe("consent lock on recording and scoring (CONSENT_REQUIRED on)", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("no consent: 403 consent_required, nothing stored; withdrawn: the same; granted: recorded and scored", async () => {
    setConsentRequiredForTesting(true);
    use(await register("alice@example.com"));

    const none = await upload();
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: { code: "consent_required", message: "Ask your parent or guardian to confirm, then we will unlock recording." } });
    expect(await attemptCount()).toBe(0);
    expect(fs.readdirSync(dir)).toHaveLength(0);

    await setConsent("alice@example.com", "granted");
    const id = await practise();
    expect((await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, id)).get())?.status).toBe("completed");

    await setConsent("alice@example.com", "withdrawn");
    const withdrawn = await upload();
    expect(withdrawn.status).toBe(403);
    expect(((await withdrawn.json()) as { error: { message: string } }).error.message).toMatch(/withdrawn/);
    expect(await attemptCount()).toBe(1);
  });

  it("scoring a stored answer again (/process) is refused without consent", async () => {
    use(await register("alice@example.com"));
    await setConsent("alice@example.com", "granted");
    setConsentRequiredForTesting(true);
    const id = await practise();
    await db.update(speakingAttempts).set({ status: "failed", failureCode: "unknown" }).where(eq(speakingAttempts.id, id)).run();
    await setConsent("alice@example.com", "withdrawn");
    const response = await postProcess(req(`/api/speaking/attempts/${id}/process`, "POST"), ctx({ attemptId: id }));
    expect(response.status).toBe(403);
  });

  it("a guest (no account) never records while the switch is on, even with an anonymous identity", async () => {
    setConsentRequiredForTesting(true);
    jar.clear();
    const response = await upload();
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { message: string } }).error.message).toMatch(/needs an account/);
    expect(await attemptCount()).toBe(0);
  });

  it("switch off (the default in tests and mock mode): everyone records as before, guests included", async () => {
    use(await register("alice@example.com"));
    await practise();
    jar.clear();
    await practise();
    expect(await attemptCount()).toBe(2);
  });
});

describe("teacher sharing needs the teacher-sharing flag", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("Share is refused without --teacher-sharing; the teacher stops seeing a student whose consent is withdrawn", async () => {
    setTeacherLiveForTesting(true);
    setConsentRequiredForTesting(true);
    use(await register("teacher@school.example"));
    await db.update(users).set({ role: "teacher" }).where(eq(users.email, "teacher@school.example")).run();
    const teacher = new Map(jar);
    const created = await postClass(req("/api/teacher/classes", "POST", { name: "Group B" }), ctx({}));
    const { class: cls } = (await created.json()) as { class: { id: string; joinCode: string } };

    const alice = await register("alice@example.com");
    await setConsent("alice@example.com", "granted"); // recording only
    const refused = await postShare(req("/api/classes", "POST", { code: cls.joinCode, shownName: "Ali" }), ctx({}));
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("teacher_sharing_not_allowed");
    expect(await db.select().from(classMembers).all()).toHaveLength(0);

    await setConsent("alice@example.com", "granted", true);
    expect((await postShare(req("/api/classes", "POST", { code: cls.joinCode, shownName: "Ali" }), ctx({}))).status).toBe(201);
    await new Promise((r) => setTimeout(r, 5));
    const shared = await practise();
    const teacherId = (await db.select({ id: users.id }).from(users).where(eq(users.email, "teacher@school.example")).get())!.id;
    expect(await teacherCanSee(teacherId, shared)).not.toBeNull();
    use(teacher);
    expect(JSON.stringify(await (await getClass(req("/x"), ctx({ classId: cls.id }))).json())).toContain("Ali");

    await setConsent("alice@example.com", "granted", false); // sharing taken back, recording kept
    expect(await teacherCanSee(teacherId, shared)).toBeNull();
    expect(JSON.stringify(await (await getClass(req("/x"), ctx({ classId: cls.id }))).json())).not.toContain("Ali");
    await setConsent("alice@example.com", "withdrawn", true); // a stray flag never counts without "granted"
    expect(await teacherCanSee(teacherId, shared)).toBeNull();
    void alice;
  });
});

/** Make an attempt look scored (or failed) `daysAgo` days ago. */
async function age(attemptId: string, daysAgo: number, status: "completed" | "failed" | "uploaded" | "processing" = "completed") {
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  await db.update(speakingAttempts).set({ status, completedAt: status === "completed" ? at : null, updatedAt: at }).where(eq(speakingAttempts.id, attemptId)).run();
}

const recordingOf = async (attemptId: string) => (await db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get())!;

describe.each([
  ["files (local storage)", "local", () => new LocalAudioStorage(dir)],
  ["database blobs (recording_blobs)", "database", () => new DatabaseAudioStorage()],
] as const)("audio deletion, 30 days after scoring: %s", (_name, provider, storage) => {
  setUp(storage);

  const audioExists = async (attemptId: string) => {
    const { storageKey } = await recordingOf(attemptId);
    return provider === "local"
      ? fs.existsSync(path.join(dir, storageKey))
      : (await db.select().from(recordingBlobs).where(eq(recordingBlobs.storageKey, storageKey)).get()) !== undefined;
  };

  it("deletes only audio scored 30+ days ago; another account's audio and newer audio stay; transcripts and feedback stay; a second run does nothing", async () => {
    const alice = await register("alice@example.com");
    const old = await practise();
    const recent = await practise();
    const failedOld = await practise();
    const stuckOld = await practise();
    const stuckRecent = await practise();
    use(await register("bob@example.com"));
    const bobs = await practise();
    await age(old, 31);
    await age(recent, 29);
    await age(failedOld, 40, "failed");
    await age(stuckOld, 35, "uploaded"); // never scored, nothing changed for 35 days: deleted too
    await age(stuckRecent, 5, "processing");
    await age(bobs, 10);
    for (const id of [old, recent, failedOld, stuckOld, stuckRecent, bobs]) expect(await audioExists(id)).toBe(true);
    expect((await recordingOf(old)).storageProvider).toBe(provider);
    const before = { transcripts: await db.select().from(transcripts).all(), evaluations: await db.select().from(evaluations).all() };

    const first = await deleteExpiredAudio({ files: new LocalAudioStorage(dir) });
    expect(first).toEqual({
      deleted: 3,
      audioFiles: provider === "local" ? 3 : 0,
      audioBlobs: provider === "database" ? 3 : 0,
      skipped: 0,
    });
    expect(await audioExists(old)).toBe(false);
    expect(await audioExists(failedOld)).toBe(false);
    expect(await audioExists(stuckOld)).toBe(false);
    expect(await audioExists(stuckRecent)).toBe(true);
    expect(await audioExists(recent)).toBe(true);
    expect(await audioExists(bobs)).toBe(true);
    expect((await recordingOf(old)).audioDeletedAt).not.toBeNull();
    expect((await recordingOf(recent)).audioDeletedAt).toBeNull();
    expect((await recordingOf(bobs)).audioDeletedAt).toBeNull();
    // Transcripts, results and feedback are untouched, every attempt is still there.
    expect(await db.select().from(transcripts).all()).toEqual(before.transcripts);
    expect(await db.select().from(evaluations).all()).toEqual(before.evaluations);
    expect(await attemptCount()).toBe(6);

    // Safe to run twice: nothing left to do, nothing changes.
    const markedAt = (await recordingOf(old)).audioDeletedAt;
    expect(await deleteExpiredAudio({ files: new LocalAudioStorage(dir) })).toEqual({ deleted: 0, audioFiles: 0, audioBlobs: 0, skipped: 0 });
    expect((await recordingOf(old)).audioDeletedAt).toBe(markedAt);

    // The result page reads the real dates: deleted, or when it will be.
    use(alice);
    const aliceId = (await db.select({ id: users.id }).from(users).where(eq(users.email, "alice@example.com")).get())!.id;
    const oldView = await getAttemptViewForUser(aliceId, old);
    expect(oldView.audio?.deletedAt).toBe(markedAt);
    expect(oldView.transcript?.text).toBeTruthy();
    expect(oldView.evaluation).not.toBeNull();
    expect(audioRetentionNote(oldView.audio)).toMatch(/^Recording deleted on \d\d\.\d\d\.\d\d, 30 days after scoring\./);
    const recentView = await getAttemptViewForUser(aliceId, recent);
    expect(recentView.audio).toEqual({ deletedAt: null, deletesAt: new Date(Date.parse(recentView.completedAt!) + 30 * DAY).toISOString() });
    expect(audioRetentionNote(recentView.audio)).toMatch(/^Your recording will be deleted on \d\d\.\d\d\.\d\d, 30 days after scoring\./);

    // Its scoring can't be started again once the audio is gone.
    const restart = await postProcess(req(`/api/speaking/attempts/${failedOld}/process`, "POST"), ctx({ attemptId: failedOld }));
    expect(restart.status).toBe(409);
  });

  it("a run interrupted after the audio went (mark missing) finishes on the next run without an error", async () => {
    use(await register("alice@example.com"));
    const id = await practise();
    await age(id, 31);
    const { storageKey } = await recordingOf(id);
    if (provider === "local") fs.rmSync(path.join(dir, storageKey));
    else await db.delete(recordingBlobs).where(eq(recordingBlobs.storageKey, storageKey)).run();
    expect((await deleteExpiredAudio({ files: new LocalAudioStorage(dir) })).deleted).toBe(1);
    expect((await recordingOf(id)).audioDeletedAt).not.toBeNull();
  });

  it("Delete my account still removes everything after the job ran (the marked recording row, the consent columns with the user)", async () => {
    use(await register("alice@example.com"));
    await setConsent("alice@example.com", "granted", true);
    const id = await practise();
    await age(id, 31);
    await deleteExpiredAudio({ files: new LocalAudioStorage(dir) });
    const userId = (await db.select({ id: users.id }).from(users).where(eq(users.email, "alice@example.com")).get())!.id;
    const summary = await deleteAccount(userId);
    expect(summary.recordings).toBe(1);
    expect(await db.select().from(recordings).all()).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, userId)).all()).toHaveLength(0);
  });
});

describe("the cron route", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("refuses without the right Bearer secret (and while CRON_SECRET is unset); runs with it", async () => {
    expect((await getCron(req("/api/cron/audio-retention", "GET", undefined, { authorization: "Bearer anything-at-all-123" }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret-for-the-test-only");
    vi.resetModules();
    const { GET } = await import("./cron/audio-retention/route");
    expect((await GET(req("/x"))).status).toBe(401);
    expect((await GET(req("/x", "GET", undefined, { authorization: "Bearer wrong-secret-value-xx" }))).status).toBe(401);
    const { setDbForTesting: setDb } = await import("@/server/db/client");
    setDb(db);
    const ok = await GET(req("/x", "GET", undefined, { authorization: "Bearer s3cret-for-the-test-only" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: 0, audioFiles: 0, audioBlobs: 0, skipped: 0 });
    setDb(undefined);
    vi.unstubAllEnvs();
  });
});

describe("the Account page's consent section", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("shows the account's own record only while the switch is on; guests and the switch off: nothing", async () => {
    use(await register("alice@example.com"));
    const id = (await db.select({ id: users.id }).from(users).where(eq(users.email, "alice@example.com")).get())!.id;
    expect(await readOwnConsent(id)).toBeNull(); // switch off
    setConsentRequiredForTesting(true);
    expect(await readOwnConsent(id)).toEqual({ status: null, at: null, teacherSharing: false });
    await setConsent("alice@example.com", "granted", true);
    expect(await readOwnConsent(id)).toMatchObject({ status: "granted", teacherSharing: true });
    await setConsent("alice@example.com", "withdrawn", true);
    expect(await readOwnConsent(id)).toMatchObject({ status: "withdrawn", teacherSharing: false });
    expect(await readOwnConsent(null)).toBeNull();
    await db.insert(users).values({ id: "guest-1", kind: "anonymous" }).run();
    expect(await readOwnConsent("guest-1")).toBeNull();
  });

  it("plain lines for each state, with the real date and the 30-day rule", () => {
    const at = "2026-11-08T10:00:00.000Z";
    const rule = "Recordings are deleted 30 days after scoring. Transcripts and feedback are kept until you delete your account.";
    expect(consentLines({ status: null, at: null, teacherSharing: false })).toEqual({
      title: "Waiting for consent",
      body: "Recording unlocks once a parent or guardian has agreed (or you, if you are 18 or older) and the person who invited you has recorded it.",
      retention: rule,
    });
    expect(consentLines({ status: "granted", at, teacherSharing: false })).toMatchObject({ title: "Consent recorded on 08.11.26", body: "Recording is unlocked. Sharing with a teacher: not agreed." });
    expect(consentLines({ status: "withdrawn", at, teacherSharing: false }).title).toBe("Consent withdrawn on 08.11.26");
    expect(parseConsentPreview("granted", new Date(at))).toEqual({ status: "granted", at, teacherSharing: false });
    expect(parseConsentPreview("anything", new Date(at))).toBeNull();
  });
});

describe("audio due dates (pure)", () => {
  it("30 days after scoring; failed: 30 days after it failed; nothing while processing", () => {
    const at = "2026-11-08T10:00:00.000Z";
    expect(audioDeleteDueAt({ status: "completed", completedAt: at, updatedAt: at })).toBe("2026-12-08T10:00:00.000Z");
    expect(audioDeleteDueAt({ status: "failed", completedAt: null, updatedAt: at })).toBe("2026-12-08T10:00:00.000Z");
    expect(audioDeleteDueAt({ status: "processing", completedAt: null, updatedAt: at })).toBeNull();
    expect(audioRetentionNote({ deletedAt: null, deletesAt: "2026-12-08T10:00:00.000Z" })).toBe(
      "Your recording will be deleted on 08.12.26, 30 days after scoring. The transcript and feedback are kept.",
    );
    expect(audioRetentionNote(null)).toBeNull();
  });
});

describe("scripts/set-consent.mjs (the owner's script)", () => {
  let file: string;
  let fileDir: string;
  const run = (...args: string[]) => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: file, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" };
    delete env.VERCEL;
    try {
      return { code: 0, out: execFileSync("node", [path.join(ROOT, "scripts/set-consent.mjs"), ...args], { env, cwd: ROOT, encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      const e = error as { status: number; stderr: string };
      return { code: e.status, out: e.stderr };
    }
  };
  const row = async (fileDb: Db, email: string) =>
    (await fileDb.select({ s: users.consentStatus, at: users.consentAt, t: users.consentTeacherSharing, v: users.consentNoticeVersion }).from(users).where(eq(users.email, email)).get())!;

  beforeEach(() => {
    fileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-consent-script-"));
    file = path.join(fileDir, "cefro.db");
  });
  afterEach(() => fs.rmSync(fileDir, { recursive: true, force: true }));

  it("grants (with and without teacher sharing), withdraws; refuses bad input, unknown emails and anonymous rows; on Vercel it refuses", async () => {
    const fileDb = await openDatabase(file);
    await fileDb.insert(users).values([
      { id: "u1", kind: "registered", email: "alice@example.com" },
      { id: "u2", kind: "registered", email: "bob@example.com" },
      { id: "u3", kind: "anonymous" },
    ]).run();
    expect(await row(fileDb, "alice@example.com")).toEqual({ s: null, at: null, t: false, v: null });

    expect(run("Alice@Example.com", "granted").out).toMatch(/consent granted \(pilot-parent-message-2026-11-12\), recording unlocked; teacher sharing off/);
    expect(await row(fileDb, "alice@example.com")).toMatchObject({ s: "granted", t: false, v: "pilot-parent-message-2026-11-12" });
    expect(run("alice@example.com", "granted", "--notice", "pilot-parent-message-2026-12-01").code).toBe(0);
    expect(await row(fileDb, "alice@example.com")).toMatchObject({ s: "granted", v: "pilot-parent-message-2026-12-01" });
    expect(run("alice@example.com", "granted", "--teacher-sharing").out).toMatch(/teacher sharing on/);
    expect(await row(fileDb, "alice@example.com")).toMatchObject({ s: "granted", t: true });
    expect(run("alice@example.com", "withdrawn").out).toMatch(/node scripts\/delete-account\.mjs alice@example\.com/);
    const withdrawn = await row(fileDb, "alice@example.com");
    // Withdrawn keeps the version that was agreed (a record), and tells the owner how to delete the account.
    expect(withdrawn).toMatchObject({ s: "withdrawn", t: false, v: "pilot-parent-message-2026-11-12" });
    expect(Date.parse(withdrawn.at!)).toBeGreaterThan(Date.now() - 60_000);
    // Bob untouched.
    expect(await row(fileDb, "bob@example.com")).toEqual({ s: null, at: null, t: false, v: null });

    for (const args of [[], ["alice@example.com"], ["alice@example.com", "given"], ["alice@example.com", "withdrawn", "--teacher-sharing"], ["alice@example.com", "granted", "--all"], ["alice@example.com", "granted", "--notice"], ["alice@example.com", "granted", "--notice", "Bad Version!"], ["alice@example.com", "withdrawn", "--notice", "pilot-x-1"]]) {
      expect(run(...args).code, args.join(" ")).toBe(1);
    }
    expect(run("nobody@example.com", "granted").out).toMatch(/no registered account/);
    expect(await row(fileDb, "alice@example.com")).toMatchObject({ s: "withdrawn" });

    const env = { ...process.env, DATABASE_PATH: file, VERCEL: "1" };
    expect(() => execFileSync("node", [path.join(ROOT, "scripts/set-consent.mjs"), "bob@example.com", "granted"], { env, stdio: "pipe" })).toThrow();
    expect(await row(fileDb, "bob@example.com")).toMatchObject({ s: null });
    fileDb.$client.close();
  });

  it("no API route can set consent: no route file writes the consent columns", () => {
    const routes: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) routes.push(p);
      }
    };
    walk(path.join(ROOT, "src"));
    for (const p of routes.filter((f) => !f.endsWith(path.join("db", "schema.ts")))) expect(fs.readFileSync(p, "utf8"), p).not.toMatch(/\.set\(\{[^}]*consent|consent_status\s*=/);
  });
});
