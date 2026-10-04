import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN = "3";
  process.env.LIMIT_LOGIN_FAILURES_PER_IP_15MIN = "6";
  process.env.LIMIT_REGISTRATIONS_PER_IP_HOUR = "4";
  process.env.LIMIT_REGISTRATIONS_GLOBAL_HOUR = "100";
});
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);

import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { authAccounts, authSessions, users } from "@/server/db/schema";
import { PASSWORD, authRequest, signIn, signOut, signUp } from "../../../test/auth-helpers";
import { SESSION_COOKIE, jar } from "../../../test/next-headers-mock";
import { resetAuthLimitersForTesting } from "./auth-limits";

let db: Db;
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  resetAuthLimitersForTesting();
});
afterEach(() => setDbForTesting(undefined));

const json = (response: Response) => response.json() as Promise<Record<string, unknown>>;
const userRows = async () => await db.select().from(users).all();

describe("registration", () => {
  it("creates a registered account, hashes the password, and signs the user in with an HttpOnly cookie", async () => {
    const response = await signUp("Student@Example.com", PASSWORD, { ip: freshIp() });
    expect(response.status).toBe(200);

    const [user] = await userRows();
    expect(user).toMatchObject({ kind: "registered", email: "student@example.com", emailVerified: false, mergedIntoUserId: null }); // email lower-cased
    const account = (await db.select().from(authAccounts).get())!;
    expect(account).toMatchObject({ userId: user.id, providerId: "credential" });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD); // never plaintext
    expect(account.password!.length).toBeGreaterThan(60); // a salted hash, not the password
    expect(await db.select().from(authSessions).all()).toHaveLength(1);

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=\d+/); // expires: not a forever-cookie
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeLessThanOrEqual(7 * 24 * 3600);
  });

  it("does not put the session token, the user record or the password in the response body", async () => {
    const body = await json(await signUp("a@example.com", PASSWORD, { ip: freshIp() }));
    expect(body).toEqual({ ok: true });
    const [user] = await userRows();
    expect(JSON.stringify(body)).not.toContain(user.id);
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    const session = (await db.select().from(authSessions).get())!;
    expect(JSON.stringify(body)).not.toContain(session.token);
  });

  it("rejects a duplicate email regardless of case, without creating anything", async () => {
    await signUp("dup@example.com", PASSWORD, { ip: freshIp() });
    jar.clear();
    const again = await signUp("DUP@example.com", "another password 123", { ip: freshIp() });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.headers.getSetCookie().some((c) => c.startsWith(SESSION_COOKIE))).toBe(false);
    expect(await userRows()).toHaveLength(1);
    expect(await db.select().from(authAccounts).all()).toHaveLength(1);
    expect(await db.select().from(authSessions).all()).toHaveLength(1);
  });

  it("rejects invalid input: malformed email, short or oversized password, missing fields", async () => {
    const attempts: Record<string, unknown>[] = [
      { email: "not-an-email", password: PASSWORD, name: "x" },
      { email: "ok@example.com", password: "short", name: "x" },
      { email: "ok@example.com", password: "x".repeat(129), name: "x" },
      { email: "ok@example.com", name: "x" },
      { password: PASSWORD, name: "x" },
      {},
    ];
    for (const body of attempts) {
      const response = await authRequest("/sign-up/email", body, { ip: freshIp() });
      expect(response.status, JSON.stringify(Object.keys(body))).toBeGreaterThanOrEqual(400);
    }
    expect(await userRows()).toHaveLength(0);
    expect(await db.select().from(authSessions).all()).toHaveLength(0);
  });

  it("cannot be used to choose the new account's kind or id", async () => {
    const response = await authRequest("/sign-up/email", { email: "x@example.com", password: PASSWORD, name: "x", kind: "anonymous", id: "11111111-1111-4111-8111-111111111111" }, { ip: freshIp() });
    expect(response.status).toBe(200);
    const [user] = await userRows();
    expect(user.kind).toBe("registered");
    expect(user.id).not.toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("sign-in", () => {
  beforeEach(async () => {
    await signUp("user@example.com", PASSWORD, { ip: freshIp() });
    jar.clear();
  });

  it("signs in with the right password and issues a new session", async () => {
    const response = await signIn("USER@example.com", PASSWORD, { ip: freshIp() });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((c) => c.startsWith(SESSION_COOKIE))).toBe(true);
    expect(await db.select().from(authSessions).all()).toHaveLength(2); // the one from sign-up and this one
  });

  it("refuses a wrong password and an unknown email with the same answer, and creates no session", async () => {
    const wrong = await signIn("user@example.com", "not the password", { ip: freshIp() });
    const unknown = await signIn("nobody@example.com", PASSWORD, { ip: freshIp() });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await json(wrong)).toEqual(await json(unknown)); // no account enumeration at sign-in
    expect(await db.select().from(authSessions).all()).toHaveLength(1);
  });

  it("rotates the session on every sign-in and never adopts a token chosen by the client (no session fixation)", async () => {
    const first = await signIn("user@example.com", PASSWORD, { ip: freshIp(), cookie: `${SESSION_COOKIE}=attacker-chosen-token` });
    const second = await signIn("user@example.com", PASSWORD, { ip: freshIp(), cookie: `${SESSION_COOKIE}=attacker-chosen-token` });
    const tokens = (await db.select({ token: authSessions.token }).from(authSessions).all()).map((s) => s.token);
    expect(tokens).toHaveLength(3);
    expect(new Set(tokens).size).toBe(3);
    expect(tokens).not.toContain("attacker-chosen-token");
    for (const response of [first, second]) {
      const cookie = response.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
      expect(cookie).not.toContain("attacker-chosen-token");
    }
  });

  it("is rate limited after repeated FAILURES for one email (and success is not counted)", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) await signIn("user@example.com", PASSWORD, { ip }); // successes do not count
    for (let i = 0; i < 3; i++) expect((await signIn("user@example.com", "wrong password", { ip })).status).toBe(401);
    const blocked = await signIn("user@example.com", PASSWORD, { ip }); // even the right password is refused during lockout
    expect(blocked.status).toBe(429);
    expect((await json(blocked)).error).toMatchObject({ code: "login_rate_limited" });
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // A different email from a different address is unaffected.
    await signUp("other@example.com", PASSWORD, { ip: freshIp() });
    jar.clear();
    expect((await signIn("other@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200);
  });

  it("is rate limited per client address across different emails", async () => {
    const ip = freshIp();
    for (let i = 0; i < 6; i++) await signIn(`guess${i}@example.com`, "wrong password", { ip });
    const blocked = await signIn("user@example.com", PASSWORD, { ip });
    expect(blocked.status).toBe(429);
  });
});

describe("registration abuse limit", () => {
  it("limits accounts created per client address", async () => {
    const ip = freshIp();
    for (let i = 0; i < 4; i++) expect((await signUp(`bulk${i}@example.com`, PASSWORD, { ip })).status).toBe(200);
    const blocked = await signUp("bulk5@example.com", PASSWORD, { ip });
    expect(blocked.status).toBe(429);
    expect((await json(blocked)).error).toMatchObject({ code: "registration_rate_limited" });
    expect(await userRows()).toHaveLength(4);
  });
});

describe("sign-out", () => {
  it("deletes the server-side session and clears the cookie", async () => {
    await signUp("out@example.com", PASSWORD, { ip: freshIp() });
    expect(await db.select().from(authSessions).all()).toHaveLength(1);
    const response = await signOut();
    expect(response.status).toBe(200);
    expect(await db.select().from(authSessions).all()).toHaveLength(0);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("request hygiene", () => {
  it("refuses a cross-origin sign-in / sign-out (CSRF) even with valid credentials", async () => {
    await signUp("csrf@example.com", PASSWORD, { ip: freshIp() });
    jar.clear();
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const cross = (path: string, body: unknown) =>
      POST(new Request(`http://localhost/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "x-forwarded-for": freshIp() }, body: JSON.stringify(body) }));
    const signInResponse = await cross("/sign-in/email", { email: "csrf@example.com", password: PASSWORD });
    expect(signInResponse.status).toBeGreaterThanOrEqual(400);
    expect(signInResponse.headers.getSetCookie().some((c) => c.startsWith(SESSION_COOKIE))).toBe(false);
    expect(await db.select().from(authSessions).all()).toHaveLength(1); // only the one created at registration

    // Sign-out (forced logout) and sign-up are protected the same way; a browser-marked cross-site request without Origin too.
    jar.clear();
    await signIn("csrf@example.com", PASSWORD, { ip: freshIp() });
    const logout = await cross("/sign-out", {});
    expect(logout.status).toBe(403);
    expect(await db.select().from(authSessions).all()).toHaveLength(2); // the session survived
    const noOrigin = await POST(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site", "x-forwarded-for": freshIp() }, body: JSON.stringify({ email: "csrf@example.com", password: PASSWORD }) }));
    expect(noOrigin.status).toBe(403);
    // Same-origin requests, and non-browser clients (no Origin, no Fetch-Metadata), still work.
    const noBrowser = await POST(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": freshIp() }, body: JSON.stringify({ email: "csrf@example.com", password: PASSWORD }) }));
    expect(noBrowser.status).toBe(200);
  });

  it("refuses oversized request bodies before parsing them, with or without a Content-Length", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const big = JSON.stringify({ email: "a@example.com", password: "x".repeat(20_000), name: "a" });
    const honest = await POST(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", "content-length": String(big.length) }, body: big }));
    expect(honest.status).toBe(413);
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { chunks += 1; if (chunks > 2000) return controller.close(); controller.enqueue(new Uint8Array(4096)); } });
    const chunked = await POST(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: stream, duplex: "half" } as RequestInit));
    expect(chunked.status).toBe(413);
    expect(chunks).toBeLessThan(10);
    expect(await userRows()).toHaveLength(0);
  });
});

describe("surface area and secrets", () => {
  it("exposes only sign-up, sign-in and sign-out", async () => {
    const ip = freshIp();
    for (const path of ["/get-session", "/list-sessions", "/update-user", "/change-password", "/delete-user", "/revoke-sessions", "/sign-in/social", "/forget-password"]) {
      expect((await authRequest(path, {}, { ip })).status, path).toBe(404);
    }
    expect((await authRequest("/get-session", {}, { method: "GET" })).status).toBe(404);
  });

  it("never logs passwords or session tokens", async () => {
    const spies = (["log", "error", "warn", "info"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    try {
      const secretPassword = "super-secret-password-9917";
      await signUp("log@example.com", secretPassword, { ip: freshIp() });
      await signIn("log@example.com", "wrong-password-4412", { ip: freshIp() });
      await signIn("log@example.com", secretPassword, { ip: freshIp() });
      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" "))).join("\n");
      const tokens = (await db.select({ token: authSessions.token }).from(authSessions).all()).map((s) => s.token);
      for (const secret of [secretPassword, "wrong-password-4412", ...tokens]) expect(logged).not.toContain(secret);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
