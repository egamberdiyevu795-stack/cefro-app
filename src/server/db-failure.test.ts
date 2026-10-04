import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { DatabaseUnavailableError } from "@/server/db/errors";
import { users } from "@/server/db/schema";
import { createAttempt, getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
import { redactSecrets } from "@/server/logging/logger";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { fakeWebm } from "../../test/fixtures";

const USER = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "b2-part2-technology-young-people";

describe("infrastructure failures are not 'not found'", () => {
  it("maps a database outage to 503 database_unavailable (retryable) and keeps a real 404 a 404", async () => {
    const down = withErrorHandling(async () => {
      throw new DatabaseUnavailableError("Could not open the database: connect ECONNREFUSED turso-secret-host");
    });
    const response = await down();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    const body = await response.text();
    expect(body).toContain("database_unavailable");
    expect(body).not.toContain("turso-secret-host");
  });

  it("does not turn a failing database read into attempt_not_found", async () => {
    const db = await openDatabase(":memory:");
    setDbForTesting(db);
    await db.insert(users).values({ id: USER }).run();
    await db.$client.execute("DROP TABLE speaking_attempts"); // the read now fails for infrastructure reasons
    const error = await getAttemptViewForUser(USER, "99999999-9999-4999-8999-999999999999").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).not.toBe("attempt_not_found");
    setDbForTesting(undefined);
  });
});

describe("a failed attempt insert", () => {
  let dir: string;
  let db: Db;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-orphan-"));
    db = await openDatabase(":memory:");
    setDbForTesting(db);
    setAudioStorageForTesting(new LocalAudioStorage(dir));
    await db.insert(users).values({ id: USER }).run();
  });
  afterEach(() => {
    setDbForTesting(undefined);
    setAudioStorageForTesting(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("leaves no orphaned recording behind and stores no attempt", async () => {
    await db.$client.execute("CREATE TRIGGER block_recordings BEFORE INSERT ON recordings BEGIN SELECT RAISE(ABORT, 'boom'); END");
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: fakeWebm(), mimeType: "audio/webm", durationMs: 1000, previousAttemptId: null }),
    ).rejects.toBeTruthy();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile()) : [];
    expect(files).toHaveLength(0);
    // The attempt insert and recording insert are one transaction: neither remains.
    expect((await db.$client.execute("SELECT count(*) c FROM speaking_attempts")).rows[0][0]).toBe(0);
  });
});

describe("log redaction", () => {
  it("removes configured secrets (and the database host) from a log line", () => {
    const env = {
      TURSO_AUTH_TOKEN: "turso-token-abcdef123456",
      TURSO_DATABASE_URL: "libsql://cefro-db-org.turso.io",
      AUTH_SECRET: "auth-secret-0123456789abcdef",
      GEMINI_API_KEY: "gemini-key-0123456789",
    } as unknown as NodeJS.ProcessEnv;
    const line = JSON.stringify({ error: `fetch failed https://cefro-db-org.turso.io Bearer turso-token-abcdef123456 ${env.AUTH_SECRET} ${env.GEMINI_API_KEY}` });
    const out = redactSecrets(line, env);
    for (const secret of ["turso-token-abcdef123456", "cefro-db-org", "auth-secret-0123456789abcdef", "gemini-key-0123456789"]) expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it("leaves ordinary lines alone", () => {
    expect(redactSecrets('{"message":"hello"}', {} as unknown as NodeJS.ProcessEnv)).toBe('{"message":"hello"}');
  });
});
