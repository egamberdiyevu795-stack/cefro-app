import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/server/account/delete-account";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import {
  analyticsEvents,
  authAccounts,
  authSessions,
  authVerifications,
  classMembers,
  classes,
  evaluations,
  ratingPairs,
  recordingBlobs,
  recordings,
  teacherMockRatings,
  teacherRatings,
  transcripts,
  users,
} from "@/server/db/schema";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { seedAttempt, seedSession, seedUsers } from "../../../test/db-helpers";

/*
 * scripts/delete-account.mjs (the owner deletes an account when a parent asks, without the student's password) must
 * remove exactly what "Delete my account" (deleteAccount) removes. Both run on the same data, in two copies; every
 * table and the audio folder must end up identical.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(ROOT, "scripts/delete-account.mjs");
const NOW = "2026-11-01T10:00:00.000Z";
let dir: string;

/** Two accounts with something in every table: alice (to delete, with a merged guest identity) and bob (stays). */
async function seed(db: Db, audioDir: string) {
  await seedUsers(db, "guest-a");
  await db.insert(users).values([
    { id: "alice", kind: "registered", email: "alice@example.com", consentStatus: "granted", consentAt: NOW, consentNoticeVersion: "pilot-parent-message-2026-11-08" },
    { id: "bob", kind: "registered", email: "bob@example.com" },
  ]).run();
  await db.update(users).set({ kind: "anonymous", mergedIntoUserId: "alice" }).where(eq(users.id, "guest-a")).run();
  for (const [user, n] of [["alice", 1], ["bob", 2]] as const) {
    await db.insert(authSessions).values({ id: `s-${user}`, userId: user, token: `t-${user}`, expiresAt: new Date(NOW), updatedAt: new Date(NOW) }).run();
    await db.insert(authAccounts).values({ id: `acc-${user}`, userId: user, accountId: user, providerId: "credential", updatedAt: new Date(NOW) }).run();
    await db.insert(authVerifications).values({ id: `v-${user}`, identifier: `${user}@example.com`, value: "x", expiresAt: new Date(NOW), updatedAt: new Date(NOW) }).run();
    await seedSession(db, user, `ps-${user}`);
    await db.insert(classes).values({ id: `class-${user}`, teacherUserId: user, name: `Class ${n}`, joinCode: `CODE${n}` }).run();
  }
  // Attempts: alice has a local file and a database blob; her guest identity has one too; bob has one.
  const attempts: Record<string, string> = {};
  for (const [key, user, provider] of [["a1", "alice", "local"], ["a2", "alice", "database"], ["g1", "guest-a", "local"], ["b1", "bob", "database"]] as const) {
    const id = await seedAttempt(db, { id: `00000000-0000-4000-8000-0000000000${key === "a1" ? "11" : key === "a2" ? "12" : key === "g1" ? "13" : "14"}`, userId: user, completedAt: NOW });
    attempts[key] = id;
    const storageKey = `audio/${key}.webm`;
    if (provider === "local") {
      fs.mkdirSync(path.join(audioDir, "audio"), { recursive: true });
      fs.writeFileSync(path.join(audioDir, storageKey), "webm");
    } else {
      await db.insert(recordingBlobs).values({ storageKey, data: Buffer.from("webm"), contentType: "audio/webm", sizeBytes: 4 }).run();
    }
    await db.insert(recordings).values({ id: `r-${key}`, attemptId: id, storageProvider: provider, storageKey, mimeType: "audio/webm", sizeBytes: 4, durationMs: 1000 }).run();
    await db.insert(transcripts).values({ id: `t-${key}`, attemptId: id, provider: "mock", model: "m", text: "hello" }).run();
    await db.insert(evaluations).values({
      id: `e-${key}`, attemptId: id, transcriptId: `t-${key}`, evaluatorVersion: "1", rubricVersion: "1", schemaVersion: 1, promptHash: "h",
      provider: "mock", model: "m", overallLevel: "B2", result: {},
    }).run();
    await db.insert(analyticsEvents).values({ id: `ev-${key}`, name: "attempt_completed", source: "server", occurredAt: NOW, userId: user, attemptId: id }).run();
  }
  await db.insert(analyticsEvents).values({ id: "ev-alice-only", name: "page", source: "client", occurredAt: NOW, userId: "alice" }).run();
  // Teacher view both ways: alice is in bob's class and rated by bob; bob is in alice's class and rated by alice.
  await db.insert(classMembers).values([
    { id: "m-alice", classId: "class-bob", studentUserId: "alice", shownName: "Alice", sharedAt: NOW, shareTextVersion: "1" },
    { id: "m-bob", classId: "class-alice", studentUserId: "bob", shownName: "Bob", sharedAt: NOW, shareTextVersion: "1" },
  ]).run();
  const rating = { agrees: true, appBand: 3, evaluatorVersion: "1", rubricVersion: "1", updatedAt: NOW };
  await db.insert(teacherRatings).values([
    { id: "tr-1", attemptId: attempts.a1, teacherUserId: "bob", classId: "class-bob", ...rating },
    { id: "tr-2", attemptId: attempts.b1, teacherUserId: "alice", classId: "class-alice", ...rating },
  ]).run();
  // Whole-mock levels (migration 0009), both ways: bob rated alice's mock, alice rated bob's.
  await db.insert(teacherMockRatings).values([
    { id: "tmr-1", sessionId: "ps-alice", teacherUserId: "bob", classId: "class-bob", agrees: false, teacherLevel: "B2", updatedAt: NOW },
    { id: "tmr-2", sessionId: "ps-bob", teacherUserId: "alice", classId: "class-alice", agrees: true, appLevel: "B1", updatedAt: NOW },
  ]).run();
  await db.insert(ratingPairs).values({ teacherBand: 3, appBand: 3, evaluatorVersion: "1", rubricVersion: "1", part: "2", month: "2026-10" }).run();
}

async function dump(db: Db): Promise<Record<string, unknown[]>> {
  const tables = (await db.$client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")).rows.map((r) => String(r.name));
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = (await db.$client.execute(`SELECT * FROM "${t}" ORDER BY rowid`)).rows.map((r) => {
      // Times the database fills in, and a test counter, differ between the two copies: not part of the comparison.
      const row: Record<string, unknown> = { ...r };
      for (const column of ["created_at", "updated_at", "attempt_number"]) delete row[column];
      return row;
    });
  return out;
}

const files = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).sort() : []);

function run(file: string, audioDir: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_PATH: file, AUDIO_STORAGE_DIR: audioDir, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" };
  delete env.VERCEL;
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT, ...args], { env, cwd: ROOT, encoding: "utf8", stdio: "pipe" }) };
  } catch (error) {
    const e = error as { status: number; stderr: string };
    return { code: e.status, out: e.stderr };
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-owner-delete-"));
});
afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("scripts/delete-account.mjs (the owner's deletion)", () => {
  it("removes exactly what Delete my account removes: every table and the audio folder end up the same", async () => {
    // Copy 1: the app's own deleteAccount.
    const appFile = path.join(dir, "app.db");
    const appAudio = path.join(dir, "app-audio");
    const appDb = await openDatabase(appFile);
    await seed(appDb, appAudio);
    setDbForTesting(appDb);
    setAudioStorageForTesting(new LocalAudioStorage(appAudio));
    await deleteAccount("alice");
    const expected = await dump(appDb);

    // Copy 2: the owner's script.
    const scriptFile = path.join(dir, "script.db");
    const scriptAudio = path.join(dir, "script-audio");
    const scriptDb = await openDatabase(scriptFile);
    await seed(scriptDb, scriptAudio);
    const before = await dump(scriptDb);
    scriptDb.$client.close();

    // Without --yes: a dry run that changes nothing.
    const dry = run(scriptFile, scriptAudio, "Alice@Example.com");
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/DRY RUN .* 3 attempt\(s\), 3 recording\(s\) \(2 file\(s\), 1 in the database\), 1 class\(es\) taught\. Nothing was deleted/);
    const afterDry = await openDatabase(scriptFile);
    expect(await dump(afterDry)).toEqual(before);
    afterDry.$client.close();
    expect(files(scriptAudio)).toEqual(["audio", "audio/a1.webm", "audio/g1.webm"]);

    expect(run(scriptFile, scriptAudio, "alice@example.com", "--yes").out).toMatch(/deleted the account and 3 attempt\(s\)/);
    const after = await openDatabase(scriptFile);
    expect(await dump(after)).toEqual(expected);
    expect(files(scriptAudio)).toEqual(files(appAudio));
    expect(files(scriptAudio)).toEqual(["audio"]);
    // Bob and the anonymous pair stay; nothing of alice or her guest identity is left.
    const left = JSON.stringify(expected);
    expect(left).toContain("bob@example.com");
    expect(left).not.toMatch(/alice|guest-a/);
    expect(expected.rating_pairs).toHaveLength(1);
    expect(expected.teacher_mock_ratings).toHaveLength(0); // both the one on her mock and the one she gave
    after.$client.close();
  });

  it("refuses bad input, unknown or anonymous accounts, and Vercel", async () => {
    const file = path.join(dir, "db.db");
    const db = await openDatabase(file);
    await seed(db, path.join(dir, "audio"));
    db.$client.close();
    for (const args of [[], ["a@b.c", "--force"], ["a@b.c", "b@c.d"]]) expect(run(file, dir, ...args).code, args.join(" ")).toBe(1);
    expect(run(file, dir, "nobody@example.com", "--yes").out).toMatch(/no registered account/);
    const env = { ...process.env, DATABASE_PATH: file, VERCEL: "1" };
    expect(() => execFileSync("node", [SCRIPT, "bob@example.com", "--yes"], { env, stdio: "pipe" })).toThrow();
    const check = await openDatabase(file);
    expect((await dump(check)).users).toHaveLength(3);
    check.$client.close();
  });

  it("every table is either deleted by the script or listed as holding nothing about a person", () => {
    const schema = fs.readFileSync(path.join(ROOT, "src/server/db/schema.ts"), "utf8");
    const tables = [...schema.matchAll(/sqliteTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    const script = fs.readFileSync(SCRIPT, "utf8");
    const handled = new Set([...script.matchAll(/DELETE FROM ([a-z_]+)/g)].map((m) => m[1]));
    const noPerson = ["speaking_tasks", "rating_pairs"];
    expect(tables.length).toBeGreaterThan(10);
    for (const t of tables) expect(handled.has(t) || noPerson.includes(t), `${t}: add it to scripts/delete-account.mjs (and deleteAccount)`).toBe(true);
  });
});
