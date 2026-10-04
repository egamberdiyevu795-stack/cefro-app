import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startHranaEmulator, type Emulator } from "./hrana-emulator";

const ROOT = process.cwd();
const TOKEN = "emu-secret-token-0123456789abcdef";
const JWT = "eyJhbGciOiJFZERTQSJ9.eyJhIjoicnciLCJpYXQiOjE3MDAwMDAwMDB9.c2lnbmF0dXJlLWJ5dGVzLXRlc3Q";

interface Result {
  code: number;
  out: string;
}

/** Runs the real script as a separate process (asynchronously, so the in-process emulator keeps serving). */
function runMigrate(env: Record<string, string>): Promise<Result> {
  const clean = { PATH: process.env.PATH, HOME: process.env.HOME, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1", ...env } as unknown as NodeJS.ProcessEnv;
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, "scripts/migrate.mjs")], { cwd: ROOT, env: clean, timeout: 60_000 }, (error, stdout, stderr) => {
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

describe("npm run db:migrate (scripts/migrate.mjs)", () => {
  it("applies every migration, passes the foreign-key check, and is idempotent", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const env = { TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN };
    const first = await runMigrate(env);
    expect(first.out).toMatch(/db:migrate: OK\. 5 migrations applied, foreign key check clean/);
    expect(first.code).toBe(0);
    const second = await runMigrate(env);
    expect(second.out).toMatch(/OK\. 5 migrations applied/);
    expect(second.code).toBe(0);
    expect(first.out + second.out).not.toContain(TOKEN);
  });

  it("does nothing without the variables (local development), and still refuses on Vercel", async () => {
    const local = await runMigrate({});
    expect(local.code).toBe(0);
    expect(local.out).toMatch(/nothing to migrate/);
    const vercel = await runMigrate({ VERCEL: "1", VERCEL_ENV: "production" });
    expect(vercel.code).toBe(1);
    expect(vercel.out).toMatch(/TURSO_DATABASE_URL and TURSO_AUTH_TOKEN/);
    expect(vercel.out).toMatch(/Production and Preview/);
  });

  it("names the missing half when only one variable is set", async () => {
    const result = await runMigrate({ TURSO_DATABASE_URL: "libsql://a-b.turso.io" });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/TURSO_AUTH_TOKEN is missing/);
  });

  it("refuses to run inside a Vercel Preview build, so a Preview can never migrate the shared database", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const result = await runMigrate({ VERCEL: "1", VERCEL_ENV: "preview", TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/Preview/);
    expect(emulator.requests).toHaveLength(0); // never connected
  });

  it("explains an authentication failure from the underlying cause, without printing the token", async () => {
    emulator = await startHranaEmulator({ token: TOKEN });
    const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: JWT });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/cause: .*401/);
    expect(result.out).toMatch(/Authentication failed/);
    expect(result.out).toMatch(/while: Failed query: CREATE TABLE IF NOT EXISTS "__drizzle_migrations"/);
    expect(result.out).not.toContain(JWT);
    expect(result.out).not.toContain(TOKEN);
    expect(result.out).not.toContain("eyJhbGci");
  });

  it("explains a write-permission failure", async () => {
    emulator = await startHranaEmulator({ token: TOKEN, status: 403 });
    const result = await runMigrate({ TURSO_DATABASE_URL: emulator.url, TURSO_AUTH_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/403/);
    expect(result.out).toMatch(/read-only|Not allowed to write/);
    expect(result.out).not.toContain(TOKEN);
  });

  it("explains an unreachable database, and redacts the database host", async () => {
    const host = "cefro-private-org.invalid";
    const result = await runMigrate({ TURSO_DATABASE_URL: `libsql://${host}`, TURSO_AUTH_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/cause: .*(ENOTFOUND|fetch failed|EAI_AGAIN)/);
    expect(result.out).toMatch(/Could not reach the database/);
    expect(result.out).not.toContain(host);
    expect(result.out).not.toContain(TOKEN);
  });

  it("rejects an address that is not a URL, without echoing the credentials", async () => {
    const result = await runMigrate({ TURSO_DATABASE_URL: "not a url ", TURSO_AUTH_TOKEN: TOKEN });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/not a valid address/);
    expect(result.out).not.toContain(TOKEN);
  });
});
