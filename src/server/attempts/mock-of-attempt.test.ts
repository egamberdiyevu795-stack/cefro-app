import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { practiceSessions } from "@/server/db/schema";
import { seedAttempt, seedSession, seedUsers } from "../../../test/db-helpers";
import { fullMockSessionIdOfAttempt } from "./attempt-repository";

/** Which full mock a part belongs to: only for the caller's own attempt, only for a "full_mock" session. */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MOCK = "cccccccc-0000-4000-8000-000000000001";
const SINGLE = "cccccccc-0000-4000-8000-000000000002";
const IN_MOCK = "aaaaaaaa-0000-4000-8000-0000000000b1";
const IN_SINGLE = "aaaaaaaa-0000-4000-8000-0000000000b2";
const LOOSE = "aaaaaaaa-0000-4000-8000-0000000000b3";

let db: Db;
beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await seedUsers(db, USER, OTHER);
  await db.insert(practiceSessions).values({ id: MOCK, userId: USER, kind: "full_mock" }).run();
  await seedSession(db, USER, SINGLE);
  await seedAttempt(db, { id: IN_MOCK, userId: USER, sessionId: MOCK, status: "completed" });
  await seedAttempt(db, { id: IN_SINGLE, userId: USER, sessionId: SINGLE, status: "completed" });
  await seedAttempt(db, { id: LOOSE, userId: USER, status: "completed" });
});
afterEach(() => setDbForTesting(undefined));

describe("fullMockSessionIdOfAttempt", () => {
  it("returns the mock for a part recorded in a full mock", async () => {
    expect(await fullMockSessionIdOfAttempt(USER, IN_MOCK)).toBe(MOCK);
  });

  it("is null for a single practice, an attempt with no session, and someone else's attempt", async () => {
    expect(await fullMockSessionIdOfAttempt(USER, IN_SINGLE)).toBeNull();
    expect(await fullMockSessionIdOfAttempt(USER, LOOSE)).toBeNull();
    expect(await fullMockSessionIdOfAttempt(OTHER, IN_MOCK)).toBeNull();
  });
});
