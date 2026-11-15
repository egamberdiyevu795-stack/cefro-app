import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LIMIT_REGISTRATIONS_PER_IP_HOUR = "3";
  process.env.LIMIT_REGISTRATIONS_GLOBAL_HOUR = "100";
});
vi.mock("next/headers", async () => (await import("../../../test/next-headers-mock")).nextHeadersMock);

import { openDatabase, setDbForTesting } from "@/server/db/client";
import { jar } from "../../../test/next-headers-mock";
import { clientIp, isTestRun, resetAuthLimitersForTesting } from "./auth-limits";

/*
 * The per-IP limits count the address a trusted proxy reports (Vercel's x-real-ip), never one the visitor sends.
 * Tests may choose their address with x-forwarded-for, but only in a test run.
 */

const request = (headers: Record<string, string>) => new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers });
const SPOOF = { "x-forwarded-for": "6.6.6.6" };

describe("clientIp", () => {
  it("on Vercel: x-real-ip only; x-forwarded-for is ignored, in production and on a Preview", () => {
    for (const NODE_ENV of ["production", "test", "development"]) {
      const env = { NODE_ENV, VERCEL: "1", CEFRO_TEST_CLIENT_IP: "1" };
      expect(clientIp(request({ "x-real-ip": "203.0.113.7", ...SPOOF }), env)).toBe("203.0.113.7");
      expect(clientIp(request(SPOOF), env)).toBe("unknown");
    }
  });

  it("a production build off Vercel ignores x-forwarded-for, even with the test switch set", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", CEFRO_TEST_CLIENT_IP: "1" }]) {
      expect(clientIp(request({ ...SPOOF, "x-real-ip": "1.2.3.4" }), env)).toBe("unknown");
      expect(isTestRun(env)).toBe(false);
    }
  });

  it("next dev without the test switch ignores it too", () => {
    expect(clientIp(request(SPOOF), { NODE_ENV: "development" })).toBe("unknown");
  });

  it("test runs only (vitest, or the browser tests' server with CEFRO_TEST_CLIENT_IP=1) may choose the address", () => {
    expect(clientIp(request({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }), { NODE_ENV: "test" })).toBe("10.0.0.1");
    expect(clientIp(request(SPOOF), { NODE_ENV: "development", CEFRO_TEST_CLIENT_IP: "1" })).toBe("6.6.6.6");
  });
});

describe("the sign-up limit outside test runs: a new spoofed x-forwarded-for on every request does not reset it", () => {
  beforeEach(async () => {
    setDbForTesting(await openDatabase(":memory:"));
    resetAuthLimitersForTesting();
    jar.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbForTesting(undefined);
  });

  it.each([
    ["on Vercel (one real client, x-real-ip)", { VERCEL: "1" }, { "x-real-ip": "198.51.100.9" }],
    ["off Vercel, not a test run (every caller is one client)", { NODE_ENV: "development" }, {}],
  ] as const)("%s", async (_name, env, trusted) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      jar.clear();
      const response = await POST(
        new Request("http://localhost/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost", ...trusted, "x-forwarded-for": `6.6.6.${i}` },
          body: JSON.stringify({ email: `spoof-${i}-${Date.now()}@example.com`, password: "correct horse battery staple", name: "x" }),
        }),
      );
      statuses.push(response.status);
    }
    // The limit is 3 per address per hour: the 4th and 5th are refused although each claimed a new address.
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("control: in a test run, each x-forwarded-for counts as its own client (the seam the tests use)", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      jar.clear();
      const response = await POST(
        new Request("http://localhost/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost", "x-forwarded-for": `10.9.9.${i}` },
          body: JSON.stringify({ email: `seam-${i}-${Date.now()}@example.com`, password: "correct horse battery staple", name: "x" }),
        }),
      );
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });
});
