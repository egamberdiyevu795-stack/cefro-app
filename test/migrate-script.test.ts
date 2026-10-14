import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHranaEmulator, type Emulator } from "./hrana-emulator";

// These tests start real child processes (node, git); give them room when the whole suite is running in parallel.
vi.setConfig({ testTimeout: 30_000 });

const ROOT = process.cwd();
const TOKEN = "emu-secret-token-0123456789abcdef";
const JWT = "eyJhbGciOiJFZERTQSJ9.eyJhIjoicnciLCJpYXQiOjE3MDAwMDAwMDB9.c2lnbmF0dXJlLWJ5dGVzLXRlc3Q";

interface Result {
  code: number;
  out: string;
}

/** Runs the real script as a separate process (asynchronously, so the in-process emulator keeps serving). */
function runMigrate(env: Record<string, string>, ...args: string[]): Promise<Result> {
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", ...env } as unknown as NodeJS.ProcessEnv;
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, "scripts/migrate.mjs"), ...args], { cwd: ROOT, env: clean, timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

let emulator: Emulator | undefined;
afterEach(async () => {
  await emulator?.close();
  emulator = undefined;
});

describe("the Vercel build does not touch the database", () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;

  it("vercel-build is only the production Next.js build", () => {
    expect(scripts["vercel-build"]).toBe("next build");
    expect(scripts.build).toBe("next build");
  });

  it("no build-time script runs the migration; db:migrate stays an explicit command", () => {
    for (const name of ["build", "vercel-build", "postinstall", "prebuild", "postbuild", "prepare"]) {
      expect(scripts[name] ?? "", name).not.toMatch(/migrate/);
    }
    expect(scripts["db:migrate"]).toBe("node scripts/migrate.mjs");
  });

  it("the application's build and start-up code never import the migration script", () => {
    const next = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    expect(next).not.toMatch(/migrate\.mjs/);
  });
});

/** Statements a read-only check may send. Anything else in the emulator's log is a write. */
const isRead = (sql: string) => /^\s*(SELECT|PRAGMA foreign_key_check)\b/i.test(sql);

describe("npm run db:migrate (scripts/migrate.mjs)", () => {
  it("applies every migration, passes the foreign-key check, and is idempotent", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const env = { TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN };
    const first = await runMigrate(env, "--require-remote");
    expect(first.out).toMatch(/db:migrate: OK\. 5 migrations applied, foreign key check clean/);
    expect(first.code).toBe(0);
    const second = await runMigrate(env, "--require-remote");
    expect(second.out).toMatch(/OK\. 5 migrations applied/);
    expect(second.code).toBe(0);
    expect(first.out + second.out).not.toContain(TOKEN);
  });

  describe("missing or incomplete credentials fail closed with --require-remote", () => {
    it.each([
      ["both missing", {}],
      ["both empty", { TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" }],
    ])("%s: nonzero exit, names the variables, never reports 'nothing to migrate'", async (_label, env) => {
      const result = await runMigrate(env as Record<string, string>, "--require-remote");
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are both missing or empty/);
      expect(result.out).not.toMatch(/nothing to migrate/);
    });

    it("one of the two missing is an error with or without the flag, and names the missing one", async () => {
      for (const flag of [[], ["--require-remote"]]) {
        const noToken = await runMigrate({ TURSO_DATABASE_URL: "libsql://a-b.turso.io" }, ...flag);
        expect(noToken.code).toBe(1);
        expect(noToken.out).toMatch(/TURSO_AUTH_TOKEN is missing/);
        const noUrl = await runMigrate({ TURSO_AUTH_TOKEN: TOKEN }, ...flag);
        expect(noUrl.code).toBe(1);
        expect(noUrl.out).toMatch(/TURSO_DATABASE_URL is missing/);
        expect(noUrl.out).not.toContain(TOKEN);
      }
    });

    it("without the flag, no credentials still means local development: nothing to migrate, exit 0 (but not on Vercel)", async () => {
      const local = await runMigrate({});
      expect(local.code).toBe(0);
      expect(local.out).toMatch(/nothing to migrate/);
      const vercel = await runMigrate({ VERCEL: "1", VERCEL_ENV: "production" });
      expect(vercel.code).toBe(1);
      expect(vercel.out).toMatch(/TURSO_DATABASE_URL and TURSO_AUTH_TOKEN/);
    });
  });

  describe("insecure addresses", () => {
    it("refuses http:// to anything but a loopback test endpoint, without printing the address or token", async () => {
      for (const url of ["http://db.example.com", "http://10.0.0.5:8080", "http://turso.example.com/path"]) {
        const result = await runMigrate({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
        expect(result.code, url).toBe(1);
        expect(result.out, url).toMatch(/http:\/\/, which is refused/);
        expect(result.out).not.toContain(TOKEN);
        expect(result.out).not.toContain("example.com");
        expect(result.out).not.toContain("10.0.0.5");
      }
    });

    it("refuses other schemes and malformed addresses", async () => {
      for (const url of ["ftp://a.example.com", "file:./data/cefro.db", "ws://a.example.com", "not a url ", "libsql://"]) {
        const result = await runMigrate({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
        expect(result.code, url).toBe(1);
        expect(result.out, url).toMatch(/not a valid address/);
        expect(result.out).not.toContain(TOKEN);
      }
    });

    it("accepts a loopback http:// endpoint (the test endpoint) and libsql:// or https:// for hosted databases", async () => {
      emulator = await startHranaEmulator({ token: TOKEN });
      const ok = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--check", "--require-remote");
      expect(ok.code).toBe(0);
      const unreachable = await runMigrate({ TURSO_DATABASE_URL: "libsql://cefro-x-y.invalid", TURSO_AUTH_TOKEN: TOKEN }, "--check");
      expect(unreachable.out).toMatch(/Could not reach the database/); // got as far as connecting: the address was accepted
    });
  });

  it("refuses to run inside a Vercel Preview build, before connecting", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const result = await runMigrate({ VERCEL: "1", VERCEL_ENV: "preview", TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/Preview/);
    expect(emulator.requests).toHaveLength(0);
  });

  it("rejects an unknown option", async () => {
    const result = await runMigrate({}, "--force");
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/unknown option --force/);
    expect((await runMigrate({}, "--require-current")).code).toBe(1);
  });

  describe("failures expose a useful cause and no credentials", () => {
    it("authentication", async () => {
      emulator = await startHranaEmulator({ token: TOKEN });
      const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: JWT }, "--require-remote");
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/cause: .*401/);
      expect(result.out).toMatch(/Authentication failed/);
      for (const secret of [JWT, TOKEN, "eyJhbGci"]) expect(result.out).not.toContain(secret);
      expect(emulator.requests).toHaveLength(0); // nothing was executed
    });

    it("write permission", async () => {
      emulator = await startHranaEmulator({ token: TOKEN, status: 403 });
      const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/403/);
      expect(result.out).toMatch(/read-only|Not allowed to write/);
      expect(result.out).not.toContain(TOKEN);
    });

    it("unreachable database, with the host redacted", async () => {
      const host = "cefro-private-org.invalid";
      const result = await runMigrate({ TURSO_DATABASE_URL: `libsql://${host}`, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/cause: .*(ENOTFOUND|fetch failed|EAI_AGAIN)/);
      expect(result.out).toMatch(/Could not reach the database/);
      expect(result.out).not.toContain(host);
      expect(result.out).not.toContain(TOKEN);
    });
  });

  describe("--check is read-only", () => {
    it("reports a fresh database as unmigrated and sends only SELECT / PRAGMA foreign_key_check", async () => {
      emulator = await startHranaEmulator({ token: TOKEN });
      const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--check", "--require-remote");
      expect(result.code).toBe(0);
      expect(result.out).toMatch(/0 of 5 migrations applied, 5 pending/);
      expect(emulator.requests.length).toBeGreaterThan(0);
      expect(emulator.requests.filter((sql) => !isRead(sql))).toEqual([]);
      // Nothing was created: a later migrate still sees an empty database.
      const after = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--check");
      expect(after.out).toMatch(/0 of 5 migrations applied/);
    });

    it("--require-current fails while migrations are pending and passes once they are applied", async () => {
      emulator = await startHranaEmulator({ token: TOKEN });
      const env = { TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN };
      const pending = await runMigrate(env, "--check", "--require-remote", "--require-current");
      expect(pending.code).toBe(1);
      expect(pending.out).toMatch(/5 migration\(s\) are not applied yet/);
      expect((await runMigrate(env, "--require-remote")).code).toBe(0);
      const current = await runMigrate(env, "--check", "--require-remote", "--require-current");
      expect(current.code).toBe(0);
      expect(current.out).toMatch(/5 of 5 migrations applied, 0 pending/);
    });
  });

  describe("an unintended database is never touched", () => {
    it("refuses a database that has tables but no CEFRO migration history, for migrate and for check", async () => {
      emulator = await startHranaEmulator({ token: TOKEN, initialSql: "CREATE TABLE customers (id integer primary key, email text); INSERT INTO customers (email) VALUES ('a@example.com');" });
      const env = { TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN };
      for (const flags of [["--require-remote"], ["--check", "--require-remote"]]) {
        const result = await runMigrate(env, ...flags);
        expect(result.code, flags.join(" ")).toBe(1);
        expect(result.out).toMatch(/already contains 1 table\(s\) but no CEFRO migration history/);
        expect(result.out).not.toContain("customers"); // no table names or data in the output
      }
      expect(emulator.requests.filter((sql) => !isRead(sql) && !/^SELECT/i.test(sql))).toEqual([]); // nothing written
    });

    it("refuses a database whose migration history this code does not know (newer or unrelated)", async () => {
      emulator = await startHranaEmulator({
        token: TOKEN,
        initialSql: "CREATE TABLE __drizzle_migrations (id integer primary key, hash text not null, created_at numeric); INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('from-a-newer-release', 9999999999999);",
      });
      const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN }, "--require-remote");
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/1 migration\(s\) this code does not know/);
      expect(emulator.requests.filter((sql) => !/^SELECT/i.test(sql))).toEqual([]);
    });
  });
});
