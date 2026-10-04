import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSchemaCurrent, boundedFetch, createDatabase, openDatabase, serialised, shippedMigrationCount } from "./client";
import { DatabaseUnavailableError, isDatabaseUnavailable, safeDatabaseMessage } from "./errors";
import { isTursoUrl, normalizeTursoUrl, redactDatabaseSecrets, resolveDatabaseTarget } from "./target";

const TOKEN = "eyJ-fake-token-for-tests-0123456789";
const URL_ = "libsql://cefro-test-someone.turso.io";
const base = { TURSO_DATABASE_URL: undefined, TURSO_AUTH_TOKEN: undefined, DATABASE_PATH: "./data/x.db", DATABASE_TIMEOUT_MS: 8000 };

describe("database target selection", () => {
  it("uses a local SQLite file when the Turso variables are absent", () => {
    expect(resolveDatabaseTarget(base)).toEqual({ kind: "file", path: "./data/x.db" });
  });

  it("uses Turso over https when both variables are set (libsql:// is normalised)", () => {
    expect(resolveDatabaseTarget({ ...base, TURSO_DATABASE_URL: URL_, TURSO_AUTH_TOKEN: TOKEN })).toEqual({
      kind: "turso",
      url: "https://cefro-test-someone.turso.io",
      authToken: TOKEN,
      timeoutMs: 8000,
    });
  });

  it("never silently falls back to a local file when only one variable is set", () => {
    expect(() => resolveDatabaseTarget({ ...base, TURSO_DATABASE_URL: URL_ })).toThrow(/must be set together/);
    expect(() => resolveDatabaseTarget({ ...base, TURSO_AUTH_TOKEN: TOKEN })).toThrow(/must be set together/);
  });

  it("accepts https and libsql addresses only", () => {
    expect(normalizeTursoUrl("libsql://a.turso.io")).toBe("https://a.turso.io");
    expect(isTursoUrl("libsql://a.turso.io")).toBe(true);
    expect(isTursoUrl("https://a.turso.io")).toBe(true);
    for (const bad of ["http://a.turso.io", "file:./x.db", "a.turso.io", "", "ws://a.turso.io"]) expect(isTursoUrl(bad)).toBe(false);
  });
});

describe("hosted client initialisation (fake HTTP, no network)", () => {
  it("talks https to the configured host with the bearer token, and a failing server is reported without credentials", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input instanceof Request ? input.url : input), auth: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization") });
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    const target = resolveDatabaseTarget({ ...base, TURSO_DATABASE_URL: URL_, TURSO_AUTH_TOKEN: TOKEN });
    await expect(openDatabase(target, { fetch: fakeFetch })).rejects.toThrow();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.url.startsWith("https://cefro-test-someone.turso.io"))).toBe(true);
    expect(seen.every((s) => s.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("is never migrated by the application: a hosted database that is behind is a clear deployment error", async () => {
    const db = await openDatabase(":memory:", { autoMigrate: false });
    await expect(assertSchemaCurrent(db)).rejects.toThrow(/0 of \d+ migrations applied.*npm run db:migrate/);
    const migrated = await openDatabase(":memory:");
    await expect(assertSchemaCurrent(migrated)).resolves.toBeUndefined();
    expect(shippedMigrationCount()).toBeGreaterThanOrEqual(5);
  });

  it("bounds every request with a timeout", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    await expect(boundedFetch(30, hanging)("https://x.example")).rejects.toBeTruthy();
  });

  it("redacts the token, address and host from any text", () => {
    const env = { TURSO_DATABASE_URL: URL_, TURSO_AUTH_TOKEN: TOKEN };
    const text = `failed ${URL_} host cefro-test-someone.turso.io bearer ${TOKEN} https://cefro-test-someone.turso.io/v2`;
    const out = redactDatabaseSecrets(text, env);
    for (const secret of [TOKEN, "cefro-test-someone", "turso.io"]) expect(out).not.toContain(secret);
  });
});

describe("database errors", () => {
  it("treats connection problems as unavailability, not as a missing record", () => {
    expect(isDatabaseUnavailable(new DatabaseUnavailableError("down"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("plain"))).toBe(false);
    expect(safeDatabaseMessage(new Error("boom"))).toContain("boom");
  });
});

describe("local database", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-db-"));
    dirs.push(d);
    return path.join(d, "nested", "t.db");
  };

  it("creates the file (and folder), migrates it, enables foreign keys, and is reopenable", async () => {
    const file = tmp();
    const db = await openDatabase(file);
    expect((await db.$client.execute("PRAGMA foreign_keys")).rows[0][0]).toBe(1);
    await db.$client.execute("INSERT INTO users (id) VALUES ('u1')");
    db.$client.close();
    const again = await openDatabase(file);
    expect((await again.$client.execute("SELECT count(*) c FROM users")).rows[0][0]).toBe(1);
    again.$client.close();
  });

  it("opens through createDatabase without migrating", async () => {
    const db = await createDatabase({ kind: "file", path: tmp() });
    await expect(db.$client.execute("SELECT 1 FROM users")).rejects.toThrow();
    db.$client.close();
  });

  it("serialises operations and releases the lock when a transaction ends either way", async () => {
    const db = await openDatabase(tmp());
    const c = serialised(db.$client);
    const order: string[] = [];
    const tx = await c.transaction("write");
    const queued = c.execute("SELECT 1").then(() => order.push("after-tx"));
    await tx.execute("INSERT INTO users (id) VALUES ('t1')");
    order.push("in-tx");
    await tx.rollback();
    await queued;
    expect(order).toEqual(["in-tx", "after-tx"]);
    expect((await c.execute("SELECT count(*) c FROM users WHERE id='t1'")).rows[0][0]).toBe(0);
    const tx2 = await c.transaction("write");
    await tx2.execute("INSERT INTO users (id) VALUES ('t2')");
    await tx2.commit();
    expect((await c.execute("SELECT count(*) c FROM users WHERE id='t2'")).rows[0][0]).toBe(1);
    db.$client.close();
  });
});
