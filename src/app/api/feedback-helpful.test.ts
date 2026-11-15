import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

import { eq } from "drizzle-orm";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { speakingAttempts } from "@/server/db/schema";
import { seedAttempt, seedUsers } from "../../../test/db-helpers";
import { POST as postFeedback } from "./speaking/attempts/[attemptId]/feedback/route";

/** "Was this feedback helpful?" (result page): one stored answer per scored attempt, owner only. */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-0000-4000-8000-0000000000f1";
const ctx = (id: string) => ({ params: Promise.resolve({ attemptId: id }) }) as never;
const send = (id: string, body: unknown) =>
  postFeedback(
    new Request(`http://localhost/api/speaking/attempts/${id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
const stored = async (db: Db, id = ID) =>
  db.select({ helpful: speakingAttempts.feedbackHelpful, at: speakingAttempts.feedbackHelpfulAt }).from(speakingAttempts).where(eq(speakingAttempts.id, id)).get();

let db: Db;
beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  jar.set("cefro_uid", USER);
  await seedUsers(db, USER, OTHER);
});
afterEach(() => setDbForTesting(undefined));

describe("POST /api/speaking/attempts/:id/feedback", () => {
  it("stores Yes with the time, and the result page reads it back", async () => {
    await seedAttempt(db, { id: ID, userId: USER, status: "completed" });
    expect((await getAttemptViewForUser(USER, ID)).feedbackHelpful).toBeNull();

    const response = await send(ID, { helpful: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ helpful: true });
    const row = await stored(db);
    expect(row?.helpful).toBe(true);
    expect(row?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await getAttemptViewForUser(USER, ID)).feedbackHelpful).toBe(true);
  });

  it("stores No as false (not as unanswered)", async () => {
    await seedAttempt(db, { id: ID, userId: USER, status: "completed" });
    expect(await (await send(ID, { helpful: false })).json()).toEqual({ helpful: false });
    expect((await stored(db))?.helpful).toBe(false);
  });

  it("keeps the first answer: a second, different answer changes nothing and gets the stored one back", async () => {
    await seedAttempt(db, { id: ID, userId: USER, status: "completed" });
    await send(ID, { helpful: false });
    const first = await stored(db);
    const again = await send(ID, { helpful: true });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ helpful: false });
    expect(await stored(db)).toEqual(first);
  });

  it("refuses an attempt that is not scored yet (409) and stores nothing", async () => {
    for (const status of ["processing", "failed"] as const) {
      const id = status === "failed" ? "aaaaaaaa-0000-4000-8000-0000000000f2" : ID;
      await seedAttempt(db, { id, userId: USER, status });
      const response = await send(id, { helpful: true });
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("attempt_not_scored");
      expect((await stored(db, id))?.helpful).toBeNull();
    }
  });

  it("answers 404 for another user's attempt and a missing one, and stores nothing", async () => {
    await seedAttempt(db, { id: ID, userId: OTHER, status: "completed" });
    expect((await send(ID, { helpful: true })).status).toBe(404);
    expect((await stored(db))?.helpful).toBeNull();
    expect((await send("aaaaaaaa-0000-4000-8000-0000000000ff", { helpful: true })).status).toBe(404);
    expect((await send("not-an-id", { helpful: true })).status).toBe(404);
  });

  it("refuses anything but true or false (400)", async () => {
    await seedAttempt(db, { id: ID, userId: USER, status: "completed" });
    for (const body of [{}, { helpful: "yes" }, { helpful: 1 }, { helpful: null }, "not json"]) {
      const response = await send(ID, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_body");
    }
    expect((await stored(db))?.helpful).toBeNull();
  });
});
