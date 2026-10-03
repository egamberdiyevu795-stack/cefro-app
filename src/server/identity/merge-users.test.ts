import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts, users } from "@/server/db/schema";
import { seedAttempt, seedSession, seedUsers } from "../../../test/db-helpers";
import { mergeUsers, resolveCanonicalUserId } from "./merge-users";

let db: Db;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  db = openDatabase(":memory:");
  seedUsers(db, A, B, C);
});

const numbers = (userId: string) =>
  db
    .select({ n: speakingAttempts.attemptNumber })
    .from(speakingAttempts)
    .where(eq(speakingAttempts.userId, userId))
    .all()
    .map((r) => r.n)
    .sort((x, y) => x - y);

describe("identity merge boundary", () => {
  it("merges two anonymous histories for the same task into one gapless, chronological sequence", () => {
    // A: attempts 1 (Jan 1) and 2 (Jan 3). B: attempts 1 (Jan 2) and 2 (Jan 4) at the same task, plus another task.
    const a1 = seedAttempt(db, { userId: A, attemptNumber: 1, createdAt: "2026-01-01T00:00:00.000Z" });
    const a2 = seedAttempt(db, { userId: A, attemptNumber: 2, previousAttemptId: a1, createdAt: "2026-01-03T00:00:00.000Z" });
    const b1 = seedAttempt(db, { userId: B, attemptNumber: 1, createdAt: "2026-01-02T00:00:00.000Z" });
    const b2 = seedAttempt(db, { userId: B, attemptNumber: 2, previousAttemptId: b1, createdAt: "2026-01-04T00:00:00.000Z" });
    const other = seedAttempt(db, { userId: B, taskId: "other-task", attemptNumber: 1, createdAt: "2026-01-05T00:00:00.000Z" });

    const result = mergeUsers(db, { fromUserId: B, intoUserId: A });
    expect(result).toEqual({ attemptsMoved: 3, sessionsMoved: 0 });

    const byId = (id: string) => db.select().from(speakingAttempts).where(eq(speakingAttempts.id, id)).get()!;
    expect([a1, b1, a2, b2].map((id) => byId(id).attemptNumber)).toEqual([1, 2, 3, 4]); // chronological
    expect(byId(other)).toMatchObject({ userId: A, attemptNumber: 1 }); // separate numbering per task
    expect(byId(b2).previousAttemptId).toBe(b1); // retry links are by id and survive
    expect(byId(a2).previousAttemptId).toBe(a1);
    expect(numbers(B)).toEqual([]);
    expect(db.select().from(users).where(eq(users.id, B)).get()?.mergedIntoUserId).toBe(A);
  });

  it("re-attributes sessions and analytics, and the old cookie keeps resolving to the survivor", () => {
    const session = "11111111-1111-4111-8111-111111111111";
    seedSession(db, B, session);
    db.insert(analyticsEvents).values({ id: "e1", name: "practice_opened", source: "client", userId: B, sessionId: session, occurredAt: "2026-01-01T00:00:00.000Z" }).run();

    const result = mergeUsers(db, { fromUserId: B, intoUserId: A });
    expect(result.sessionsMoved).toBe(1);
    expect(db.select().from(practiceSessions).where(eq(practiceSessions.id, session)).get()?.userId).toBe(A);
    expect(db.select().from(analyticsEvents).where(eq(analyticsEvents.id, "e1")).get()?.userId).toBe(A);

    expect(resolveCanonicalUserId(db, B)).toBe(A);
    expect(resolveCanonicalUserId(db, A)).toBe(A);
    expect(resolveCanonicalUserId(db, "never-seen")).toBe("never-seen");
  });

  it("follows a chain of merges (C into B, then B into A)", () => {
    mergeUsers(db, { fromUserId: C, intoUserId: B });
    mergeUsers(db, { fromUserId: B, intoUserId: A });
    expect(resolveCanonicalUserId(db, C)).toBe(A);
  });

  it("refuses merges that would corrupt identity", () => {
    expect(() => mergeUsers(db, { fromUserId: A, intoUserId: A })).toThrow(/itself/);
    expect(() => mergeUsers(db, { fromUserId: A, intoUserId: "ghost" })).toThrow(/exist/);
    mergeUsers(db, { fromUserId: B, intoUserId: A });
    expect(() => mergeUsers(db, { fromUserId: B, intoUserId: C })).toThrow(/already merged/);
    expect(() => mergeUsers(db, { fromUserId: C, intoUserId: B })).toThrow(/merged into another/);
  });
});
