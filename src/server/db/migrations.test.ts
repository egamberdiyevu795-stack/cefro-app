import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client, ResultSet } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
import { getSpeakingTask } from "@/content/speaking";
import { findAttempt, findRecording, insertAttemptWithRecording, ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { MIGRATIONS_DIR, createDatabase, migrateDatabase, openDatabase, setDbForTesting, type Db } from "./client";
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

/** A database that is NOT migrated yet, plus its raw libSQL client for direct SQL. */
async function openRaw(file: string): Promise<{ client: Client; db: Db }> {
  const db = await createDatabase({ kind: "file", path: file });
  return { client: db.$client, db };
}

/** Rows as plain objects (the client's Row objects also carry numeric indexes). */
const plain = (result: ResultSet): Record<string, unknown>[] => result.rows.map((row) => Object.fromEntries(result.columns.map((column) => [column, row[column]])));
const query = async (client: Client, sql: string, args: (string | number)[] = []) => plain(await client.execute({ sql, args }));
const pragma = (client: Client, text: string) => query(client, `PRAGMA ${text}`);
const count = async (client: Client, table: string) => Number((await query(client, `SELECT count(*) AS n FROM ${table}`))[0].n);

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
  it("builds the full schema from migrations, with foreign keys enforced afterwards", async () => {
    const db = await openDatabase(":memory:");
    const client = db.$client;
    expect(names(await query(client, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'"))).toEqual([
      "analytics_events",
      "auth_accounts",
      "auth_sessions",
      "auth_verifications",
      "class_members",
      "classes",
      "evaluations",
      "practice_sessions",
      "rating_pairs",
      "recording_blobs",
      "recordings",
      "speaking_attempts",
      "speaking_tasks",
      "teacher_mock_ratings",
      "teacher_ratings",
      "transcripts",
      "users",
    ]);
    expect((await pragma(client, "foreign_keys"))[0]).toEqual({ foreign_keys: 1 });

    const attemptFks = (await pragma(client, "foreign_key_list(speaking_attempts)")) as { table: string; from: string }[];
    expect(attemptFks.map((fk) => `${fk.from}→${fk.table}`).sort()).toEqual(
      ["previous_attempt_id→speaking_attempts", "session_id→practice_sessions", "task_id→speaking_tasks", "task_version→speaking_tasks", "user_id→users"].sort(),
    );
    expect(((await pragma(client, "foreign_key_list(users)")) as { from: string }[]).map((fk) => fk.from)).toEqual(["merged_into_user_id"]);
    expect(names(await pragma(client, "index_list(speaking_attempts)"))).toEqual(
      expect.arrayContaining([
        "speaking_attempts_user_task_number_uq",
        "speaking_attempts_user_task_idx",
        "speaking_attempts_user_created_idx",
        "speaking_attempts_created_idx",
      ]),
    );
    expect(names(await pragma(client, "table_info(analytics_events)"))).toContain("session_id");
  });

  it("rejects dangling references once migrated", async () => {
    const db = await openDatabase(":memory:");
    await expect(
      db.$client.execute("INSERT INTO speaking_attempts (id,user_id,task_id,task_version,attempt_number,status,updated_at) VALUES ('a','nobody','t',1,1,'uploaded','x')"),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("is idempotent: migrating twice changes nothing", async () => {
    const file = path.join(tempDir(), "db.sqlite");
    const { client, db } = await openRaw(file);
    await migrateDatabase(db);
    const before = await count(client, "__drizzle_migrations");
    await migrateDatabase(db);
    const after = await count(client, "__drizzle_migrations");
    expect(after).toBe(before);
    expect(after).toBe(journal().entries.length);
  });

  it("the recording_blobs migration is additive: it only creates the table", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0004_recording_blobs.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE `recording_blobs`");
    expect(sql).not.toMatch(/DROP|ALTER TABLE|DELETE|UPDATE/i);
  });
});

describe("exam date migration (0005)", () => {
  it("only adds two nullable columns to users", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0005_exam_date.sql"), "utf8");
    expect(sql).toContain("ALTER TABLE `users` ADD `exam_date` text;");
    expect(sql).toContain("ALTER TABLE `users` ADD `exam_date_skipped_at` text;");
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE|NOT NULL|CREATE/i);
  });
});

describe("teacher migration (0006)", () => {
  it("is additive: four new tables and one users column with a default; nothing dropped, deleted or rewritten", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0006_teachers.sql"), "utf8");
    for (const table of ["classes", "class_members", "teacher_ratings", "rating_pairs"]) expect(sql).toContain(`CREATE TABLE \`${table}\``);
    expect(sql).toContain("ALTER TABLE `users` ADD `role` text DEFAULT 'student' NOT NULL;");
    expect(sql).not.toMatch(/DROP |DELETE FROM|UPDATE `|__new_|RENAME/i);
  });

  it("upgrades a 0005 database: every existing user becomes a student, and the anonymous pairs hold no id", async () => {
    const dir = tempDir();
    const file = path.join(dir, "old.db");
    const old = await openRaw(file);
    await migrateDatabase(old.db, migrationsUpTo(6));
    await old.client.execute("INSERT INTO users (id, kind) VALUES ('u1', 'anonymous')");
    old.client.close();
    const { client, db } = await openRaw(file);
    await migrateDatabase(db);
    expect(await query(client, "SELECT role FROM users")).toEqual([{ role: "student" }]);
    const pairColumns = names(await pragma(client, "table_info(rating_pairs)"));
    expect(pairColumns).toEqual(["app_band", "evaluator_version", "month", "part", "rubric_version", "teacher_band"]);
    // One open membership per class and student: a second open row is refused, an ended one is fine.
    await client.execute("UPDATE users SET kind = 'registered' WHERE id = 'u1'");
    await client.execute("INSERT INTO classes (id, teacher_user_id, name, join_code) VALUES ('c1', 'u1', 'B', 'K7M4QD')");
    const member = (id: string, ended: string | null) =>
      client.execute({ sql: "INSERT INTO class_members (id, class_id, student_user_id, shown_name, shared_at, share_text_version, ended_at) VALUES (?, 'c1', 'u1', 'A', 'x', 'v', ?)", args: [id, ended] });
    await member("m1", "2026-11-01");
    await member("m2", null);
    await expect(member("m3", null)).rejects.toThrow();
    client.close();
  });
});

describe("pilot consent migration (0007)", () => {
  it("is additive: four users columns (nullable or defaulted) and one nullable recordings column", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0007_pilot_consent.sql"), "utf8");
    expect(sql).toContain("ALTER TABLE `recordings` ADD `audio_deleted_at` text;");
    expect(sql).toContain("ALTER TABLE `users` ADD `consent_status` text;");
    expect(sql).toContain("ALTER TABLE `users` ADD `consent_at` text;");
    expect(sql).toContain("ALTER TABLE `users` ADD `consent_notice_version` text;");
    expect(sql).toContain("ALTER TABLE `users` ADD `consent_teacher_sharing` integer DEFAULT false NOT NULL;");
    expect(sql).not.toMatch(/DROP |DELETE FROM|UPDATE `|__new_|RENAME|CREATE/i);
  });

  it("upgrades a 0006 database: existing users have no consent, existing recordings keep their audio", async () => {
    const file = path.join(tempDir(), "old.db");
    const old = await openRaw(file);
    await migrateDatabase(old.db, migrationsUpTo(7));
    await old.client.execute("INSERT INTO users (id, kind) VALUES ('u1', 'anonymous')");
    old.client.close();
    const { client, db } = await openRaw(file);
    await migrateDatabase(db);
    expect(await query(client, "SELECT consent_status, consent_at, consent_notice_version, consent_teacher_sharing FROM users")).toEqual([
      { consent_status: null, consent_at: null, consent_notice_version: null, consent_teacher_sharing: 0 },
    ]);
    expect(names(await pragma(client, "table_info(recordings)"))).toContain("audio_deleted_at");
    client.close();
  });
});

describe("full mock migration (0008)", () => {
  it("is additive: two nullable practice_sessions columns and one index, nothing dropped or rewritten", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0008_full_mock.sql"), "utf8");
    expect(sql).toContain("ALTER TABLE `practice_sessions` ADD `status` text;");
    expect(sql).toContain("ALTER TABLE `practice_sessions` ADD `finished_at` text;");
    expect(sql).toContain("CREATE INDEX `practice_sessions_user_kind_idx`");
    expect(sql).not.toMatch(/DROP |DELETE FROM|UPDATE `|__new_|RENAME|NOT NULL/i);
  });

  it("upgrades a 0007 database: existing sessions stay single_task with no status, and a full_mock row can be written", async () => {
    const file = path.join(tempDir(), "old.db");
    const old = await openRaw(file);
    await migrateDatabase(old.db, migrationsUpTo(8));
    await old.client.executeMultiple("INSERT INTO users (id, kind) VALUES ('u1', 'anonymous'); INSERT INTO practice_sessions (id, user_id) VALUES ('s1', 'u1');");
    old.client.close();
    const { client, db } = await openRaw(file);
    await migrateDatabase(db);
    expect(await query(client, "SELECT id, kind, status, finished_at FROM practice_sessions")).toEqual([{ id: "s1", kind: "single_task", status: null, finished_at: null }]);
    await client.execute("INSERT INTO practice_sessions (id, user_id, kind, status) VALUES ('m1', 'u1', 'full_mock', 'in_progress')");
    expect(await query(client, "SELECT kind, status FROM practice_sessions WHERE id = 'm1'")).toEqual([{ kind: "full_mock", status: "in_progress" }]);
    client.close();
  });
});

describe("teacher v1 migration (0009)", () => {
  it("is additive: one new table (with its two indexes) and two nullable class_members columns, nothing dropped or rewritten", () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "0009_teacher_v1.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE `teacher_mock_ratings`");
    expect(sql).toContain("ALTER TABLE `class_members` ADD `all_parts_from` text;");
    expect(sql).toContain("ALTER TABLE `class_members` ADD `upgrade_declined_at` text;");
    expect(sql.replace(/^--.*$/gm, "")).not.toMatch(/DROP |DELETE FROM|UPDATE `|__new_|RENAME/i);
    // The only NOT NULL columns are the new table's own.
    expect(sql.replace(/CREATE TABLE `teacher_mock_ratings` \([\s\S]*?\n\);/, "")).not.toMatch(/NOT NULL/i);
  });

  it("upgrades a 0008 database: old memberships keep their wording and are not upgraded, and a mock rating can be written", async () => {
    const file = path.join(tempDir(), "old.db");
    const old = await openRaw(file);
    await migrateDatabase(old.db, migrationsUpTo(9));
    await old.client.executeMultiple(`
      INSERT INTO users (id, kind, role) VALUES ('t', 'registered', 'teacher'), ('s', 'registered', 'student');
      INSERT INTO classes (id, teacher_user_id, name, join_code) VALUES ('c', 't', 'Group B', 'ABC234');
      INSERT INTO class_members (id, class_id, student_user_id, shown_name, shared_at, share_text_version) VALUES ('m', 'c', 's', 'Ali', '2026-11-07T10:00:00.000Z', '2026-11-07');
      INSERT INTO practice_sessions (id, user_id, kind, status) VALUES ('mock', 's', 'full_mock', 'finished');
    `);
    old.client.close();
    const { client, db } = await openRaw(file);
    await migrateDatabase(db);
    expect(await query(client, "SELECT share_text_version, all_parts_from, upgrade_declined_at FROM class_members")).toEqual([{ share_text_version: "2026-11-07", all_parts_from: null, upgrade_declined_at: null }]);
    await client.execute("INSERT INTO teacher_mock_ratings (id, session_id, teacher_user_id, class_id, agrees, teacher_level, updated_at) VALUES ('r', 'mock', 't', 'c', 0, 'B2', '2026-11-08T10:00:00.000Z')");
    await expect(client.execute("INSERT INTO teacher_mock_ratings (id, session_id, teacher_user_id, class_id, agrees, updated_at) VALUES ('r2', 'mock', 't', 'c', 1, 'x')")).rejects.toThrow(); // one per mock and teacher
    expect(await query(client, "SELECT teacher_level FROM teacher_mock_ratings")).toEqual([{ teacher_level: "B2" }]);
    client.close();
  });
});

describe("upgrading a database created by an earlier release", () => {
  /** Rows as the pre-Stage-3 application wrote them (migrations 0000 and 0001 only). */
  async function seedOldDatabase(file: string) {
    const { client, db } = await openRaw(file);
    await migrateDatabase(db, migrationsUpTo(2));
    expect(names(await pragma(client, "table_info(speaking_attempts)"))).not.toContain("session_id");

    const content = JSON.stringify({ id: "b2-part2-advice-from-someone", version: 1 });
    await client.executeMultiple(`
      INSERT INTO users (id) VALUES ('u1'), ('u2');
      INSERT INTO speaking_tasks (id, version, level, part, title, content) VALUES ('b2-part2-advice-from-someone', 1, 'B2', 2, 'Technology', '${content}');
      INSERT INTO speaking_attempts (id, user_id, task_id, task_version, attempt_number, previous_attempt_id, status, updated_at, created_at, retry_focus, metrics, processing_runs) VALUES
        ('a1', 'u1', 'b2-part2-advice-from-someone', 1, 1, NULL, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL, '{"wordCount":120}', 1),
        ('a2', 'u1', 'b2-part2-advice-from-someone', 1, 2, 'a1', 'completed', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '[{"objective":"x"}]', NULL, 2),
        ('a3', 'u2', 'b2-part2-advice-from-someone', 1, 1, 'does-not-exist', 'failed', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z', NULL, NULL, 1);
      INSERT INTO recordings (id, attempt_id, storage_provider, storage_key, mime_type, size_bytes, duration_ms) VALUES ('r1', 'a1', 'local', 'speaking/u1/a1.webm', 'audio/webm', 1000, 60000);
      INSERT INTO transcripts (id, attempt_id, provider, model, text) VALUES ('t1', 'a1', 'openai', 'm', 'hello world');
      INSERT INTO evaluations (id, attempt_id, transcript_id, evaluator_version, rubric_version, schema_version, prompt_hash, provider, model, overall_level, result)
        VALUES ('e1', 'a1', 't1', 'speaking-evaluator/2.4.0', 'b2-speaking-rubric/1.0.0', 2, 'abc', 'gemini', 'gemini-3.8-flash', 'B2', '{}');
      INSERT INTO analytics_events (id, name, source, user_id, occurred_at) VALUES ('ev1', 'practice_opened', 'client', 'u1', '2026-01-01T00:00:00.000Z');
    `);
    return { client, db };
  }

  it("keeps every row, repairs the dangling retry link, and leaves no foreign key violation", async () => {
    const { client, db } = await seedOldDatabase(path.join(tempDir(), "old.sqlite"));

    await migrateDatabase(db); // the real, full migration set

    const attempts = await query(client, "SELECT * FROM speaking_attempts ORDER BY id");
    expect(attempts.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(attempts[0]).toMatchObject({ user_id: "u1", attempt_number: 1, status: "completed", metrics: '{"wordCount":120}', processing_runs: 1, session_id: null });
    expect(attempts[1]).toMatchObject({ previous_attempt_id: "a1", retry_focus: '[{"objective":"x"}]', processing_runs: 2, attempt_number: 2 });
    expect(attempts[2]).toMatchObject({ previous_attempt_id: null, status: "failed" }); // dangling link dropped, attempt kept

    // Child rows still resolve through the rebuilt table.
    expect(await query(client, "SELECT count(*) AS n FROM recordings r JOIN speaking_attempts a ON a.id = r.attempt_id")).toEqual([{ n: 1 }]);
    expect(await query(client, "SELECT count(*) AS n FROM evaluations e JOIN transcripts t ON t.id = e.transcript_id JOIN speaking_attempts a ON a.id = e.attempt_id")).toEqual([{ n: 1 }]);
    expect(await query(client, "SELECT session_id, merged FROM (SELECT session_id, NULL AS merged FROM analytics_events)")).toEqual([{ session_id: null, merged: null }]);
    expect(await query(client, "SELECT merged_into_user_id AS m FROM users WHERE id='u1'")).toEqual([{ m: null }]);
    expect(await pragma(client, "foreign_key_check")).toEqual([]);

    // The unique numbering rule survived the rebuild.
    await client.execute("PRAGMA foreign_keys = ON");
    await expect(
      client.execute("INSERT INTO speaking_attempts (id,user_id,task_id,task_version,attempt_number,status,updated_at) VALUES ('dup','u1','b2-part2-advice-from-someone',1,1,'uploaded','x')"),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("lets the application read and write the important entities afterwards", async () => {
    const file = path.join(tempDir(), "old.sqlite");
    const { client, db } = await seedOldDatabase(file);
    await migrateDatabase(db);
    await client.execute("PRAGMA foreign_keys = ON");
    setDbForTesting(db);

    // Read an attempt written by the old release.
    expect(await findAttempt("a2")).toMatchObject({ id: "a2", previousAttemptId: "a1", sessionId: null });
    expect(await findRecording("a1")).toMatchObject({ storageKey: "speaking/u1/a1.webm" });

    // Write a new one through the repository (a retry of the old attempt).
    const task = getSpeakingTask("b2-part2-advice-from-someone")!;
    await ensureTaskSnapshot(task);
    const created = await insertAttemptWithRecording({
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
    expect(await pragma(client, "foreign_key_check")).toEqual([]);
  });

  it("fails loudly if a migration would leave a dangling reference", async () => {
    const file = path.join(tempDir(), "bad.sqlite");
    const { client, db } = await openRaw(file);
    await migrateDatabase(db, migrationsUpTo(2));
    // An attempt for a task version with no snapshot cannot satisfy the new composite foreign key.
    await client.executeMultiple(`
      INSERT INTO users (id) VALUES ('u1');
      INSERT INTO speaking_attempts (id, user_id, task_id, task_version, attempt_number, status, updated_at) VALUES ('a1','u1','ghost-task',1,1,'completed','x');
    `);
    await expect(migrateDatabase(db)).rejects.toThrow(/foreign key violation/i);
  });
});

describe("Stage 4 (authentication) migration", () => {
  const ANON = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

  it("adds the account tables, the users columns and the email uniqueness rule", async () => {
    const db = await openDatabase(":memory:");
    const client = db.$client;
    expect(names(await pragma(client, "table_info(users)"))).toEqual(
      expect.arrayContaining(["email", "name", "image", "email_verified", "updated_at", "merged_into_user_id", "kind"]),
    );
    for (const table of ["auth_sessions", "auth_accounts"]) {
      const fks = (await pragma(client, `foreign_key_list(${table})`)) as { from: string; table: string }[];
      expect(fks.map((fk) => `${fk.from}→${fk.table}`)).toEqual(["user_id→users"]);
    }
    expect(names(await pragma(client, "index_list(users)"))).toContain("users_email_uq");
    expect(names(await pragma(client, "index_list(auth_sessions)"))).toContain("auth_sessions_token_uq");

    // Two accounts cannot share an email; any number of anonymous users (NULL email) can coexist.
    await client.execute("INSERT INTO users (id) VALUES ('x1'), ('x2'), ('x3')");
    await client.execute("UPDATE users SET email = 'a@example.com', kind = 'registered' WHERE id = 'x1'");
    await expect(client.execute("UPDATE users SET email = 'a@example.com', kind = 'registered' WHERE id = 'x2'")).rejects.toThrow(/UNIQUE/);
    // A session needs a real user.
    await expect(client.execute("INSERT INTO auth_sessions (id,user_id,token,expires_at,updated_at) VALUES ('s','ghost','t','x','x')")).rejects.toThrow(/FOREIGN KEY/);
  });

  it("upgrades a database from the previous schema with anonymous users and data, then converts them to an account", async () => {
    const { client, db } = await openRaw(path.join(tempDir(), "previous.sqlite"));
    await migrateDatabase(db, migrationsUpTo(3)); // the schema before authentication existed
    expect(names(await pragma(client, "table_info(users)"))).not.toContain("email");
    const content = JSON.stringify({ id: "b2-part2-advice-from-someone", version: 1 });
    await client.executeMultiple(`
      INSERT INTO users (id) VALUES ('${ANON}'), ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2');
      INSERT INTO practice_sessions (id, user_id) VALUES ('5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', '${ANON}');
      INSERT INTO speaking_tasks (id, version, level, part, title, content) VALUES ('b2-part2-advice-from-someone', 1, 'B2', 2, 'T', '${content}');
      INSERT INTO speaking_attempts (id, user_id, session_id, task_id, task_version, attempt_number, status, updated_at) VALUES
        ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', '${ANON}', '5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', 'b2-part2-advice-from-someone', 1, 1, 'completed', 'x');
      INSERT INTO analytics_events (id, name, source, user_id, session_id, occurred_at) VALUES ('ev1', 'practice_opened', 'client', '${ANON}', '5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e', '2026-01-01T00:00:00.000Z');
    `);

    await migrateDatabase(db); // the real, full set
    await client.execute("PRAGMA foreign_keys = ON");

    const users = await query(client, "SELECT id, kind, email, name, email_verified, merged_into_user_id FROM users ORDER BY id");
    expect(users).toEqual([
      { id: ANON, kind: "anonymous", email: null, name: null, email_verified: 0, merged_into_user_id: null },
      { id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2", kind: "anonymous", email: null, name: null, email_verified: 0, merged_into_user_id: null },
    ]);
    expect(await pragma(client, "foreign_key_check")).toEqual([]);

    // Now authenticate on the upgraded database and attach the existing anonymous history.
    setDbForTesting(db);
    resetAuthLimitersForTesting();
    jar.clear();
    jar.set("cefro_uid", ANON);
    expect((await signUp("upgraded@example.com", PASSWORD, { ip: "10.9.0.1" })).status).toBe(200);
    const account = await getCurrentUser();
    expect(account).toMatchObject({ kind: "authenticated", email: "upgraded@example.com" });
    expect(await query(client, "SELECT user_id FROM speaking_attempts WHERE id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'")).toEqual([{ user_id: account.userId }]);
    expect(await query(client, "SELECT user_id FROM practice_sessions")).toEqual([{ user_id: account.userId }]);
    expect(await query(client, "SELECT user_id FROM analytics_events WHERE id = 'ev1'")).toEqual([{ user_id: account.userId }]);
    expect(await query(client, "SELECT merged_into_user_id AS m FROM users WHERE id = ?", [ANON])).toEqual([{ m: account.userId }]);

    // A second sign-in with the same stale anonymous cookie changes nothing (idempotent).
    jar.clear();
    jar.set("cefro_uid", ANON);
    expect((await signIn("upgraded@example.com", PASSWORD, { ip: "10.9.0.2" })).status).toBe(200);
    expect(await query(client, "SELECT count(*) AS n FROM speaking_attempts")).toEqual([{ n: 1 }]);
    expect(await pragma(client, "foreign_key_check")).toEqual([]);
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

  it("rolls a failing migration back completely: an existing database keeps its schema and its data", async () => {
    const { dir, applied } = folderWithBrokenMigration();
    const { client, db } = await openRaw(path.join(tempDir(), "failing.sqlite"));
    await migrateDatabase(db); // the real set is applied
    await client.execute("INSERT INTO users (id, kind, email) VALUES ('keep-me', 'registered', 'keep@example.com')");

    await expect(migrateDatabase(db, dir)).rejects.toThrow();
    expect(names(await query(client, "SELECT name FROM sqlite_master WHERE type='table'"))).not.toContain("half_done"); // its first statement was undone too
    expect(await count(client, "__drizzle_migrations")).toBe(applied);
    expect(await query(client, "SELECT email FROM users WHERE id = 'keep-me'")).toEqual([{ email: "keep@example.com" }]);
  });

  it("applies a batch of pending migrations all-or-nothing (a failure in the last one leaves a fresh database empty, not half-built)", async () => {
    const { dir } = folderWithBrokenMigration();
    const { client, db } = await openRaw(path.join(tempDir(), "fresh-failing.sqlite"));
    await expect(migrateDatabase(db, dir)).rejects.toThrow();
    const tables = names(await query(client, "SELECT name FROM sqlite_master WHERE type='table'"));
    expect(tables).not.toContain("half_done");
    expect(tables).not.toContain("users"); // nothing from the earlier migrations in the same batch survived
  });
});
