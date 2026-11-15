import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHranaEmulator, type Emulator } from "./hrana-emulator";

vi.setConfig({ testTimeout: 30_000 });

const ROOT = process.cwd();
const TOKEN = "emu-secret-token-0123456789abcdef";

function runBackup(env: Record<string, string>, out: string): Promise<{ code: number; out: string }> {
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", ...env } as unknown as NodeJS.ProcessEnv;
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, "scripts/ci/backup-database.mjs"), out], { cwd: ROOT, env: clean, timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

const SEED = `
CREATE TABLE users (id text PRIMARY KEY NOT NULL, name text, score real, n integer, role text DEFAULT 'student' NOT NULL);
CREATE TABLE blobs (id text PRIMARY KEY NOT NULL, user_id text NOT NULL REFERENCES users(id), data blob);
CREATE INDEX blobs_user_idx ON blobs (user_id);
INSERT INTO users VALUES ('u1', 'O''Brien "quoted"', 3.5, 42, 'teacher'), ('u2', NULL, NULL, NULL, 'student');
INSERT INTO blobs VALUES ('b1', 'u1', X'00ff10');
`;

let emulator: Emulator | undefined;
afterEach(async () => {
  await emulator?.close();
  emulator = undefined;
});

describe("scripts/ci/backup-database.mjs", () => {
  it("only reads, and its dump restores to the same rows, indexes included", async () => {
    emulator = await startHranaEmulator({ token: TOKEN, initialSql: SEED });
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cefro-backup-")), "backup.sql");
    const result = await runBackup({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, out);
    expect(result.out).toMatch(/done, 2 tables, 3 rows/);
    expect(result.code).toBe(0);
    expect(result.out).not.toContain(TOKEN);
    expect(result.out).not.toContain("Brien"); // row values never reach the log
    expect(emulator.requests.filter((sql) => !/^\s*SELECT\b/i.test(sql))).toEqual([]);

    const restored = new DatabaseSync(":memory:");
    restored.exec(fs.readFileSync(out, "utf8"));
    const original = new DatabaseSync(":memory:");
    original.exec(SEED);
    for (const q of ["SELECT * FROM users ORDER BY id", "SELECT id, user_id, hex(data) AS d FROM blobs", "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"]) {
      expect(restored.prepare(q).all()).toEqual(original.prepare(q).all());
    }
  });

  it("backs up the real, fully migrated schema and the dump restores it", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const env = { TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN };
    const migrated = await new Promise<number>((resolve) => {
      const clean = { PATH: process.env.PATH, HOME: process.env.HOME, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", ...env } as unknown as NodeJS.ProcessEnv;
      execFile(process.execPath, [path.join(ROOT, "scripts/migrate.mjs"), "--require-remote"], { cwd: ROOT, env: clean, timeout: 60_000 }, (error) => resolve(error ? 1 : 0));
    });
    expect(migrated).toBe(0);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cefro-backup-")), "backup.sql");
    const result = await runBackup(env, out);
    expect(result.code).toBe(0);
    const restored = new DatabaseSync(":memory:");
    restored.exec(fs.readFileSync(out, "utf8"));
    const journal = JSON.parse(fs.readFileSync(path.join(ROOT, "src/server/db/migrations/meta/_journal.json"), "utf8")) as { entries: unknown[] };
    expect(restored.prepare('SELECT count(*) AS n FROM "__drizzle_migrations"').get()).toEqual({ n: journal.entries.length });
  });

  it("fails closed without credentials", async () => {
    const result = await runBackup({}, path.join(os.tmpdir(), "never.sql"));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required/);
  });
});

describe("the production pipeline backs up the database before it migrates", () => {
  it("the migrate job runs the backup and keeps it as an artifact, both before db:migrate", () => {
    const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    const job = yml.slice(yml.indexOf("\n  migrate:"), yml.indexOf("\n  verify:"));
    const backup = job.indexOf("node scripts/ci/backup-database.mjs");
    const upload = job.indexOf("actions/upload-artifact@v4");
    const migrate = job.indexOf("npm run db:migrate -- --require-remote");
    expect(backup).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(backup);
    expect(migrate).toBeGreaterThan(upload);
  });
});
