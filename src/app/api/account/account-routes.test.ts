import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
vi.setConfig({ testTimeout: 30_000 });

import { eq, inArray, or } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import ProfilePage from "@/app/profile/page";
import { DELETED_ITEMS } from "@/domain/account";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import {
  classMembers,
  classes,
  ratingPairs,
  teacherRatings,
  analyticsEvents,
  authAccounts,
  authSessions,
  evaluations,
  practiceSessions,
  recordingBlobs,
  recordings,
  speakingAttempts,
  transcripts,
  users,
} from "@/server/db/schema";
import { setAudioStorageForTesting, type AudioStorage } from "@/server/storage";
import { DatabaseAudioStorage } from "@/server/storage/database-audio-storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { PASSWORD, signIn, signUp } from "../../../../test/auth-helpers";
import { TASK_ID } from "../../../../test/db-helpers";
import { fakeWebm } from "../../../../test/fixtures";
import { jar } from "../../../../test/next-headers-mock";
import { POST as postSession } from "../sessions/route";
import { POST as postAttempt } from "../speaking/attempts/route";
import { PUT as putExamDate } from "./exam-date/route";
import { GET as getMe } from "./me/route";
import { POST as postDelete } from "./delete/route";
import { PUT as putName } from "./name/route";
import { POST as postPassword } from "./password/route";
import { setTeacherLiveForTesting } from "@/server/teacher/release";
import { POST as postClass } from "../teacher/classes/route";
import { PUT as putRating } from "../teacher/classes/[classId]/attempts/[attemptId]/rating/route";
import { GET as getMyClasses, POST as postShare } from "../classes/route";
import { POST as postLeave } from "../classes/[memberId]/leave/route";

/*
 * Profile and Settings through the real route handlers and pages: the name, Change password and Delete my account.
 * Each "browser" is a cookie jar. Deletion is checked table by table and on the audio storage itself (files on disk
 * for `local`, rows of `recording_blobs` for `database`), and another account's data must survive it untouched.
 */

let db: Db;
let dir: string;
let ip = 0;
type Browser = Map<string, string>;

const use = (browser: Browser) => {
  jar.clear();
  for (const [k, v] of browser) jar.set(k, v);
};
const snapshot = (): Browser => new Map(jar);
const json = (body: unknown, init: RequestInit = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: "http://localhost", ...(init.headers as Record<string, string>) },
  body: JSON.stringify(body),
});
const req = (url: string, init: RequestInit) => new Request(`http://localhost${url}`, init);

async function register(name: string): Promise<Browser> {
  jar.clear();
  expect((await signUp(`${name}@example.com`, PASSWORD, { ip: `10.9.0.${++ip}` })).status).toBe(200);
  return snapshot();
}

/** Record one answer and score it with the mock providers (transcript, evaluation, recording). Returns its id. */
async function practise(): Promise<string> {
  const sessionId = ((await (await postSession()).json()) as { sessionId: string }).sessionId;
  const form = new FormData();
  form.set("audio", new Blob([new Uint8Array(fakeWebm(4096))], { type: "audio/webm" }), "recording.webm");
  form.set("taskId", TASK_ID);
  form.set("durationMs", "95000");
  form.set("sessionId", sessionId);
  const response = await postAttempt(req("/api/speaking/attempts", { method: "POST", body: form }));
  expect(response.status).toBe(201);
  const id = ((await response.json()) as { attempt: { id: string } }).attempt.id;
  while (afterTasks.length) await afterTasks.shift()!();
  const row = await db.select({ status: speakingAttempts.status }).from(speakingAttempts).where(eq(speakingAttempts.id, id)).get();
  expect(row?.status).toBe("completed");
  return id;
}

async function userIdOf(email: string): Promise<string> {
  return (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())!.id;
}

/** Every row anywhere that belongs to these users or their attempts. */
async function rowsOf(userIds: string[], attemptIds: string[]) {
  return {
    users: await db.select().from(users).where(or(inArray(users.id, userIds), inArray(users.mergedIntoUserId, userIds))).all(),
    authAccounts: await db.select().from(authAccounts).where(inArray(authAccounts.userId, userIds)).all(),
    authSessions: await db.select().from(authSessions).where(inArray(authSessions.userId, userIds)).all(),
    sessions: await db.select().from(practiceSessions).where(inArray(practiceSessions.userId, userIds)).all(),
    attempts: await db.select().from(speakingAttempts).where(or(inArray(speakingAttempts.userId, userIds), inArray(speakingAttempts.id, attemptIds))).all(),
    recordings: await db.select().from(recordings).where(inArray(recordings.attemptId, attemptIds)).all(),
    transcripts: await db.select().from(transcripts).where(inArray(transcripts.attemptId, attemptIds)).all(),
    evaluations: await db.select().from(evaluations).where(inArray(evaluations.attemptId, attemptIds)).all(),
    events: await db.select().from(analyticsEvents).where(or(inArray(analyticsEvents.userId, userIds), inArray(analyticsEvents.attemptId, attemptIds))).all(),
  };
}

function setUp(storage: () => AudioStorage) {
  beforeEach(async () => {
    db = await openDatabase(":memory:");
    setDbForTesting(db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-account-"));
    setAudioStorageForTesting(storage());
    resetAuthLimitersForTesting();
    afterTasks.length = 0;
    jar.clear();
  });
  afterEach(() => {
    setDbForTesting(undefined);
    setAudioStorageForTesting(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe("name (Profile)", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("saves the signed-in account's own name, trimmed; the Account menu shows it; another account is untouched", async () => {
    const bob = await register("bob");
    const alice = await register("alice");
    use(alice);
    const response = await putName(req("/api/account/name", { ...json({ name: "  Alice   Karimova " }), method: "PUT" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Alice Karimova" });
    expect(await (await getMe()).json()).toMatchObject({ name: "Alice Karimova", email: "alice@example.com" });
    use(bob);
    expect(await (await getMe()).json()).toMatchObject({ name: "bob" });
  });

  it("refuses an empty or too long name (400) and a browser without an account (401)", async () => {
    use(await register("alice"));
    for (const name of ["", "   ", "x".repeat(51), 42]) {
      expect((await putName(req("/x", { ...json({ name }), method: "PUT" }))).status, String(name)).toBe(400);
    }
    jar.clear();
    expect((await putName(req("/x", { ...json({ name: "Mallory" }), method: "PUT" }))).status).toBe(401);
  });
});

describe("Change password (Settings)", () => {
  setUp(() => new LocalAudioStorage(dir));

  it("needs the current password; then the new one signs in, the old one does not, and other devices are signed out", async () => {
    const alice = await register("alice");
    // A second device, signed in to the same account.
    jar.clear();
    await signIn("alice@example.com", PASSWORD, { ip: "10.9.1.1" });
    const phone = snapshot();

    use(alice);
    const wrong = await postPassword(req("/api/account/password", json({ currentPassword: "not my password", newPassword: "a brand new password" })));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toBe("Your current password is not right.");

    const ok = await postPassword(req("/api/account/password", json({ currentPassword: PASSWORD, newPassword: "a brand new password" })));
    expect(ok.status).toBe(204);
    // This browser stays signed in (a fresh session cookie); the phone is signed out.
    const { applySetCookies } = await import("../../../../test/next-headers-mock");
    applySetCookies(ok);
    expect(await (await getMe()).json()).toMatchObject({ state: "authenticated" });
    use(phone);
    expect(await (await getMe()).json()).toEqual({ state: "anonymous" });

    jar.clear();
    expect((await signIn("alice@example.com", PASSWORD, { ip: "10.9.1.2" })).status).not.toBe(200);
    jar.clear();
    expect((await signIn("alice@example.com", "a brand new password", { ip: "10.9.1.3" })).status).toBe(200);
  });

  it("refuses a short new password, a missing current password, no account (401) and a cross-site request (403)", async () => {
    use(await register("alice"));
    expect((await postPassword(req("/x", json({ currentPassword: PASSWORD, newPassword: "short" })))).status).toBe(400);
    expect((await postPassword(req("/x", json({ newPassword: "long enough password" })))).status).toBe(400);
    expect((await postPassword(req("/x", json({ currentPassword: PASSWORD, newPassword: "long enough password" }, { headers: { origin: "https://evil.example" } })))).status).toBe(403);
    jar.clear();
    expect((await postPassword(req("/x", json({ currentPassword: PASSWORD, newPassword: "long enough password" })))).status).toBe(401);
    // Nothing changed: the old password still works.
    jar.clear();
    expect((await signIn("alice@example.com", PASSWORD, { ip: "10.9.2.1" })).status).toBe(200);
  });

  it("wrong current passwords count like failed sign-ins: after the limit, even the right one waits", async () => {
    use(await register("alice"));
    let last = 0;
    for (let i = 0; i < 20 && last !== 429; i++) {
      last = (await postPassword(req("/x", json({ currentPassword: `guess ${i}`, newPassword: "long enough password" })))).status;
    }
    expect(last).toBe(429);
    expect((await postPassword(req("/x", json({ currentPassword: PASSWORD, newPassword: "long enough password" })))).status).toBe(429);
  });
});

describe.each([
  ["local (files on disk)", () => new LocalAudioStorage(dir)],
  ["database (recording_blobs)", () => new DatabaseAudioStorage()],
] as const)("Delete my account, audio stored as %s", (_name, storage) => {
  setUp(storage);

  async function audioExists(key: string): Promise<boolean> {
    if (_name.startsWith("local")) return fs.existsSync(path.join(dir, key));
    return Boolean(await db.select({ key: recordingBlobs.storageKey }).from(recordingBlobs).where(eq(recordingBlobs.storageKey, key)).get());
  }

  it("deletes every attempt, recording (the audio itself), transcript, result, the exam date and the account; signs out; leaves others alone", async () => {
    // Bob practises too: nothing of his may be touched.
    use(await register("bob"));
    const bobAttempt = await practise();
    const bobId = await userIdOf("bob@example.com");

    // Alice practises first without an account (an anonymous identity), then signs up: that identity is merged in.
    jar.clear();
    const anonymousAttempt = await practise();
    const anonymousId = jar.get("cefro_uid")!;
    expect((await signUp("alice@example.com", PASSWORD, { ip: "10.9.3.1" })).status).toBe(200);
    const aliceAttempt = await practise();
    expect((await putExamDate(req("/x", { ...json({ date: "2099-01-01" }), method: "PUT" }))).status).toBe(400); // too far
    const today = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect((await putExamDate(req("/x", { ...json({ date: today }), method: "PUT" }))).status).toBe(204);
    const aliceId = await userIdOf("alice@example.com");
    const alice = snapshot();

    const attemptIds = [anonymousAttempt, aliceAttempt];
    const before = await rowsOf([aliceId, anonymousId], attemptIds);
    expect(before.attempts).toHaveLength(2);
    expect(before.recordings).toHaveLength(2);
    expect(before.transcripts.length).toBeGreaterThanOrEqual(2);
    expect(before.evaluations.length).toBeGreaterThanOrEqual(2);
    expect(before.users.find((u) => u.id === aliceId)?.examDate).toBe(today);
    expect(before.users.some((u) => u.id === anonymousId)).toBe(true); // the merged identity's tombstone
    const keys = before.recordings.map((r) => r.storageKey);
    for (const key of keys) expect(await audioExists(key), key).toBe(true);
    const bobKey = (await db.select().from(recordings).where(eq(recordings.attemptId, bobAttempt)).get())!.storageKey;

    // Anything but DELETE, a missing or wrong password, or a cross-site request deletes nothing.
    for (const confirm of [undefined, "", "delete", "Delete", "DELET"]) {
      expect((await postDelete(req("/x", json({ password: PASSWORD, confirm })))).status, String(confirm)).toBe(400);
    }
    expect((await postDelete(req("/x", json({ confirm: "DELETE" })))).status).toBe(400);
    const wrong = await postDelete(req("/x", json({ password: "not my password", confirm: "DELETE" })));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toBe("Your password is not right.");
    expect((await postDelete(req("/x", json({ password: PASSWORD, confirm: "DELETE" }, { headers: { origin: "https://evil.example" } })))).status).toBe(403);
    expect((await rowsOf([aliceId], attemptIds)).attempts).toHaveLength(2);

    use(alice);
    expect((await postDelete(req("/api/account/delete", json({ password: PASSWORD, confirm: "DELETE" })))).status).toBe(204);

    // Every table: nothing left of Alice, her merged identity or her attempts.
    const after = await rowsOf([aliceId, anonymousId], attemptIds);
    expect(after).toEqual({ users: [], authAccounts: [], authSessions: [], sessions: [], attempts: [], recordings: [], transcripts: [], evaluations: [], events: [] });
    // The audio itself is gone from the storage.
    for (const key of keys) expect(await audioExists(key), key).toBe(false);
    // This browser is signed out, and the account cannot sign in any more.
    expect(jar.has("cefro.session_token")).toBe(false);
    expect(await (await getMe()).json()).toEqual({ state: "anonymous" });
    jar.clear();
    expect((await signIn("alice@example.com", PASSWORD, { ip: "10.9.3.2" })).status).not.toBe(200);

    // Bob: untouched, audio included.
    const bob = await rowsOf([bobId], [bobAttempt]);
    expect(bob.users).toHaveLength(1);
    expect(bob.attempts).toHaveLength(1);
    expect(bob.recordings).toHaveLength(1);
    expect(bob.evaluations.length).toBeGreaterThanOrEqual(1);
    expect(await audioExists(bobKey)).toBe(true);
  });

  it("the Settings list names exactly what the deletion covers", () => {
    expect(DELETED_ITEMS).toEqual([
      "Your practice attempts and their results",
      "Your recordings and transcripts",
      "Your exam date",
      "Your account: name, email and password",
    ]);
  });

  it("a browser without an account cannot delete anything (401)", async () => {
    jar.clear();
    await practise();
    expect((await postDelete(req("/x", json({ password: PASSWORD, confirm: "DELETE" })))).status).toBe(401);
    expect(await db.select().from(speakingAttempts).all()).toHaveLength(1);
  });
});

describe("Account page (real data, the caller's own only)", () => {
  setUp(() => new LocalAudioStorage(dir));

  const page = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as React.ReactElement);
  const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) } as never;

  it("Profile: Alice sees her name, email, member since, attempts and level; Bob sees none of it", async () => {
    const bob = await register("bob");
    use(await register("alice"));
    await practise();
    const markup = await page(ProfilePage(props));
    expect(markup).toMatch(/data-testid="profile-name"[^>]*>alice</);
    expect(markup).toMatch(/data-testid="profile-email"[^>]*>alice@example.com</);
    expect(markup).toMatch(/data-testid="profile-member-since"[^>]*>Member since \d\d\.\d\d\.\d\d</);
    expect(markup).toMatch(/data-testid="profile-attempts"[^>]*>1 practice attempt</);
    expect(markup).toMatch(/data-testid="profile-level"[^>]*>(Below B1|B1|B2|Above B2)</);
    expect(markup).not.toContain("Demo mode");

    use(bob);
    const ofBob = await page(ProfilePage(props));
    expect(ofBob).not.toContain("alice");
    expect(ofBob).toMatch(/data-testid="profile-attempts"[^>]*>No practice attempts yet</);
    expect(ofBob).toMatch(/data-testid="profile-level"[^>]*>No level yet</);
    expect(ofBob).toContain("Not set"); // no exam date: "Not set · Add exam date"
    expect(ofBob).toContain('data-testid="exam-add"');
  });

  it("a browser without an account: no name or email; Sign in / Create account; no password, sign-out or delete sections", async () => {
    jar.clear();
    const markup = await page(ProfilePage(props));
    expect(markup).toContain("Practising without an account");
    expect(markup).not.toContain('data-testid="profile-email"');
    expect(markup).toContain('href="/login?next=/profile"');
    for (const absent of ["Current password", ">Sign out<", "Delete my account"]) expect(markup).not.toContain(absent);
  });

  it("for an account: password and sign-out, then Delete my account last; no demo label", async () => {
    use(await register("alice"));
    const markup = await page(ProfilePage(props));
    const at = [">Change password<", ">Sign out<", ">Delete my account<"].map((t) => markup.indexOf(t));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(markup).not.toContain("Demo mode");
  });
});

describe("Delete my account: the Teacher view's rows (class links and ratings), table by table", () => {
  setUp(() => new LocalAudioStorage(dir));
  beforeEach(() => setTeacherLiveForTesting(true));
  afterEach(() => setTeacherLiveForTesting(undefined));
  const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

  /** Bob teaches Group B; Alice and Carol share with it and practise; Bob rates both answers. */
  async function classroom() {
    const bob = await register("bob");
    await db.update(users).set({ role: "teacher" }).where(eq(users.email, "bob@example.com")).run();
    const { class: cls } = (await (await postClass(req("/x", json({ name: "Group B" })), ctx({}))).json()) as { class: { id: string; joinCode: string } };
    const shareAndPractise = async (name: string) => {
      await register(name);
      expect((await postShare(req("/x", json({ code: cls.joinCode, shownName: name })), ctx({}))).status).toBe(201);
      const attempt = await practise();
      return { browser: snapshot(), attempt };
    };
    const alice = await shareAndPractise("alice");
    const carol = await shareAndPractise("carol");
    jar.clear();
    for (const [k, v] of bob) jar.set(k, v);
    for (const { attempt } of [alice, carol]) {
      expect((await putRating(req("/x", { ...json({ agrees: false, band: 2 }), method: "PUT" }), ctx({ classId: cls.id, attemptId: attempt }))).status).toBe(200);
    }
    return { bob: snapshot(), alice, carol, classId: cls.id };
  }

  it("a student: their class links and every rating on their attempts go; no anonymous pair is made; the class and Carol stay", async () => {
    const { alice, carol, classId } = await classroom();
    const aliceId = await userIdOf("alice@example.com");
    expect(await db.select().from(classMembers).where(eq(classMembers.studentUserId, aliceId)).all()).toHaveLength(1);
    use(alice.browser);
    expect((await postDelete(req("/x", json({ password: PASSWORD, confirm: "DELETE" })))).status).toBe(204);

    expect(await db.select().from(classMembers).where(eq(classMembers.studentUserId, aliceId)).all()).toEqual([]);
    expect(await db.select().from(teacherRatings).where(eq(teacherRatings.attemptId, alice.attempt)).all()).toEqual([]);
    expect(await db.select().from(ratingPairs).all()).toEqual([]);
    expect(await db.select().from(classes).where(eq(classes.id, classId)).all()).toHaveLength(1);
    expect(await db.select().from(classMembers).all()).toHaveLength(1); // Carol's
    expect(await db.select().from(teacherRatings).where(eq(teacherRatings.attemptId, carol.attempt)).all()).toHaveLength(1);
  });

  it("a teacher: their classes, the memberships in them and their ratings go; students' attempts and accounts stay; earlier pairs stay", async () => {
    const { bob, alice, carol } = await classroom();
    // Carol leaves first: her rating becomes an anonymous pair, which can't be linked to anyone and stays.
    use(carol.browser);
    const carolMember = ((await (await getMyClasses(req("/x", { method: "GET" }), ctx({}))).json()) as { classes: { id: string }[] }).classes[0].id;
    expect((await postLeave(req("/x", json({})), ctx({ memberId: carolMember }))).status).toBe(204);
    expect(await db.select().from(ratingPairs).all()).toHaveLength(1);

    use(bob);
    expect((await postDelete(req("/x", json({ password: PASSWORD, confirm: "DELETE" })))).status).toBe(204);
    expect(await db.select().from(classes).all()).toEqual([]);
    expect(await db.select().from(classMembers).all()).toEqual([]);
    expect(await db.select().from(teacherRatings).all()).toEqual([]);
    expect(await db.select().from(ratingPairs).all()).toHaveLength(1);
    expect(await db.select().from(speakingAttempts).where(inArray(speakingAttempts.id, [alice.attempt, carol.attempt])).all()).toHaveLength(2);
    expect(await db.select().from(users).where(inArray(users.email, ["alice@example.com", "carol@example.com"])).all()).toHaveLength(2);
    // Alice's Account page no longer lists the class.
    use(alice.browser);
    expect(await (await getMyClasses(req("/x", { method: "GET" }), ctx({}))).json()).toEqual({ classes: [] });
  });
});
