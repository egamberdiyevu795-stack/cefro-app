import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
const control = vi.hoisted(() => ({ failMerge: false }));
vi.mock("./merge-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./merge-users")>();
  return {
    ...actual,
    mergeUsers: (...args: Parameters<typeof actual.mergeUsers>) => {
      if (control.failMerge) throw new Error("simulated failure in the middle of a merge");
      return actual.mergeUsers(...args);
    },
  };
});

import { eq } from "drizzle-orm";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { speakingAttempts, users } from "@/server/db/schema";
import { PASSWORD, signIn, signOut, signUp } from "../../../test/auth-helpers";
import { seedAttempt, seedUsers } from "../../../test/db-helpers";
import { jar } from "../../../test/next-headers-mock";
import { getCurrentUser } from "./current-user";
import { USER_COOKIE_NAME } from "./user-cookie";

const ANON = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  resetAuthLimitersForTesting();
  control.failMerge = false;
});
afterEach(() => setDbForTesting(undefined));

describe("when attaching anonymous history fails", () => {
  it("still signs the user in, keeps the anonymous data and cookie untouched, and a later sign-in completes the merge", async () => {
    seedUsers(db, ANON);
    const attempt = seedAttempt(db, { userId: ANON, attemptNumber: 1 });
    jar.set(USER_COOKIE_NAME, ANON);

    control.failMerge = true;
    const first = await signUp("retry@example.com", PASSWORD, { ip: "10.3.0.1" });
    expect(first.status).toBe(200); // a valid login is never failed over this
    const account = await getCurrentUser();
    expect(account.kind).toBe("authenticated");

    // Nothing moved, nothing half-moved: the anonymous history is intact and its cookie is still there to retry with.
    expect(db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt)).get()).toMatchObject({ userId: ANON, attemptNumber: 1 });
    expect(db.select().from(users).where(eq(users.id, ANON)).get()?.mergedIntoUserId).toBeNull();
    expect(jar.get(USER_COOKIE_NAME)).toBe(ANON);

    // Retry: sign in again with the failure gone.
    await signOut();
    jar.set(USER_COOKIE_NAME, ANON);
    control.failMerge = false;
    expect((await signIn("retry@example.com", PASSWORD, { ip: "10.3.0.2" })).status).toBe(200);
    expect(db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt)).get()?.userId).toBe(account.userId);
    expect(jar.has(USER_COOKIE_NAME)).toBe(false);
  });
});
