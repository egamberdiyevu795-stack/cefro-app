import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { DatabaseUnavailableError } from "@/server/db/errors";
import { resetHealthCacheForTesting } from "@/server/health/health-check";
import { GET } from "./route";

const SECRET = "health-secret-token-0123456789";

beforeEach(() => resetHealthCacheForTesting());
afterEach(() => {
  setDbForTesting(undefined);
  vi.restoreAllMocks();
});

async function call() {
  const response = await GET();
  return { status: response.status, body: await response.text(), headers: response.headers };
}

describe("GET /api/health", () => {
  it("reports ok for a reachable, fully migrated database, and nothing else", async () => {
    setDbForTesting(await openDatabase(":memory:"));
    const { status, body, headers } = await call();
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({ status: "ok" });
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("reports unavailable when the schema has not been migrated, without saying why", async () => {
    setDbForTesting(await openDatabase(":memory:", { autoMigrate: false }));
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toMatch(/migrat|drizzle|table|npm|db:/i);
  });

  it("reports unavailable when the database cannot be reached, with no error text, host or credential in the body", async () => {
    // getDb is what rejects when the connection fails; make the shared connection a stand-in that throws like one.
    const db = await openDatabase(":memory:");
    vi.spyOn(db.$client, "execute").mockRejectedValue(new DatabaseUnavailableError(`connect ECONNREFUSED prod-db.turso.io Bearer ${SECRET}`));
    setDbForTesting(db);
    const { status, body } = await call();
    expect(status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    for (const leaked of [SECRET, "turso.io", "ECONNREFUSED", "Bearer"]) expect(body).not.toContain(leaked);
  });

  it("is unavailable when the database initialisation itself fails (for example a Preview holding production credentials)", async () => {
    setDbForTesting(undefined);
    vi.resetModules();
    vi.doMock("@/server/config/env", () => ({
      getEnv: () => ({ DATABASE_PATH: ":memory:", DATABASE_TIMEOUT_MS: 5000, TURSO_DATABASE_URL: "libsql://prod-db-org.turso.io", TURSO_AUTH_TOKEN: SECRET, VERCEL_ENV: "preview" }),
    }));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network must not be used"));
    const { GET: freshGet } = await import("./route");
    const response = await freshGet();
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain(SECRET);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.doUnmock("@/server/config/env");
  });

  it("keeps its answer for a few seconds so polling cannot become database load", async () => {
    const db = await openDatabase(":memory:");
    const execute = vi.spyOn(db.$client, "execute");
    setDbForTesting(db);
    await call();
    const afterFirst = execute.mock.calls.length;
    await call();
    await call();
    expect(execute.mock.calls.length).toBe(afterFirst);
  });

  it("needs no sign-in and sets no identity cookie", async () => {
    setDbForTesting(await openDatabase(":memory:"));
    const { headers } = await call();
    expect(headers.get("set-cookie")).toBeNull();
  });
});
