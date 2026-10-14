import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isHealthyBody, waitForHealthy } from "../../scripts/ci/post-deploy-check.mjs";

// These tests start real child processes (node, git); give them room when the whole suite is running in parallel.
vi.setConfig({ testTimeout: 30_000 });

const TOKEN = "vercel-token-secret-0123456789";
const DEPLOYMENT = "https://cefro-abc123-team.vercel.app";
const ALIAS = "cefro.example.test";

afterEach(() => vi.restoreAllMocks());

type Responder = (url: string) => { status: number; body?: object; raw?: string };

function stubFetch(respond: Responder) {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    const { status, body, raw } = respond(url);
    return new Response(raw ?? JSON.stringify(body ?? {}), { status, headers: { "content-type": "application/json" } });
  });
  return urls;
}

const ready = { readyState: "READY", aliasAssigned: 1, alias: [ALIAS] };
const run = () => waitForHealthy({ deploymentUrl: DEPLOYMENT, token: TOKEN, orgId: "team_1", attempts: 2, delayMs: 1, log: () => {} });

describe("post-deploy health check", () => {
  it("accepts only the exact healthy body", () => {
    expect(isHealthyBody({ status: "ok" })).toBe(true);
    for (const body of [{ status: "unavailable" }, { status: "OK" }, {}, null, "ok", [], { ok: true }]) expect(isHealthyBody(body)).toBe(false);
  });

  it("passes when the deployment is ready, assigned to its domain, and the domain's /api/health says ok", async () => {
    const urls = stubFetch((url) => (url.includes("api.vercel.com") ? { status: 200, body: ready } : { status: 200, body: { status: "ok" } }));
    expect(await run()).toEqual({ ok: true, alias: ALIAS });
    expect(urls[0]).toContain("/v13/deployments/cefro-abc123-team.vercel.app?teamId=team_1");
    expect(urls).toContain(`https://${ALIAS}/api/health`);
  });

  it("fails when the health endpoint keeps reporting a problem (the new release cannot use its database)", async () => {
    stubFetch((url) => (url.includes("api.vercel.com") ? { status: 200, body: ready } : { status: 503, body: { status: "unavailable" } }));
    const result = await run();
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("HTTP 503");
  });

  it("fails on an unexpected body, a redirect, or a request that cannot be made", async () => {
    stubFetch((url) => (url.includes("api.vercel.com") ? { status: 200, body: ready } : { status: 200, raw: "<html>login</html>" }));
    expect(await run()).toMatchObject({ ok: false });
    stubFetch((url) => (url.includes("api.vercel.com") ? { status: 200, body: ready } : { status: 401, body: {} }));
    expect(JSON.stringify(await run())).toContain("HTTP 401");
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("api.vercel.com")) return new Response(JSON.stringify(ready));
      throw new Error("connect ECONNREFUSED");
    });
    expect(JSON.stringify(await run())).toContain("request failed");
  });

  it("fails when the deployment ended in an error or was never assigned to a domain", async () => {
    stubFetch(() => ({ status: 200, body: { readyState: "ERROR", alias: [] } }));
    expect(await run()).toEqual({ ok: false, reason: "the deployment ended in state ERROR" });
    stubFetch(() => ({ status: 200, body: { readyState: "READY", aliasAssigned: false, alias: [] } }));
    expect(await run()).toEqual({ ok: false, reason: "the deployment was not assigned to a production domain in time" });
  });

  it("rejects when the Vercel API refuses the token, without including the token", async () => {
    stubFetch(() => ({ status: 403 }));
    const error = (await run().catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/HTTP 403.*VERCEL_TOKEN/);
    expect(error.message).not.toContain(TOKEN);
  });
});

/** The real script: exit codes and what it tells the person watching the run. */
describe("scripts/ci/post-deploy-check.mjs", () => {
  function runScript(healthStatus: number) {
    const server = http.createServer((req, res) => {
      const isApi = req.url?.startsWith("/v13/deployments/");
      res.writeHead(isApi ? 200 : healthStatus, { "content-type": "application/json" });
      res.end(JSON.stringify(isApi ? ready : { status: healthStatus === 200 ? "ok" : "unavailable" }));
    });
    return new Promise<{ code: number; out: string }>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        const preload = `const f=globalThis.fetch;globalThis.fetch=(u,i)=>f(String(u).replace("https://api.vercel.com","http://127.0.0.1:${port}").replace("https://${ALIAS}","http://127.0.0.1:${port}"),i);`;
        execFile(
          process.execPath,
          ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, path.join(process.cwd(), "scripts/ci/post-deploy-check.mjs"), DEPLOYMENT],
          { env: { PATH: process.env.PATH, VERCEL_TOKEN: TOKEN, VERCEL_ORG_ID: "team_1", CEFRO_HEALTH_ATTEMPTS: "2", CEFRO_HEALTH_DELAY_MS: "1" } as unknown as NodeJS.ProcessEnv, timeout: 30_000 },
          (error, stdout, stderr) => {
            server.close();
            resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` });
          },
        );
      });
    });
  }

  it("exits 0 and says the release is healthy", async () => {
    const result = await runScript(200);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/post-deploy-check: OK/);
    expect(result.out).not.toContain(TOKEN);
  });

  it("exits 1 on an unhealthy release and states plainly that nothing is rolled back", async () => {
    const result = await runScript(503);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/live but unhealthy/);
    expect(result.out).toMatch(/NOT rolled back/);
    expect(result.out).toMatch(/vercel rollback/);
    expect(result.out).not.toMatch(/automatically (rolled|restored)/i);
    expect(result.out).not.toContain(TOKEN);
  });

  it("exits 1 without arguments or token", async () => {
    const result = await new Promise<{ code: number }>((resolve) => {
      execFile(process.execPath, [path.join(process.cwd(), "scripts/ci/post-deploy-check.mjs")], { env: { PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv }, (error) => resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0 }));
    });
    expect(result.code).toBe(1);
  });
});
