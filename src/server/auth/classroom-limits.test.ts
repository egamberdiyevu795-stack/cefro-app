import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);
vi.setConfig({ testTimeout: 60_000 });

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
  it("sign-up 30 per hour per address, 300 in total; failed sign-ins 5 per account and 100 per address per 15 minutes", () => {
    const env = getEnv();
    expect(env.LIMIT_REGISTRATIONS_PER_IP_HOUR).toBe(30);
    expect(env.LIMIT_REGISTRATIONS_GLOBAL_HOUR).toBe(300);
    expect(env.LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN).toBe(5);
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

  it("the per-account limit holds whatever address the guesses come from", async () => {
    await signUp("target@example.com", PASSWORD, { ip: "10.3.0.1" });
    jar.clear();
    for (let i = 0; i < 5; i++) expect((await signIn("target@example.com", `guess ${i}`, { ip: `192.0.2.${i + 1}` })).status).toBe(401);
    expect((await signIn("target@example.com", "guess 5", { ip: "192.0.2.99" })).status).toBe(429);
  });

  it("one address trying many accounts is still stopped (100 failures per 15 minutes)", async () => {
    for (let i = 0; i < 100; i++) await signIn(`nobody${i}@example.com`, "wrong", { ip: SCHOOL_WIFI });
    expect((await signIn("nobody-else@example.com", "wrong", { ip: SCHOOL_WIFI })).status).toBe(429);
    expect((await signIn("nobody-else@example.com", "wrong", { ip: "198.51.100.2" })).status).toBe(401);
  });

  it("wrong passwords on Change password count against the same account as failed sign-ins", async () => {
    await signUp("pat@example.com", PASSWORD, { ip: "10.4.0.1" });
    const body = (currentPassword: string) =>
      new Request("http://localhost/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ currentPassword, newPassword: "a long new password" }),
      });
    for (let i = 0; i < 3; i++) expect((await postPassword(body(`wrong ${i}`))).status).toBe(400);
    const session = new Map(jar);
    jar.clear();
    for (let i = 0; i < 2; i++) expect((await signIn("pat@example.com", `wrong ${i}`, { ip: "10.4.0.2" })).status).toBe(401);
    expect((await signIn("pat@example.com", PASSWORD, { ip: "10.4.0.3" })).status).toBe(429);
    for (const [k, v] of session) jar.set(k, v);
    expect((await postPassword(body(PASSWORD))).status).toBe(429);
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
