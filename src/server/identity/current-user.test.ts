import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);

import { eq } from "drizzle-orm";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { authSessions, users } from "@/server/db/schema";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { PASSWORD, signIn, signOut, signUp } from "../../../test/auth-helpers";
import { SESSION_COOKIE, jar } from "../../../test/next-headers-mock";
import { getCurrentUser, requireAuthenticated } from "./current-user";
import { mergeUsers } from "./merge-users";
import { USER_COOKIE_NAME } from "./user-cookie";

let db: Db;
let ip = 0;
const freshIp = () => `10.1.0.${++ip}`;
const ANON = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  db = openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  resetAuthLimitersForTesting();
});
afterEach(() => setDbForTesting(undefined));

const kindOf = (id: string) => db.select({ kind: users.kind }).from(users).where(eq(users.id, id)).get()?.kind;

describe("anonymous callers", () => {
  it("get a new anonymous identity and a cookie on first use, and keep it afterwards", async () => {
    const first = await getCurrentUser();
    expect(first.kind).toBe("anonymous");
    expect(kindOf(first.userId)).toBe("anonymous");
    expect(jar.get(USER_COOKIE_NAME)).toBe(first.userId);
    expect((await getCurrentUser()).userId).toBe(first.userId);
  });

  it("keep an existing anonymous identity from a valid cookie", async () => {
    jar.set(USER_COOKIE_NAME, ANON);
    expect(await getCurrentUser()).toEqual({ kind: "anonymous", userId: ANON });
    expect(kindOf(ANON)).toBe("anonymous");
  });

  it("get a new identity when the cookie is malformed", async () => {
    jar.set(USER_COOKIE_NAME, "not-a-uuid");
    const user = await getCurrentUser();
    expect(user.userId).not.toBe("not-a-uuid");
    expect(jar.get(USER_COOKIE_NAME)).toBe(user.userId);
  });
});

describe("authenticated callers", () => {
  it("are identified by the login session, with the account's canonical user id", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    const user = await getCurrentUser();
    expect(user).toMatchObject({ kind: "authenticated", email: "me@example.com" });
    expect(kindOf(user.userId)).toBe("registered");
    expect(jar.has(USER_COOKIE_NAME)).toBe(false); // no anonymous identity was created for a signed-in browser
  });

  it("ignore the anonymous cookie while a valid login session exists", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    jar.set(USER_COOKIE_NAME, ANON);
    db.insert(users).values({ id: ANON }).run();
    const user = await getCurrentUser();
    expect(user.kind).toBe("authenticated");
    expect(user.userId).not.toBe(ANON);
  });

  it("treat an unknown, malformed or tampered session cookie as anonymous (never as another identity)", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    const real = jar.get(SESSION_COOKIE)!;
    const accountId = (await getCurrentUser()).userId;

    for (const forged of ["garbage", "", `${real.split(".")[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%3D`, real.split(".")[0]]) {
      jar.set(SESSION_COOKIE, forged);
      const user = await getCurrentUser();
      expect(user.kind, `forged: ${forged.slice(0, 12)}`).toBe("anonymous");
      expect(user.userId).not.toBe(accountId);
      jar.delete(USER_COOKIE_NAME);
    }
  });

  it("stop being authenticated when the session expires", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    expect((await getCurrentUser()).kind).toBe("authenticated");
    db.update(authSessions).set({ expiresAt: new Date(Date.now() - 60_000) }).run();
    expect((await getCurrentUser()).kind).toBe("anonymous");
  });

  it("stop being authenticated after sign-out, even if the old cookie is replayed", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    const oldCookie = jar.get(SESSION_COOKIE)!;
    await signOut();
    expect((await getCurrentUser()).kind).toBe("anonymous");
    jar.set(SESSION_COOKIE, oldCookie); // an attacker (or a stale tab) replays it
    expect((await getCurrentUser()).kind).toBe("anonymous");
  });

  it("see the same account from two browsers (two sessions, one canonical id)", async () => {
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    const first = await getCurrentUser();
    jar.clear();
    await signIn("me@example.com", PASSWORD, { ip: freshIp() });
    const second = await getCurrentUser();
    expect(second.userId).toBe(first.userId);
    expect(db.select().from(authSessions).all()).toHaveLength(2);
  });
});

describe("the anonymous cookie is never a way into an account", () => {
  it("is not honoured when it carries a registered account's id", async () => {
    await signUp("victim@example.com", PASSWORD, { ip: freshIp() });
    const accountId = (await getCurrentUser()).userId;
    jar.clear();
    jar.set(USER_COOKIE_NAME, accountId); // someone who learned the id presents it as an anonymous cookie
    const user = await getCurrentUser();
    expect(user.kind).toBe("anonymous");
    expect(user.userId).not.toBe(accountId);
    expect(jar.get(USER_COOKIE_NAME)).toBe(user.userId); // replaced with a fresh anonymous identity
    expect(kindOf(accountId)).toBe("registered");
  });

  it("is not honoured after its identity was merged into an account (tombstone)", async () => {
    await signUp("owner@example.com", PASSWORD, { ip: freshIp() });
    const accountId = (await getCurrentUser()).userId;
    db.insert(users).values({ id: ANON }).run();
    mergeUsers(db, { fromUserId: ANON, intoUserId: accountId });
    jar.clear();
    jar.set(USER_COOKIE_NAME, ANON); // the old anonymous cookie, still in some browser
    const user = await getCurrentUser();
    expect(user.kind).toBe("anonymous");
    expect(user.userId).not.toBe(ANON);
    expect(user.userId).not.toBe(accountId);
  });
});

describe("requireAuthenticated", () => {
  it("refuses an anonymous caller with 401 and returns the account for an authenticated one", async () => {
    await expect(requireAuthenticated()).rejects.toMatchObject({ status: 401, code: "not_authenticated" });
    jar.clear();
    await signUp("me@example.com", PASSWORD, { ip: freshIp() });
    await expect(requireAuthenticated()).resolves.toMatchObject({ kind: "authenticated", email: "me@example.com" });
  });
});
