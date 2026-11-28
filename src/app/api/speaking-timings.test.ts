import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents } from "@/server/db/schema";
import { seedAttempt, seedUsers } from "../../../test/db-helpers";
import { GET } from "./speaking/timings/route";

/** "Where did the minutes go?" (GET /api/speaking/timings): the caller's own latest attempts and nothing else. */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MINE = "aaaaaaaa-0000-4000-8000-0000000000e1";
const THEIRS = "aaaaaaaa-0000-4000-8000-0000000000e2";

let db: Db;
beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  jar.set("cefro_uid", USER);
  await seedUsers(db, USER, OTHER);
});
afterEach(() => setDbForTesting(undefined));

describe("GET /api/speaking/timings", () => {
  it("lists only the caller's attempts, with the browser's upload time when it was reported", async () => {
    await seedAttempt(db, { id: MINE, userId: USER, status: "completed" });
    await seedAttempt(db, { id: THEIRS, userId: OTHER, status: "completed" });
    await db.insert(analyticsEvents).values({
      id: "bbbbbbbb-0000-4000-8000-0000000000e1",
      name: "upload_completed",
      source: "client",
      userId: USER,
      attemptId: MINE,
      properties: { uploadMs: 4200, bytes: 123456 },
      occurredAt: new Date().toISOString(),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { attempts: { attemptId: string; upload: unknown }[] };
    expect(body.attempts.map((a) => a.attemptId)).toEqual([MINE]);
    expect(body.attempts[0].upload).toEqual({ uploadMs: 4200, bytes: 123456 });
  });

  it("shows an empty list (not an error) when there is nothing yet", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ attempts: [] });
  });
});
