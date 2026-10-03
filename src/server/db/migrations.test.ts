import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
import { getSpeakingTask } from "@/content/speaking";
import { findAttempt, findRecording, insertAttemptWithRecording, ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { MIGRATIONS_DIR, migrateDatabase, openDatabase, setDbForTesting } from "./client";
import * as schema from "./schema";
import { PASSWORD, signIn, signUp } from "../../../test/auth-helpers";
import { jar } from "../../../test/next-headers-mock";
import { getCurrentUser } from "@/server/identity/current-user";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";

/**
 * Migration harness. Proves that the migration history is internally consistent, that a fresh database
 * can be built from it, that a database created by an EARLIER release upgrades with its data intact,
 * and that the application can read and write after migrating. Never edit or delete old migrations:
 * add a new one and extend these tests.
 */

const tempDirs: string[] = [];
afterEach(() => {
  setDbForTesting(undefined);
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-migrations-"));
  tempDirs.push(dir);
  return dir;
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}
const journal = (): { entries: JournalEntry[] } =>
  JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"));

/** A copy of the migration folder containing only the first `count` migrations: the schema of an older release. */
function migrationsUpTo(count: number): string {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "meta"));
  const entries = journal().entries.slice(0, count);
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ version: "7", dialect: "sqlite", entries }));
  for (const entry of entries) fs.copyFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  return dir;
}

function openRaw(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const names = (rows: unknown[]) => (rows as { name: string }[]).map((r) => r.name).sort();

describe("migration history", () => {
  it("is consistent: sequential, unique, every file and snapshot present, nothing stray", () => {
    const { entries } = journal();
    expect(entries.length).toBeGreaterThanOrEqual(3);
    entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(entry.tag.startsWith(String(i).padStart(4, "0") + "_")).toBe(true);
      expect(fs.existsSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`))).toBe(true);
      expect(fs.existsSync(path.join(MIGRATIONS_DIR, `meta/${String(i).padStart(4, "0")}_snapshot.json`))).toBe(true);
      if (i > 0) expect(entry.when).toBeGreaterThan(entries[i - 1].when);
    });
    const sqlFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(sqlFiles).toEqual(entries.map((e) => `${e.tag}.sql`));
  });

  it("keeps the original migrations unchanged (history is append-only)", () => {
    // If one of these fails, an applied migration was edited: add a new migration instead.
    const first = fs.readFileSync(path.join(MIGRATIONS_DIR, "0000_initial.sql"), "utf8");
    expect(first).toContain("CREATE TABLE `speaking_attempts`");
    expect(first).not.toContain("session_id");
    const second = fs.readFileSync(path.join(MIGRATIONS_DIR, "0001_stage2_quality_observability.sql"), "utf8");
    expect(second).toContain("ALTER TABLE `evaluations` ADD `model_config` text");
  });
});

describe("fresh database", () => {
  it("builds the full schema from migrations, with foreign keys enforced afterwards", () => {
    const db = openDatabase(":memory:");
    const sqlite = (db as unknown as { $client: Database.Database }).$client;
    expect(names(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'").all())).toEqual([
      "analytics_events",
      "auth_accounts",
      "auth_sessions",
      "auth_verifications",
      "evaluations",
      "practice_sessions",
      "recordings",
      "speaking_attempts",
      "speaking_tasks",
      "transcripts",
      "users",
    ]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);

    const attemptFks = sqlite.pragma("foreign_key_list(speaking_attempts)") as { table: string; from: string }[];
    expect(attemptFks.map((fk) => `${fk.from}→${fk.table}`).sort()).toEqual(
      ["previous_attempt_id→speaking_attempts", "session_id→practice_sessions", "task_id→speaking_tasks", "task_version→speaking_tasks", "user_id→users"].sort(),
    );
    expect((sqlite.pragma("foreign_key_list(users)") as { from: string }[]).map((fk) => fk.from)).toEqual(["merged_into_user_id"]);
    expect(names(sqlite.pragma("index_list(speaking_attempts)") as unknown[])).toEqual(
      expect.arrayContaining([
        "speaking_attempts_user_task_number_uq",
        "speaking_attempts_user_task_idx",
        "speaking_attempts_user_created_idx",
        "speaking_attempts_created_idx",
      ]),
    );
    expect(names(sqlite.pragma("table_info(analytics_events)") as unknown[])).toContain("session_id");
  });

  it("rejects dangling references once migrated", () => {
    const db = openDatabase(":memory:");
    const sqlite = (db as unknown as { $client: Database.Database }).$client;
    expect(() =>
      sqlite
        .prepare("INSERT INTO speaking_attempts (id,user_id,task_id,task_version,attempt_number,status,updated_at) VALUES ('a','nobody','t',1,1,'uploaded','x')")
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("is idempotent: migrating twice changes nothing", () => {
    const file = path.join(tempDir(), "db.sqlite");
    const { sqlite, db } = openRaw(file);
    migrateDatabase(sqlite, db);
    const before = sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number };
    migrateDatabase(sqlite, db);
    const after = sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number };
    expect(after.n).toBe(before.n);
    expect(after.n).toBe(journal().entries.length);
  });
});

describe("upgrading a database created by an earlier release", () => {
  /** Rows as the pre-Stage-3 application wrote them (migrations 0000 and 0001 only). */
  function seedOldDatabase(file: string) {
    const { sqlite, db } = openRaw(file);
    migrateDatabase(sqlite, db, migrationsUpTo(2));
    expect(names(sqlite.pragma("table_info(speaking_attempts)") as unknown[])).not.toContain("session_id");

    const content = JSON.stringify({ id: "b2-part2-technology-young-people", version: 1 });
    sqlite.exec(`
      INSERT INTO users (id) VALUES ('u1'), ('u2');
      INSERT INTO speaking_tasks (id, version, level, part, title, content) VALUES ('b2-part2-technology-young-people', 1, 'B2', 2, 'Technology', '${content}');
      INSERT INTO speaking_attempts (id, user_id, task_id, task_version, attempt_number, previous_attempt_id, status, updated_at, created_at, retry_focus, metrics, processing_runs) VALUES
        ('a1', 'u1', 'b2-part2-technology-young-people', 1, 1, NULL, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL, '{"wordCount":120}', 1),
        ('a2', 'u1', 'b2-part2-technology-young-people', 1, 2, 'a1', 'completed', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '[{"objective":"x"}]', NULL, 2),
        ('a3', 'u2', 'b2-part2-technology-young-people', 1, 1, 'does-not-exist', 'failed', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z', NULL, NULL, 1);
      INSERT INTO recordings (id, attempt_id, storage_provider, storage_key, mime_type, size_bytes, duration_ms) VALUES ('r1', 'a1', 'local', 'speaking/u1/a1.webm', 'audio/webm', 1000, 60000);
      INSERT INTO transcripts (id, attempt_id, provider, model, text) VALUES ('t1', 'a1', 'openai', 'm', 'hello world');
      INSERT INTO evaluations (id, attempt_id, transcript_id, evaluator_version, rubric_version, schema_version, prompt_hash, provider, model, overall_level, result)
        VALUES ('e1', 'a1', 't1', 'speaking-evaluator/2.4.0', 'b2-speaking-rubric/1.0.0', 2, 'abc', 'gemini', 'gemini-3.8-flash', 'B2', '{}');
      INSERT INTO analytics_events (id, name, source, user_id, occurred_at) VALUES ('ev1', 'practice_opened', 'client', 'u1', '2026-01-01T00:00:00.000Z');
    `);
    return { sqlite, db };
  }

  it("keeps every row, repairs the dangling retry link, and leaves no foreign key violation", () => {
    const { sqlite, db } = seedOldDatabase(path.join(tempDir(), "old.sqlite"));

    migrateDatabase(sqlite, db); // the real, full migration set

    const attempts = sqlite.prepare("SELECT * FROM speaking_attempts ORDER BY id").all() as Record<string, unknown>[];
    expect(attempts.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(attempts[0]).toMatchObject({ user_id: "u1", attempt_number: 1, status: "completed", metrics: '{"wordCount":120}', processing_runs: 1, session_id: null });
    expect(attempts[1]).toMatchObject({ previous_attempt_id: "a1", retry_focus: '[{"objective":"x"}]', processing_runs: 2, attempt_number: 2 });
    expect(attempts[2]).toMatchObject({ previous_attempt_id: null, status: "failed" }); // dangling link dropped, attempt kept

    // Child rows still resolve through the rebuilt table.
    expect(sqlite.prepare("SELECT count(*) AS n FROM recordings r JOIN speaking_attempts a ON a.id = r.attempt_id").get()).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM evaluations e JOIN transcripts t ON t.id = e.transcript_id JOIN speaking_attempts a ON a.id = e.attempt_id").get()).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT session_id, merged FROM (SELECT session_id, NULL AS merged FROM analytics_events)").get()).toEqual({ session_id: null, merged: null });
    expect(sqlite.prepare("SELECT merged_into_user_id AS m FROM users WHERE id='u1'").get()).toEqual({ m: null });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);

    // The unique numbering rule survived the rebuild.
    sqlite.pragma("foreign_keys = ON");
    expect(() =>
      sqlite
        .prepare("INSERT INTO speaking_attempts (id,user_id,task_id,task_version,attempt_number,status,updated_at) VALUES ('dup','u1','b2-part2-technology-young-people',1,1,'uploaded','x')")
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("lets the application read and write the important entities afterwards", () => {
    const file = path.join(tempDir(), "old.sqlite");
    const { sqlite, db } = seedOldDatabase(file);
    migrateDatabase(sqlite, db);
    sqlite.pragma("foreign_keys = ON");
    setDbForTesting(db);

    // Read an attempt written by the old release.
    expect(findAttempt("a2")).toMatchObject({ id: "a2", previousAttemptId: "a1", sessionId: null });
    expect(findRecording("a1")).toMatchObject({ storageKey: "speaking/u1/a1.webm" });

    // Write a new one through the repository (a retry of the old attempt).
    const task = getSpeakingTask("b2-part2-technology-young-people")!;
    ensureTaskSnapshot(task);
    const created = insertAttemptWithRecording({
      attemptId: "11111111-1111-4111-8111-111111111111",
      userId: "u1",
      sessionId: null,
      task,
      previousAttemptId: "a2",
      retryFocus: null,
      recording: { storageProvider: "local", storageKey: "speaking/u1/new.webm", mimeType: "audio/webm", sizeBytes: 10, durationMs: 1000 },
    });
    expect(created.attemptNumber).toBe(3);
    expect(created.previousAttemptId).toBe("a2");
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("fails loudly if a migration would leave a dangling reference", () => {
    const file = path.join(tempDir(), "bad.sqlite");
    const { sqlite, db } = openRaw(file);
    migrateDatabase(sqlite, db, migrationsUpTo(2));
    // An attempt for a task version with no snapshot cannot satisfy the new composite foreign key.
    sqlite.exec(`
      INSERT INTO users (id) VALUES ('u1');
      INSERT INTO speaking_attempts (id, user_id, task_id, task_version, attempt_number, status, updated_at) VALUES ('a1','u1','ghost-task',1,1,'completed','x');
    `);
    expect(() => migrateDatabase(sqlite, db)).toThrow(/foreign key violation/i);
  });
});

describe("Stage 4 (authentication) migration", () => {
  const ANON = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

  it("adds the account tables, the users columns and the email uniqueness rule", () => {
    const db = openDatabase(":memory:");
    const sqlite = (db as unknown as { $client: Database.Database }).$client;
    expect(names(sqlite.pragma("table_info(users)") as unknown[])).toEqual(
      expect.arrayContaining(["email", "name", "image", "email_verified", "updated_at", "merged_into_user_id", "kind"]),
    );
    for (const table of ["auth_sessions", "auth_accounts"]) {
      const fks = sqlite.pragma(`foreign_key_list(${table})`) as { from: string; table: string }[];
      expect(fks.map((fk) => `${fk.from}→${fk.table}`)).toEqual(["user_id→users"]);
    }
    expect(names(sqlite.pragma("index_list(users)") as unknown[])).toContain("users_email_uq");
    expect(names(sqlite.pragma("index_list(auth_sessions)") as unknown[])).toContain("auth_sessions_token_uq");

    // Two accounts cannot share an email; any number of anonymous users (NULL email) can coexist.
    sqlite.exec("INSERT INTO users (id) VALUES ('x1'), ('x2'), ('x3')");
    sqlite.exec("UPDATE users SET email = 'a@example.com', kind = 'registered' WHERE id = 'x1'");
    expect(() => sqlite.exec("UPDATE users SET email = 'a@example.com', kind = 'registered' WHERE id = 'x2'")).toThrow(/UNIQUE/);
    // A session needs a real user.
    expect(() => sqlite.exec("INSERT INTO auth_sessions (id,user_id,token,expires_at,updated_at) VALUES ('s','ghost','t','x','x')")).toThrow(/FOREIGN KEY/);
  });

  it("upgrades a database from the previous schema with anonymous users and data, then converts them to an account", async () => {
    const { sqlite, db } = openRaw(path.join(tempDir(), "previous.sqlite"));
    migrateDatabase(sqlite, db, migrationsUpTo(3)); // the schema before authentication existed
    expect(names(sqlite.pragma("table_info(users)") as unknown[])).not.toContain("email");
    const content = JSON.stringify({ id: "b2-part2-technology-young-people", version: 1 });
    sqlite.exec(`
      INSERT INTO users (id) VALUES ('${ANON}'), ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
      INSERT INTO practice_sessions (id, user_id) VALUES ('5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', '${ANON}');
      INSERT INTO speaking_tasks (id, version, level, part, title, content) VALUES ('b2-part2-technology-young-people', 1, 'B2', 2, 'T', '${content}');
      INSERT INTO speaking_attempts (id, user_id, session_id, task_id, task_version, attempt_number, status, updated_at) VALUES
        ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', '${ANON}', '5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', 'b2-part2-technology-young-people', 1, 1, 'completed', 'x');
      INSERT INTO analytics_events (id, name, source, user_id, session_id, occurred_at) VALUES ('ev1', 'practice_opened', 'client', '${ANON}', '5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', '2026-01-01T00:00:00.000Z');
    `);

    migrateDatabase(sqlite, db); // the real, full set
    sqlite.pragma("foreign_keys = ON");

    const users = sqlite.prepare("SELECT id, kind, email, name, email_verified, merged_into_user_id FROM users ORDER BY id").all();
    expect(users).toEqual([
      { id: ANON, kind: "anonymous", email: null, name: null, email_verified: 0, merged_into_user_id: null },
      { id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2", kind: "anonymous", email: null, name: null, email_verified: 0, merged_into_user_id: null },
    ]);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);

    // Now authenticate on the upgraded database and attach the existing anonymous history.
    setDbForTesting(db);
    resetAuthLimitersForTesting();
    jar.clear();
    jar.set("cefro_uid", ANON);
    expect((await signUp("upgraded@example.com", PASSWORD, { ip: "10.9.0.1" })).status).toBe(200);
    const account = await getCurrentUser();
    expect(account).toMatchObject({ kind: "authenticated", email: "upgraded@example.com" });
    expect(sqlite.prepare("SELECT user_id FROM speaking_attempts WHERE id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'").get()).toEqual({ user_id: account.userId });
    expect(sqlite.prepare("SELECT user_id FROM practice_sessions").get()).toEqual({ user_id: account.userId });
    expect(sqlite.prepare("SELECT user_id FROM analytics_events WHERE id = 'ev1'").get()).toEqual({ user_id: account.userId });
    expect(sqlite.prepare("SELECT merged_into_user_id AS m FROM users WHERE id = ?").get(ANON)).toEqual({ m: account.userId });

    // A second sign-in with the same stale anonymous cookie changes nothing (idempotent).
    jar.clear();
    jar.set("cefro_uid", ANON);
    expect((await signIn("upgraded@example.com", PASSWORD, { ip: "10.9.0.2" })).status).toBe(200);
    expect(sqlite.prepare("SELECT count(*) AS n FROM speaking_attempts").get()).toEqual({ n: 1 });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  function folderWithBrokenMigration() {
    const dir = tempDir();
    fs.cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const entries = journal().entries;
    const bad = { idx: entries.length, version: "6", when: entries.at(-1)!.when + 1000, tag: `${String(entries.length).padStart(4, "0")}_deliberately_broken`, breakpoints: true };
    fs.writeFileSync(path.join(dir, `${bad.tag}.sql`), "CREATE TABLE `half_done` (`id` text);--> statement-breakpoint\nTHIS IS NOT SQL;");
    fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ version: "7", dialect: "sqlite", entries: [...entries, bad] }));
    return { dir, applied: entries.length };
  }

  it("rolls a failing migration back completely: an existing database keeps its schema and its data", () => {
    const { dir, applied } = folderWithBrokenMigration();
    const { sqlite, db } = openRaw(path.join(tempDir(), "failing.sqlite"));
    migrateDatabase(sqlite, db); // the real set is applied
    sqlite.exec("INSERT INTO users (id, kind, email) VALUES ('keep-me', 'registered', 'keep@example.com')");

    expect(() => migrateDatabase(sqlite, db, dir)).toThrow();
    expect(names(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())).not.toContain("half_done"); // its first statement was undone too
    expect((sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n).toBe(applied);
    expect(sqlite.prepare("SELECT email FROM users WHERE id = 'keep-me'").get()).toEqual({ email: "keep@example.com" });
  });

  it("applies a batch of pending migrations all-or-nothing (a failure in the last one leaves a fresh database empty, not half-built)", () => {
    const { dir } = folderWithBrokenMigration();
    const { sqlite, db } = openRaw(path.join(tempDir(), "fresh-failing.sqlite"));
    expect(() => migrateDatabase(sqlite, db, dir)).toThrow();
    const tables = names(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
    expect(tables).not.toContain("half_done");
    expect(tables).not.toContain("users"); // nothing from the earlier migrations in the same batch survived
  });
});
