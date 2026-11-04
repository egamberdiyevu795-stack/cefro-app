import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { TASK_ID, assertAllowedBase, readSetCookies, smoke } from "../../scripts/ci/production-smoke.mjs";

const BASE = "https://cefro-app-mgm6.vercel.app";

describe("assertAllowedBase", () => {
  it("accepts only a plain https *.vercel.app address", () => {
    expect(assertAllowedBase(BASE)).toBe(BASE);
    expect(assertAllowedBase(`${BASE}/`)).toBe(BASE);
    for (const bad of ["http://x.vercel.app", "https://example.com", "https://x.vercel.app.evil.com", "https://u:p@x.vercel.app", "https://x.vercel.app:8443", "https://x.vercel.app/path", "https://x.vercel.app/?a=1", "nonsense", ""]) {
      expect(() => assertAllowedBase(bad), bad).toThrow();
    }
  });
});

describe("readSetCookies", () => {
  it("reads names, values and the attributes that matter, from several Set-Cookie headers", () => {
    const headers = new Headers();
    headers.append("set-cookie", "cefro_uid=abc; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=lax");
    headers.append("set-cookie", "other=1; Path=/");
    const cookies = readSetCookies({ headers } as Response);
    expect(cookies).toEqual([
      { name: "cefro_uid", value: "abc", secure: true, sameSite: "lax" },
      { name: "other", value: "1", secure: false, sameSite: undefined },
    ]);
  });
});

/** A stand-in for CEFRO as seen through fetch, with switches for the failure modes this test exists to tell apart. */
function fakeApp(mode: "healthy" | "attempt-404" | "cookie-never-kept" | "identity-churn") {
  const attempts = new Map<string, string>();
  let counter = 0;
  const newIdentity = () => `identity-${++counter}`;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const cookie = /cefro_uid=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
    const out = new Headers({ "x-vercel-id": "iad1::abcde-123" });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: out });
    const setIdentity = () => {
      const id = newIdentity();
      out.append("set-cookie", `cefro_uid=${id}; Path=/; Secure; HttpOnly; SameSite=lax`);
      return id;
    };
    if (url.pathname.startsWith("/practice/")) {
      if (mode !== "cookie-never-kept") setIdentity();
      return new Response("<html></html>", { status: 200, headers: out });
    }
    // Every API call from a visitor without a (kept) cookie is a new identity, exactly like the real server.
    let identity = cookie;
    if (!identity || mode === "identity-churn") identity = setIdentity();
    if (url.pathname === "/api/account/me") return json(200, { kind: "anonymous" });
    if (url.pathname === "/api/sessions") return json(201, { sessionId: "33333333-3333-4333-8333-333333333333" });
    if (url.pathname === "/api/speaking/attempts") {
      const id = `44444444-4444-4444-8444-44444444444${attempts.size}`;
      attempts.set(id, identity);
      return json(201, { attempt: { id, status: "processing" } });
    }
    const m = /^\/api\/speaking\/attempts\/(.+)$/.exec(url.pathname);
    if (m) {
      const owner = attempts.get(m[1]);
      if (mode === "attempt-404" || owner !== identity) return json(404, { error: { code: "attempt_not_found" } });
      return json(200, { attempt: { status: "failed", failure: { code: "transcription_empty" } } });
    }
    return json(404, {});
  }) as typeof fetch;
  return fetchImpl;
}

const run = (mode: Parameters<typeof fakeApp>[0]) => {
  const lines: string[] = [];
  return smoke({ base: BASE, fetchImpl: fakeApp(mode), log: (l) => lines.push(l), polls: 3, pollDelayMs: 1 }).then((result) => ({ result, text: lines.join("\n") }));
};

describe("smoke (the visitor flow)", () => {
  it("a healthy server: the cookie is kept, the identity never changes, and the attempt is visible to its owner", async () => {
    const { result, text } = await run("healthy");
    expect(result).toMatchObject({ cookieKept: true, attemptVisible: true, identityChanges: 0, statuses: [200, 200, 200] });
    expect(text).toContain("attempt visible to the identity that created it: yes");
    expect(text).toMatch(/6\. GET attempt WITHOUT the cookie.*HTTP 404/); // another visitor cannot see it
    expect(text).toContain("[iad1]");
  });

  it("a server that loses the attempt: the cookie is fine but the poll is a 404 (a server-side problem)", async () => {
    const { result, text } = await run("attempt-404");
    expect(result).toMatchObject({ cookieKept: true, attemptVisible: false, identityChanges: 0 });
    expect(result.statuses).toEqual([404, 404, 404]);
    expect(text).toContain("error code: attempt_not_found");
    expect(text).toContain("attempt visible to the identity that created it: NO");
  });

  it("a cookie that is never handed out: reported, and the attempt is a 404 to the next request (every request a new visitor)", async () => {
    const { result, text } = await run("cookie-never-kept");
    expect(result.cookieKept).toBe(false);
    expect(text).toContain("no identity cookie came back with the page");
    expect(text).toContain("cookie kept after the page: NO");
  });

  it("an identity that changes on every response: counted, and the attempt is not visible to the next identity", async () => {
    const { result, text } = await run("identity-churn");
    expect(result.identityChanges).toBeGreaterThan(0);
    expect(result.attemptVisible).toBe(false);
    expect(text).toContain("CHANGED identity");
  });

  it("never prints a cookie value or an attempt id", async () => {
    const { text } = await run("healthy");
    expect(text).not.toMatch(/identity-\d/);
    expect(text).not.toContain("44444444-4444");
    expect(text).not.toContain("33333333-3333");
  });

  it("tests the real task", () => {
    expect(TASK_ID).toBe("b2-part2-advice-from-someone");
  });
});

describe(".github/workflows/production-smoke.yml", () => {
  const text = fs.readFileSync(path.join(process.cwd(), ".github/workflows/production-smoke.yml"), "utf8");
  const wf = parse(text) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, { environment?: string; steps: { run?: string; env?: Record<string, string> }[] }> };

  it("is manual, read-only, needs no secrets and no environment, and passes the address through env (never into the script text)", () => {
    expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(text).not.toMatch(/\$\{\{\s*secrets\./);
    expect(wf.jobs.smoke.environment).toBeUndefined();
    const step = wf.jobs.smoke.steps.find((s) => (s.run ?? "").includes("production-smoke.mjs"));
    expect(step?.run).toBe('node scripts/ci/production-smoke.mjs "$SMOKE_URL"');
    expect(step?.env?.SMOKE_URL).toBe("${{ inputs.url }}");
  });
});
