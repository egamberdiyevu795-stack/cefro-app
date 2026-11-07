import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.setConfig({ testTimeout: 60_000 });

import { POST as postDelete } from "@/app/api/account/delete/route";
import { POST as postPassword } from "@/app/api/account/password/route";
import { getEnv } from "@/server/config/env";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { PASSWORD, signIn, signUp } from "../../../test/auth-helpers";
import { jar } from "../../../test/next-headers-mock";
import { resetAuthLimitersForTesting } from "./auth-limits";

/*
 * The sign-in and sign-up limits with their REAL defaults (no overrides in this file), for a classroom: 30 students
 * on one address (school Wi-Fi, a mobile network) sign up and sign in together; guessing one person's password stays
 * limited per account, from any number of addresses.
 */

// The auth library's own per-minute limiter is process-wide, so each test uses its own school address.
let school = 0;
let SCHOOL_WIFI = "";

beforeEach(async () => {
  SCHOOL_WIFI = `203.0.113.${++school}`;
  setDbForTesting(await openDatabase(":memory:"));
  resetAuthLimitersForTesting();
  jar.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTesting(undefined);
});

describe("the defaults", () => {
  it("sign-up 30 per hour per address, 300 in total; wrong passwords 5 per account and address, 20 per account, 100 per address per 15 minutes", () => {
    const env = getEnv();
    expect(env.LIMIT_REGISTRATIONS_PER_IP_HOUR).toBe(30);
    expect(env.LIMIT_REGISTRATIONS_GLOBAL_HOUR).toBe(300);
    expect(env.LIMIT_LOGIN_FAILURES_PER_EMAIL_IP_15MIN).toBe(5);
    expect(env.LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN).toBe(20);
    expect(env.LIMIT_LOGIN_FAILURES_PER_IP_15MIN).toBe(100);
  });
});

describe("a class of 30 on one address", () => {
  it("all 30 sign up within the hour; the 31st account from that address waits; another address is unaffected", async () => {
    for (let i = 1; i <= 30; i++) {
      jar.clear();
      expect((await signUp(`student${i}@example.com`, PASSWORD, { ip: SCHOOL_WIFI })).status, `student ${i}`).toBe(200);
    }
    jar.clear();
    const blocked = await signUp("student31@example.com", PASSWORD, { ip: SCHOOL_WIFI });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("registration_rate_limited");
    jar.clear();
    expect((await signUp("elsewhere@example.com", PASSWORD, { ip: "198.51.100.1" })).status).toBe(200);
  });

  it("everyone mistypes their password twice, then signs in: nobody is locked out", async () => {
    for (let i = 1; i <= 30; i++) {
      jar.clear();
      await signUp(`s${i}@example.com`, PASSWORD, { ip: `10.1.0.${i}` });
    }
    for (let i = 1; i <= 30; i++) {
      jar.clear();
      for (let typo = 0; typo < 2; typo++) expect((await signIn(`s${i}@example.com`, "typo typo typo", { ip: SCHOOL_WIFI })).status).toBe(401);
      expect((await signIn(`s${i}@example.com`, PASSWORD, { ip: SCHOOL_WIFI })).status, `student ${i}`).toBe(200);
    }
  });

  it("one student guessing a classmate's password is stopped after 5 tries; the rest of the class still signs in", async () => {
    for (const name of ["victim", "classmate"]) {
      jar.clear();
      await signUp(`${name}@example.com`, PASSWORD, { ip: `10.2.0.${name.length}` });
    }
    jar.clear();
    for (let i = 0; i < 5; i++) expect((await signIn("victim@example.com", `guess ${i}`, { ip: SCHOOL_WIFI })).status).toBe(401);
    expect((await signIn("victim@example.com", "guess 6", { ip: SCHOOL_WIFI })).status).toBe(429);
    // Even the right password waits for the window: the limit is on the account.
    expect((await signIn("victim@example.com", PASSWORD, { ip: SCHOOL_WIFI })).status).toBe(429);
    // The same address, another account: fine.
    expect((await signIn("classmate@example.com", PASSWORD, { ip: SCHOOL_WIFI })).status).toBe(200);
  });

  it("a prank: a classmate failing 5 times from their own phone locks the account only there; the owner signs in elsewhere", async () => {
    await signUp("owner@example.com", PASSWORD, { ip: "10.3.0.1" });
    jar.clear();
    const prankPhone = "192.0.2.10";
    for (let i = 0; i < 5; i++) expect((await signIn("owner@example.com", `prank ${i}`, { ip: prankPhone })).status).toBe(401);
    expect((await signIn("owner@example.com", "prank 5", { ip: prankPhone })).status).toBe(429);
    expect((await signIn("owner@example.com", PASSWORD, { ip: prankPhone })).status).toBe(429);
    // The owner, on their own connection, is not locked out.
    expect((await signIn("owner@example.com", PASSWORD, { ip: "198.51.100.7" })).status).toBe(200);
  });

  it("guesses spread over many addresses: 20 per account in total, then every address waits", async () => {
    await signUp("target@example.com", PASSWORD, { ip: "10.3.0.2" });
    jar.clear();
    // 4 wrong guesses from each of 5 addresses: under the per-address limit everywhere, 20 in total.
    for (let i = 0; i < 20; i++) expect((await signIn("target@example.com", `guess ${i}`, { ip: `192.0.2.${100 + Math.floor(i / 4)}` })).status, `guess ${i}`).toBe(401);
    expect((await signIn("target@example.com", "guess 20", { ip: "192.0.2.200" })).status).toBe(429);
    expect((await signIn("target@example.com", PASSWORD, { ip: "198.51.100.8" })).status).toBe(429);
  });

  it("one address trying many accounts is still stopped (100 failures per 15 minutes)", async () => {
    for (let i = 0; i < 100; i++) await signIn(`nobody${i}@example.com`, "wrong", { ip: SCHOOL_WIFI });
    expect((await signIn("nobody-else@example.com", "wrong", { ip: SCHOOL_WIFI })).status).toBe(429);
    expect((await signIn("nobody-else@example.com", "wrong", { ip: "198.51.100.2" })).status).toBe(401);
  });

  it("Change password, Delete my account and sign-in share one counter per account (and per account + address)", async () => {
    await signUp("pat@example.com", PASSWORD, { ip: "10.4.0.1" });
    const session = new Map(jar);
    const post = (url: string, body: unknown, ip: string) =>
      new Request(`http://localhost${url}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      });
    const change = (currentPassword: string, ip: string) => postPassword(post("/api/account/password", { currentPassword, newPassword: "a long new password" }, ip));
    const remove = (password: string, ip: string) => postDelete(post("/api/account/delete", { password, confirm: "DELETE" }, ip));
    const restore = () => {
      jar.clear();
      for (const [k, v] of session) jar.set(k, v);
    };

    // From one address: 2 wrong on Change password, 1 on Delete, 2 at sign-in = 5: that address waits on all three.
    const home = "10.4.0.2";
    for (let i = 0; i < 2; i++) expect((await change(`wrong ${i}`, home)).status).toBe(400);
    expect((await remove("wrong", home)).status).toBe(400);
    jar.clear();
    for (let i = 0; i < 2; i++) expect((await signIn("pat@example.com", `wrong ${i}`, { ip: home })).status).toBe(401);
    expect((await signIn("pat@example.com", PASSWORD, { ip: home })).status).toBe(429);
    restore();
    expect((await change(PASSWORD, home)).status).toBe(429);
    expect((await remove(PASSWORD, home)).status).toBe(429);
    // Another address still works for now.
    jar.clear();
    expect((await signIn("pat@example.com", PASSWORD, { ip: "10.4.0.3" })).status).toBe(200);

    // The account's total (20, any address) counts all three routes: 15 more wrong ones, 3 per address, then all wait.
    restore();
    for (let i = 0; i < 15; i++) {
      const ip = `10.4.1.${Math.floor(i / 3)}`;
      expect((await (i % 2 ? change(`w${i}`, ip) : remove(`w${i}`, ip))).status, `wrong ${i}`).toBe(400);
    }
    jar.clear();
    expect((await signIn("pat@example.com", PASSWORD, { ip: "10.4.9.9" })).status).toBe(429);
    restore();
    expect((await change(PASSWORD, "10.4.9.9")).status).toBe(429);
  });
});

describe("the trusted-IP rule is kept (claude/profile-settings): a spoofed x-forwarded-for never adds sign-ups", () => {
  it("on Vercel only x-real-ip counts: 30 from one real address, then 429, whatever x-forwarded-for says", async () => {
    vi.stubEnv("VERCEL", "1");
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      jar.clear();
      const response = await POST(
        new Request("http://localhost/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost", "x-real-ip": SCHOOL_WIFI, "x-forwarded-for": `6.6.6.${i}` },
          body: JSON.stringify({ email: `vercel-${i}@example.com`, password: PASSWORD, name: "x" }),
        }),
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
