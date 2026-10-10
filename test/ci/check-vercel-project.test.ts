import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateVercelProject } from "../../scripts/ci/check-vercel-project.mjs";

const REPO = { githubRepository: "Owner/Cefro-App", githubRepositoryId: "123456" };
const ok = {
  ...REPO,
  project: { link: { type: "github", org: "owner", repo: "cefro-app", repoId: 123456, productionBranch: "main" } },
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

  describe("the Vercel project belongs to this repository", () => {
    const withLink = (link: object, extra: object = {}) => evaluateVercelProject({ ...ok, ...extra, project: { link: { type: "github", productionBranch: "main", ...link } } });

    it("passes when the repository id matches, or the organisation and repository name match (case-insensitively)", () => {
      expect(withLink({ repoId: 123456 }).problems).toEqual([]);
      expect(withLink({ repoId: "123456" }).problems).toEqual([]);
      expect(withLink({ org: "OWNER", repo: "cefro-APP" }).problems).toEqual([]);
    });

    it("refuses a project connected to another repository (by id or by name), even if the other identifier matches", () => {
      expect(withLink({ repoId: 999 }).problems.join("\n")).toMatch(/different GitHub repository/);
      expect(withLink({ org: "someone-else", repo: "cefro-app" }).problems.join("\n")).toMatch(/connected to "someone-else\/cefro-app", not "owner\/cefro-app"/);
      expect(withLink({ repoId: 123456, org: "owner", repo: "other-app" }).problems.join("\n")).toMatch(/other-app/);
      expect(withLink({ repoId: 999, org: "owner", repo: "cefro-app" }).problems.join("\n")).toMatch(/repository id mismatch/);
    });

    it("refuses a project connected to another Git provider", () => {
      expect(withLink({ type: "gitlab", repoId: 123456 }).problems.join("\n")).toMatch(/not GitHub/);
    });

    it("does not treat a missing repository in the API response as success: it stops unless a person recorded the confirmation", () => {
      const refused = withLink({});
      expect(refused.problems.join("\n")).toMatch(/cannot be verified that this is the right project/);
      expect(refused.problems.join("\n")).toMatch(/CEFRO_VERCEL_PROJECT_REPO/);
      const noLink = evaluateVercelProject({ ...ok, project: {}, githubDefaultBranch: "main" });
      expect(noLink.problems.join("\n")).toMatch(/cannot be verified/);
    });

    it("accepts the recorded manual confirmation only when it names exactly this repository, and still warns", () => {
      const accepted = withLink({}, { acknowledgedRepository: "owner/cefro-app" });
      expect(accepted.problems).toEqual([]);
      expect(accepted.warnings.join("\n")).toMatch(/relying on the recorded manual confirmation/);
      for (const wrong of ["owner/other", "", undefined, "true", "yes"]) {
        expect(withLink({}, { acknowledgedRepository: wrong }).problems.join("\n"), String(wrong)).toMatch(/cannot be verified/);
      }
    });

    it("a manual confirmation never overrides a repository the API says is different", () => {
      expect(withLink({ repoId: 999 }, { acknowledgedRepository: "owner/cefro-app" }).problems.join("\n")).toMatch(/different GitHub repository/);
      expect(withLink({ org: "x", repo: "y" }, { acknowledgedRepository: "owner/cefro-app" }).problems.join("\n")).toMatch(/not "owner\/cefro-app"/);
    });

    it("keeps every other check in force (branch, credential scope, deploy hooks)", () => {
      const all = evaluateVercelProject({
        ...ok,
        envs: [{ key: "TURSO_DATABASE_URL", target: ["production", "preview"] }, { key: "TURSO_AUTH_TOKEN", target: ["production"] }],
        project: { link: { type: "github", repoId: 123456, productionBranch: "staging", deployHooks: [{ id: "h" }] } },
      });
      const text = all.problems.join("\n");
      expect(text).toMatch(/also available to preview/);
      expect(text).toMatch(/production branch is "staging"/);
      expect(text).toMatch(/Deploy Hook/);
    });
  });

  describe("fail-closed production branch", () => {
    const unknown = { link: { type: "github", org: "owner", repo: "cefro-app", repoId: 123456 } };

    it("an unknown production branch is accepted only when the GitHub default branch is verified to be main (Vercel then uses the default branch)", () => {
      const accepted = evaluateVercelProject({ ...ok, project: unknown, githubDefaultBranch: "main" });
      expect(accepted.problems).toEqual([]);
      expect(accepted.warnings.join("\n")).toMatch(/did not report a production branch/);
    });

    it.each([
      ["a different default branch", "claude/zen-darwin-5vgl0z"],
      ["an unknown default branch", undefined],
      ["an empty default branch", ""],
    ])("an unknown production branch with %s is refused", (_label, githubDefaultBranch) => {
      const { problems } = evaluateVercelProject({ ...ok, project: unknown, githubDefaultBranch });
      expect(problems.join("\n")).toMatch(/production branch cannot be determined/);
      expect(problems.join("\n")).toMatch(/Refusing to migrate or deploy/);
    });

    it("a project with no Git link at all is treated the same way", () => {
      expect(evaluateVercelProject({ ...ok, project: {}, githubDefaultBranch: "master" }).problems.join("\n")).toMatch(/cannot be determined/);
    });

    it("an explicit production branch is not rescued by a default branch of main", () => {
      const { problems } = evaluateVercelProject({ ...ok, project: { link: { ...ok.project.link, productionBranch: "staging" } }, githubDefaultBranch: "main" });
      expect(problems.join("\n")).toMatch(/production branch is "staging", not "main"/);
    });

    it("Deploy Hooks are refused (they build a branch outside the pipeline)", () => {
      const { problems } = evaluateVercelProject({ ...ok, project: { link: { ...ok.project.link, deployHooks: [{ id: "h", name: "x", ref: "main" }] } } });
      expect(problems.join("\n")).toMatch(/1 Deploy Hook/);
    });
  });

  it("refuses a production branch other than main (it would deploy from a push, bypassing the pipeline)", () => {
    const { problems } = evaluateVercelProject({ ...ok, project: { link: { ...ok.project.link, productionBranch: "claude/zen-darwin-5vgl0z" } } });
    expect(problems.join("\n")).toMatch(/production branch is "claude\/zen-darwin-5vgl0z", not "main"/);
  });

});

/** The real script, against a local stand-in for the Vercel API. */
describe("scripts/ci/check-vercel-project.mjs", () => {
  const TOKEN = "vercel-token-secret-0123456789";

  function run(handler: (url: string, auth: string | undefined) => { status: number; body: unknown }, extraEnv?: Record<string, string>) {
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
          { env: { PATH: process.env.PATH, VERCEL_TOKEN: TOKEN, VERCEL_PROJECT_ID: "prj_123", VERCEL_ORG_ID: "team_456", CEFRO_GITHUB_REPOSITORY: "Owner/Cefro-App", CEFRO_GITHUB_REPOSITORY_ID: "123456", ...(extraEnv ?? {}) } as unknown as NodeJS.ProcessEnv, timeout: 30_000 },
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

  it("fails when the project is connected to a different repository, and when the API does not say (without a recorded confirmation)", async () => {
    const other = await run((url) => ({ status: 200, body: url.includes("/env") ? { envs: ok.envs } : { link: { type: "github", repoId: 999, productionBranch: "main" } } }));
    expect(other.code).toBe(1);
    expect(other.out).toMatch(/different GitHub repository/);
    const silent = (url: string) => ({ status: 200, body: url.includes("/env") ? { envs: ok.envs } : { link: { type: "github", productionBranch: "main" } } });
    const refused = await run(silent);
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/CEFRO_VERCEL_PROJECT_REPO/);
    const confirmed = await run(silent, { CEFRO_VERCEL_PROJECT_REPO: "owner/cefro-app" });
    expect(confirmed.code).toBe(0);
    expect(confirmed.out).toMatch(/manual confirmation/);
    expect(refused.out + confirmed.out + other.out).not.toContain(TOKEN);
  });

  it("fails closed when the production branch is unknown and GitHub's default branch is not main", async () => {
    const unknownBranch = (url: string) => ({ status: 200, body: url.includes("/env") ? { envs: ok.envs } : { link: { type: "github", org: "owner", repo: "cefro-app", repoId: 123456 } } });
    const refused = await run(unknownBranch, { GITHUB_DEFAULT_BRANCH: "claude/zen-darwin-5vgl0z" });
    expect(refused.code).toBe(1);
    expect(refused.out).toMatch(/cannot be determined/);
    const missing = await run(unknownBranch); // no GITHUB_DEFAULT_BRANCH at all
    expect(missing.code).toBe(1);
    const accepted = await run(unknownBranch, { GITHUB_DEFAULT_BRANCH: "main" });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toMatch(/did not report a production branch/);
  });

  it("fails closed on an API error without printing the token", async () => {
    const result = await run(() => ({ status: 403, body: {} }));
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/HTTP 403/);
    expect(result.out).toMatch(/VERCEL_TOKEN/);
    expect(result.out).not.toContain(TOKEN);
  });
});
