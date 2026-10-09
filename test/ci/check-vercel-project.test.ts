import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateVercelProject } from "../../scripts/ci/check-vercel-project.mjs";

const ok = {
  project: { link: { type: "github", productionBranch: "main" } },
  envs: [
    { key: "TURSO_DATABASE_URL", target: ["production"] },
    { key: "TURSO_AUTH_TOKEN", target: ["production"] },
    { key: "GEMINI_API_KEY", target: ["production", "preview", "development"] },
  ],
};

describe("evaluateVercelProject", () => {
  it("accepts Production-only database credentials and production branch main", () => {
    expect(evaluateVercelProject(ok)).toEqual({ problems: [], warnings: [] });
  });

  it("refuses database credentials that Preview or Development can read (a Preview must not touch the production database)", () => {
    const envs = [
      { key: "TURSO_DATABASE_URL", target: ["production", "preview", "development"] },
      { key: "TURSO_AUTH_TOKEN", target: ["production", "preview"] },
    ];
    const { problems } = evaluateVercelProject({ ...ok, envs });
    expect(problems.join("\n")).toMatch(/TURSO_DATABASE_URL is also available to preview and development/);
    expect(problems.join("\n")).toMatch(/TURSO_AUTH_TOKEN is also available to preview/);
  });

  it("refuses a branch-specific Preview copy of the credentials unless a separate Preview database is declared", () => {
    const envs = [...ok.envs, { key: "TURSO_AUTH_TOKEN", target: ["preview"], gitBranch: "staging" }];
    expect(evaluateVercelProject({ ...ok, envs }).problems.join("\n")).toMatch(/TURSO_AUTH_TOKEN is also available to preview/);
    expect(evaluateVercelProject({ ...ok, envs, allowPreviewTurso: true }).problems).toEqual([]);
  });

  it("refuses missing Production credentials", () => {
    const { problems } = evaluateVercelProject({ ...ok, envs: [{ key: "TURSO_DATABASE_URL", target: ["preview"] }] });
    expect(problems.join("\n")).toMatch(/TURSO_DATABASE_URL is not set for the Production/);
    expect(problems.join("\n")).toMatch(/TURSO_AUTH_TOKEN is not set for the Production/);
  });

  it("refuses a production branch other than main (it would deploy from a push, bypassing the pipeline)", () => {
    const { problems } = evaluateVercelProject({ ...ok, project: { link: { productionBranch: "claude/zen-darwin-5vgl0z" } } });
    expect(problems.join("\n")).toMatch(/production branch is "claude\/zen-darwin-5vgl0z", not "main"/);
  });

  it("warns, but does not fail, when the API does not expose the production branch", () => {
    const { problems, warnings } = evaluateVercelProject({ ...ok, project: {} });
    expect(problems).toEqual([]);
    expect(warnings.join("\n")).toMatch(/Branch Tracking/);
  });
});

/** The real script, against a local stand-in for the Vercel API. */
describe("scripts/ci/check-vercel-project.mjs", () => {
  const TOKEN = "vercel-token-secret-0123456789";

  function run(handler: (url: string, auth: string | undefined) => { status: number; body: unknown }) {
    const seen: string[] = [];
    const server = http.createServer((req, res) => {
      seen.push(`${req.url} ${req.headers.authorization === `Bearer ${TOKEN}` ? "authorised" : "no-auth"}`);
      const { status, body } = handler(req.url ?? "", req.headers.authorization);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
    return new Promise<{ code: number; out: string; seen: string[] }>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        // The script talks to https://api.vercel.com; a tiny preload redirects that origin to the stand-in server.
        const preload = `const f=globalThis.fetch;globalThis.fetch=(u,i)=>f(String(u).replace("https://api.vercel.com","http://127.0.0.1:${port}"),i);`;
        execFile(
          process.execPath,
          ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, path.join(process.cwd(), "scripts/ci/check-vercel-project.mjs")],
          { env: { PATH: process.env.PATH, VERCEL_TOKEN: TOKEN, VERCEL_PROJECT_ID: "prj_123", VERCEL_ORG_ID: "team_456" } as unknown as NodeJS.ProcessEnv, timeout: 30_000 },
          (error, stdout, stderr) => {
            server.close();
            resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}`, seen });
          },
        );
      });
    });
  }

  const good = (url: string) => ({ status: 200, body: url.includes("/env") ? { envs: ok.envs } : ok.project });

  it("passes for a safe project, authenticating with the bearer token and addressing the team", async () => {
    const result = await run(good);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/check-vercel-project: OK/);
    expect(result.seen.every((s) => s.endsWith("authorised"))).toBe(true);
    expect(result.seen.join("\n")).toContain("teamId=team_456");
    expect(result.out).not.toContain(TOKEN);
  });

  it("fails with an actionable message when Preview can read the credentials", async () => {
    const result = await run((url) => (url.includes("/env") ? { status: 200, body: { envs: [{ key: "TURSO_DATABASE_URL", target: ["production", "preview"] }, { key: "TURSO_AUTH_TOKEN", target: ["production"] }] } } : good(url)));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/untick everything except Production/);
    expect(result.out).not.toContain(TOKEN);
  });

  it("fails closed on an API error without printing the token", async () => {
    const result = await run(() => ({ status: 403, body: {} }));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/HTTP 403/);
    expect(result.out).toMatch(/VERCEL_TOKEN/);
    expect(result.out).not.toContain(TOKEN);
  });
});
