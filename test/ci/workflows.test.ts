import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The deployment guarantees, asserted on the files themselves so that an edit which weakens them fails the build.
 * (The workflows can only really be exercised on GitHub; these tests pin their structure.)
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
type Job = { needs?: string | string[]; if?: string; environment?: string; uses?: string; concurrency?: { group: string; "cancel-in-progress": boolean }; steps?: { name?: string; run?: string; env?: Record<string, string>; uses?: string }[] };
const deploy = parse(read(".github/workflows/deploy.yml")) as { on: Record<string, unknown>; permissions: Record<string, string>; concurrency: { group: string; "cancel-in-progress": boolean }; jobs: Record<string, Job> };
const ci = parse(read(".github/workflows/ci.yml")) as { on: Record<string, unknown>; permissions: Record<string, string> };
const needs = (job: Job) => ([] as string[]).concat(job.needs ?? []);

describe("production pipeline (deploy.yml)", () => {
  it("runs only for main (push) or a manual run, never for pull requests or forks", () => {
    expect(Object.keys(deploy.on).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(deploy.on.push).toEqual({ branches: ["main"] });
    expect(read(".github/workflows/deploy.yml")).not.toMatch(/pull_request/);
    for (const job of Object.values(deploy.jobs)) expect(job.if).toBe("github.ref == 'refs/heads/main'");
  });

  it("orders the stages: validate -> preflight -> migrate -> deploy, each needing the one before", () => {
    expect(deploy.jobs.ci.uses).toBe("./.github/workflows/ci.yml");
    expect(needs(deploy.jobs.preflight)).toEqual(["ci"]);
    expect(needs(deploy.jobs.migrate)).toEqual(["preflight"]);
    expect(needs(deploy.jobs.deploy)).toEqual(["migrate"]);
  });

  it("allows one production run at a time and never cancels a run halfway", () => {
    expect(deploy.concurrency).toEqual({ group: "production-deploy", "cancel-in-progress": false });
    expect(deploy.jobs.migrate.concurrency).toEqual({ group: "production-database-migration", "cancel-in-progress": false });
  });

  it("uses a read-only token and keeps secrets to the production environment's jobs", () => {
    expect(deploy.permissions).toEqual({ contents: "read" });
    for (const name of ["preflight", "migrate", "deploy"]) expect(deploy.jobs[name].environment).toBe("production");
    expect(deploy.jobs.ci.environment).toBeUndefined();
  });

  it("passes secrets only through env:, never inside a script or to echo", () => {
    const text = read(".github/workflows/deploy.yml");
    for (const job of Object.values(deploy.jobs)) {
      for (const step of job.steps ?? []) expect(step.run ?? "", step.name).not.toMatch(/\$\{\{/);
    }
    expect(text).not.toMatch(/echo[^\n]*(TURSO_AUTH_TOKEN|VERCEL_TOKEN|TURSO_DATABASE_URL)/);
    expect(text).not.toMatch(/set -x|--debug/);
  });

  it("migrates with the explicit command, without dev dependencies or install scripts, before deploying", () => {
    const steps = deploy.jobs.migrate.steps ?? [];
    expect(steps.some((s) => s.run === "npm ci --omit=dev --ignore-scripts")).toBe(true);
    const migrate = steps.find((s) => s.run === "npm run db:migrate");
    expect(Object.keys(migrate?.env ?? {}).sort()).toEqual(["TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL"]);
    const deploySteps = deploy.jobs.deploy.steps ?? [];
    expect(deploySteps.some((s) => /vercel@\d+\.\d+\.\d+ deploy --prod/.test(s.run ?? ""))).toBe(true); // pinned CLI version
    expect(JSON.stringify(deploy.jobs.deploy)).not.toMatch(/TURSO/); // the deployment step never receives database credentials
  });

  it("refuses to deploy or migrate a commit that is no longer the head of main", () => {
    for (const name of ["preflight", "deploy"]) {
      expect((deploy.jobs[name].steps ?? []).map((s) => s.run ?? "").join("\n")).toMatch(/git fetch --quiet origin main[\s\S]*FETCH_HEAD[\s\S]*GITHUB_SHA/);
    }
  });

  it("checks the Vercel project before anything is migrated", () => {
    const run = (deploy.jobs.preflight.steps ?? []).map((s) => s.run ?? "").join("\n");
    expect(run).toContain("node scripts/ci/check-vercel-project.mjs");
  });
});

describe("validation stage (ci.yml)", () => {
  it("is reusable by the pipeline, and main is not validated twice", () => {
    expect(Object.keys(ci.on).sort()).toEqual(["pull_request", "push", "workflow_call"]);
    expect(ci.on.push).toEqual({ "branches-ignore": ["main"] });
  });

  it("has no secrets, only a read-only token, and runs lint, typecheck, tests, build, migration safety and browser tests", () => {
    const text = read(".github/workflows/ci.yml");
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(text).not.toMatch(/\$\{\{\s*secrets\./);
    for (const needle of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "check-migrations.mjs", "npm run test:e2e"]) expect(text).toContain(needle);
  });
});

describe("vercel configuration", () => {
  it("the Vercel build only builds: no migration, no database access", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(scripts["vercel-build"]).toBe("next build");
    expect(scripts["db:migrate"]).toBe("node scripts/migrate.mjs");
  });

  it("switches off Vercel's own automatic deployment of main (the pipeline is the only production deployer)", () => {
    expect(JSON.parse(read("vercel.json")).git).toEqual({ deploymentEnabled: { main: false } });
  });

  it("no other workflow can reach the production database or deploy", () => {
    for (const file of fs.readdirSync(path.join(ROOT, ".github/workflows")).filter((f) => f !== "deploy.yml")) {
      const text = read(`.github/workflows/${file}`);
      expect(text, file).not.toMatch(/TURSO_|VERCEL_TOKEN|db:migrate|vercel(@\S+)? deploy/);
    }
  });
});
