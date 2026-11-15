import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const outbox = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const file = join(mkdtempSync(join(tmpdir(), "cefro-outbox-")), "outbox.jsonl");
  process.env.EMAIL_OUTBOX_FILE = file;
  process.env.LIMIT_LOGIN_FAILURES_PER_EMAIL_IP_15MIN = "3";
  return file;
});
vi.mock("next/headers", async () => (await import("../../../../test/next-headers-mock")).nextHeadersMock);

import { eq } from "drizzle-orm";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { authSessions, authVerifications } from "@/server/db/schema";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { emailMode } from "@/server/email/email";
import { passwordResetEmail } from "@/server/auth/password-reset";
import type { ServerEnv } from "@/server/config/env";
import { PASSWORD, signIn, signUp } from "../../../../test/auth-helpers";
import { jar } from "../../../../test/next-headers-mock";
import { POST as forgotPost } from "./forgot-password/route";
import { POST as resetPost } from "./reset-password/route";

let db: Db;
let ipCounter = 0;
const freshIp = () => `10.1.0.${++ipCounter}`;
const NEW_PASSWORD = "a brand new password 42";

function post(handler: (request: Request) => Promise<Response>, url: string, body: unknown, { ip = freshIp(), origin = "http://localhost" } = {}) {
  return handler(
    new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": ip }, body: JSON.stringify(body) }),
  );
}
const forgot = (email: unknown, options?: { ip?: string; origin?: string }) => post(forgotPost, "/api/account/forgot-password", { email }, options);
const reset = (token: unknown, newPassword: unknown, options?: { ip?: string }) => post(resetPost, "/api/account/reset-password", { token, newPassword }, options);

type Sent = { to: string; subject: string; text: string; html: string };
function sentEmails(): Sent[] {
  if (!existsSync(outbox)) return [];
  return readFileSync(outbox, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Sent);
}
let seen = 0;
/** Emails sent since the last call. */
function newEmails(): Sent[] {
  const all = sentEmails();
  const fresh = all.slice(seen);
  seen = all.length;
  return fresh;
}
function tokenFrom(email: Sent): string {
  const match = /http:\/\/localhost\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(email.text);
  expect(match, email.text).not.toBeNull();
  return decodeURIComponent(match![1]);
}

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  jar.clear();
  resetAuthLimitersForTesting();
  newEmails();
  await signUp("student@example.com", PASSWORD, { ip: freshIp() });
  jar.clear();
});
afterEach(() => setDbForTesting(undefined));

describe("Forgot password: asking for the link", () => {
  it("emails a one-time link to CEFRO's own /reset-password page, whatever case the address is typed in", async () => {
    const response = await forgot("  Student@Example.com ");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [email, ...more] = newEmails();
    expect(more).toHaveLength(0);
    expect(email.to).toBe("student@example.com");
    expect(email.subject).toBe("Reset your CEFRO password");
    expect(email.text).toContain("60 minutes");
    const token = tokenFrom(email);
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(email.html).toContain(`/reset-password?token=${token}`);
    expect(await db.select().from(authVerifications).all()).toHaveLength(1);
  });

  it("answers an unknown address exactly like a real one, and sends nothing (no account enumeration)", async () => {
    const real = await forgot("student@example.com");
    newEmails();
    const unknown = await forgot("nobody@example.com");
    expect(unknown.status).toBe(real.status);
    expect(await unknown.json()).toEqual(await real.json());
    expect(newEmails()).toHaveLength(0);
  });

  it("refuses something that is not an email address", async () => {
    for (const value of ["", "not-an-email", 42, null, "a@b", `${"x".repeat(250)}@example.com`]) {
      const response = await forgot(value);
      expect(response.status, String(value)).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_email");
    }
    expect(newEmails()).toHaveLength(0);
  });

  it("sends at most 3 emails per address per hour, so nobody can flood a classmate's inbox", async () => {
    for (let i = 0; i < 3; i++) expect((await forgot("student@example.com")).status).toBe(200);
    const fourth = await forgot("STUDENT@example.com");
    expect(fourth.status).toBe(429);
    expect((await fourth.json()).error.code).toBe("reset_rate_limited");
    expect(fourth.headers.get("Retry-After")).toBeTruthy();
    expect(newEmails()).toHaveLength(3);
  });

  it("refuses a request made from another site", async () => {
    const response = await forgot("student@example.com", { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(newEmails()).toHaveLength(0);
  });
});

describe("Forgot password: choosing the new password", () => {
  async function linkToken() {
    await forgot("student@example.com");
    return tokenFrom(newEmails()[0]);
  }

  it("sets the new password, signs the account out everywhere, and the old password stops working", async () => {
    await signIn("student@example.com", PASSWORD, { ip: freshIp() });
    expect((await db.select().from(authSessions).all()).length).toBeGreaterThan(0);
    const token = await linkToken();

    const response = await reset(token, NEW_PASSWORD);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await db.select().from(authSessions).all()).toHaveLength(0); // every device signed out
    jar.clear();
    expect((await signIn("student@example.com", PASSWORD, { ip: freshIp() })).status).toBe(401);
    expect((await signIn("student@example.com", NEW_PASSWORD, { ip: freshIp() })).status).toBe(200);
  });

  it("a link works once", async () => {
    const token = await linkToken();
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
    const again = await reset(token, "yet another password");
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("invalid_token");
    expect((await signIn("student@example.com", NEW_PASSWORD, { ip: freshIp() })).status).toBe(200);
  });

  it("an expired link is refused", async () => {
    const token = await linkToken();
    await db.update(authVerifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authVerifications.identifier, `reset-password:${token}`));
    const response = await reset(token, NEW_PASSWORD);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_token");
    expect((await signIn("student@example.com", PASSWORD, { ip: freshIp() })).status).toBe(200); // unchanged
  });

  it("a made-up or missing token is refused", async () => {
    for (const token of ["made-up-token", "", undefined, "x".repeat(500)]) {
      const response = await reset(token, NEW_PASSWORD);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_token");
    }
  });

  it("keeps the Create account password rules, and a refused password does not use up the link", async () => {
    const token = await linkToken();
    for (const password of ["short", "x".repeat(129), 12345678, undefined]) {
      const response = await reset(token, password);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_new_password");
    }
    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);
  });

  it("lifts the wrong-password lock, so a student who locked themselves out can sign in at once", async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) await signIn("student@example.com", "wrong password", { ip });
    expect((await signIn("student@example.com", PASSWORD, { ip })).status).toBe(429);
    const token = await linkToken();
    expect((await reset(token, NEW_PASSWORD, { ip })).status).toBe(200);
    expect((await signIn("student@example.com", NEW_PASSWORD, { ip })).status).toBe(200);
  });

  it("setting a new password cancels every other link still waiting in the inbox", async () => {
    const first = await linkToken();
    const second = await linkToken();
    expect((await reset(second, NEW_PASSWORD)).status).toBe(200);
    const older = await reset(first, "another password 1");
    expect(older.status).toBe(400);
    expect((await older.json()).error.code).toBe("invalid_token");
    expect(await db.select().from(authVerifications).all()).toHaveLength(0);
  });
});

describe("the email sender", () => {
  const env = (values: Partial<ServerEnv>) => ({ NODE_ENV: "production", EMAIL_PROVIDER: "auto", ...values }) as ServerEnv;
  const smtp = { SMTP_HOST: "smtp.gmail.com", SMTP_USER: "cefro.app@gmail.com", SMTP_PASSWORD: "app password" };

  it("uses SMTP only when host, user and password are all set; production otherwise sends nothing", () => {
    expect(emailMode(env(smtp))).toBe("smtp");
    expect(emailMode(env({ ...smtp, SMTP_PASSWORD: undefined }))).toBe("off");
    expect(emailMode(env({}))).toBe("off");
    expect(emailMode(env({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.gmail.com" }))).toBe("off");
    expect(emailMode(env({ ...smtp, EMAIL_PROVIDER: "off" }))).toBe("off");
  });

  it("never writes reset links to the log in production, even when asked to", () => {
    expect(emailMode(env({ EMAIL_PROVIDER: "log" }))).toBe("off");
    expect(emailMode(env({ NODE_ENV: "development", EMAIL_PROVIDER: "log" }))).toBe("log");
    expect(emailMode(env({ NODE_ENV: "development" }))).toBe("log");
    expect(emailMode(env({ NODE_ENV: "test" }))).toBe("log");
  });

  it("escapes the address and link in the HTML version", () => {
    const email = passwordResetEmail('a"<b>@example.com', "https://cefro.example/reset-password?token=abc&x=<y>");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("&lt;b&gt;");
    expect(email.html).toContain("token=abc&amp;x=&lt;y&gt;");
    expect(email.text).toContain("https://cefro.example/reset-password?token=abc&x=<y>");
  });
});
