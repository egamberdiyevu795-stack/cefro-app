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
    for (const [name, job] of Object.entries(deploy.jobs)) expect(String(job.if), name).toContain("github.ref == 'refs/heads/main'");
  });

  it("orders the stages: validate -> preflight -> (check | migrate -> verify -> deploy), each needing the one before", () => {
    expect(deploy.jobs.ci.uses).toBe("./.github/workflows/ci.yml");
    expect(needs(deploy.jobs.preflight)).toEqual(["ci"]);
    expect(needs(deploy.jobs.check)).toEqual(["preflight"]);
    expect(needs(deploy.jobs.migrate)).toEqual(["preflight"]);
    expect(needs(deploy.jobs.verify)).toEqual(["preflight", "migrate"]);
    expect(needs(deploy.jobs.deploy)).toEqual(["verify"]);
    expect(deploy.jobs.deploy.if).toBe("github.ref == 'refs/heads/main'"); // nothing but a successful verify lets it run
  });

  it("allows one production run at a time and never cancels a run halfway", () => {
    expect(deploy.concurrency).toEqual({ group: "production-deploy", "cancel-in-progress": false });
    expect(deploy.jobs.migrate.concurrency).toEqual({ group: "production-database-migration", "cancel-in-progress": false });
  });

  it("uses a read-only token and keeps secrets to the production environment's jobs", () => {
    expect(deploy.permissions).toEqual({ contents: "read" });
    for (const name of ["preflight", "check", "migrate", "verify", "deploy"]) expect(deploy.jobs[name].environment).toBe("production");
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

  describe("every database command is explicit and fail-closed", () => {
    const runs = (job: string) => (deploy.jobs[job].steps ?? []).map((s) => s.run ?? "");
    const stepWith = (job: string, run: string) => (deploy.jobs[job].steps ?? []).find((s) => s.run === run);

    it("check is read-only (--check) and requires the credentials", () => {
      expect(stepWith("check", "npm run db:migrate -- --check --require-remote")).toBeTruthy();
      expect(runs("check").filter((r) => r.includes("db:migrate") && !r.includes("--check"))).toEqual([]);
    });

    it("migrate applies migrations with --require-remote, without dev dependencies or install scripts, and never deploys", () => {
      expect(runs("migrate")).toContain("npm ci --omit=dev --ignore-scripts");
      expect(stepWith("migrate", "npm run db:migrate -- --require-remote")?.env).toBeDefined();
      expect(runs("migrate").join("\n")).not.toMatch(/vercel/);
    });

    it("verify is read-only and demands every migration to be applied before a deployment can happen", () => {
      expect(stepWith("verify", "npm run db:migrate -- --check --require-remote --require-current")).toBeTruthy();
      expect(runs("verify").join("\n")).not.toMatch(/vercel deploy/);
    });

    it("the credentials reach exactly the database steps; the deployment step and the health check never see them", () => {
      for (const job of ["check", "migrate", "verify"]) {
        const dbStep = (deploy.jobs[job].steps ?? []).find((s) => (s.run ?? "").includes("db:migrate"));
        expect(Object.keys(dbStep?.env ?? {}).sort(), job).toEqual(["TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL"]);
      }
      expect(JSON.stringify(deploy.jobs.deploy)).not.toMatch(/TURSO/);
      expect(JSON.stringify(deploy.jobs.preflight)).toMatch(/TURSO_DATABASE_URL/); // presence check only (names), see below
      const preflightRuns = runs("preflight").join("\n");
      expect(preflightRuns).not.toMatch(/db:migrate/);
    });
  });

  it("deploys a pinned Vercel CLI, then checks the new release's health without any rollback claim", () => {
    const steps = deploy.jobs.deploy.steps ?? [];
    expect(steps.some((s) => /vercel@\d+\.\d+\.\d+ deploy --prod/.test(s.run ?? ""))).toBe(true);
    const deployIndex = steps.findIndex((s) => /deploy --prod/.test(s.run ?? ""));
    const healthIndex = steps.findIndex((s) => (s.run ?? "").includes("scripts/ci/post-deploy-check.mjs"));
    expect(deployIndex).toBeGreaterThan(-1);
    expect(healthIndex).toBeGreaterThan(deployIndex);
    expect(read(".github/workflows/deploy.yml")).toMatch(/does NOT roll anything back/);
    expect(read(".github/workflows/deploy.yml")).not.toMatch(/automatic(ally)? roll/i);
  });

  it("refuses to deploy or migrate a commit that is no longer the head of main", () => {
    for (const name of ["preflight", "deploy"]) {
      expect((deploy.jobs[name].steps ?? []).map((s) => s.run ?? "").join("\n")).toMatch(/git fetch --quiet origin main[\s\S]*FETCH_HEAD[\s\S]*GITHUB_SHA/);
    }
  });

  it("checks the Vercel project (with GitHub's default branch for the fallback) before anything is migrated", () => {
    const step = (deploy.jobs.preflight.steps ?? []).find((s) => (s.run ?? "").includes("scripts/ci/check-vercel-project.mjs"));
    expect(step?.env?.GITHUB_DEFAULT_BRANCH).toBe("${{ github.event.repository.default_branch }}");
  });

  it("offers the manual stages check (the default), migrate, deploy and full", () => {
    const stage = (deploy.on.workflow_dispatch as { inputs: { stage: { type: string; options: string[]; default: string } } }).inputs.stage;
    expect(stage.type).toBe("choice");
    expect(stage.options).toEqual(["check", "migrate", "deploy", "full"]);
    expect(stage.default).toBe("check"); // an accidental dispatch can only read
  });
});

/**
 * Evaluates the real `if:` conditions of deploy.yml with GitHub's semantics (a job without always() also needs all of its
 * `needs` to have succeeded; a skipped job counts as not succeeded), so the stage logic is tested rather than assumed.
 */
function simulate(scenario: { event: "push" | "workflow_dispatch"; ref?: string; stage?: string; failing?: string[] }) {
  const results: Record<string, string> = {};
  const ran: string[] = [];
  for (const [name, job] of Object.entries(deploy.jobs)) {
    const expression = typeof job.if === "string" ? job.if : "true";
    const context = {
      github: { ref: scenario.ref ?? "refs/heads/main", event_name: scenario.event },
      inputs: { stage: scenario.event === "push" ? undefined : (scenario.stage ?? "check") },
      needs: Object.fromEntries(needs(job).map((n) => [n, { result: results[n] }])),
    };
    const condition = new Function("github", "inputs", "needs", "always", `return Boolean(${expression.replace(/\s+/g, " ")});`);
    const needsOk = needs(job).every((n) => results[n] === "success");
    const run = (/always\(\)/.test(expression) || needsOk) && condition(context.github, context.inputs, context.needs, () => true);
    results[name] = !run ? "skipped" : scenario.failing?.includes(name) ? "failure" : "success";
    if (run) ran.push(name);
  }
  return { ran, results };
}

describe("manual stages and the automatic pipeline behave as documented (simulated from the real conditions)", () => {
  it("a push to main runs everything except the manual-only check, in order", () => {
    expect(simulate({ event: "push" }).ran).toEqual(["ci", "preflight", "migrate", "verify", "deploy"]);
    expect(simulate({ event: "workflow_dispatch", stage: "full" }).ran).toEqual(["ci", "preflight", "migrate", "verify", "deploy"]);
  });

  it.each([
    ["ci fails", ["ci"], ["ci"]],
    ["the preflight fails", ["preflight"], ["ci", "preflight"]],
    ["the migration fails", ["migrate"], ["ci", "preflight", "migrate"]],
    ["the verification fails", ["verify"], ["ci", "preflight", "migrate", "verify"]],
  ])("in the automatic pipeline nothing after a stage runs when %s", (_label, failing, expectedRan) => {
    expect(simulate({ event: "push", failing }).ran).toEqual(expectedRan);
  });

  it("deploying needs a green CI, the preflight, a successful migration and a successful verification", () => {
    for (const failing of [["ci"], ["preflight"], ["migrate"], ["verify"]]) {
      expect(simulate({ event: "push", failing }).ran, failing.join()).not.toContain("deploy");
    }
  });

  it("stage check only reads: no CI, no migrate, no verify, no deploy", () => {
    const { ran } = simulate({ event: "workflow_dispatch", stage: "check" });
    expect(ran).toEqual(["preflight", "check"]);
    expect(simulate({ event: "workflow_dispatch" }).ran).toEqual(["preflight", "check"]); // the default
    expect(simulate({ event: "workflow_dispatch", stage: "check", failing: ["preflight"] }).ran).toEqual(["preflight"]);
  });

  it("stage migrate validates first, applies migrations, and never deploys", () => {
    expect(simulate({ event: "workflow_dispatch", stage: "migrate" }).ran).toEqual(["ci", "preflight", "migrate"]);
    expect(simulate({ event: "workflow_dispatch", stage: "migrate", failing: ["ci"] }).ran).toEqual(["ci"]);
    expect(simulate({ event: "workflow_dispatch", stage: "migrate", failing: ["preflight"] }).ran).toEqual(["ci", "preflight"]);
  });

  it("stage deploy validates, verifies the database is already fully migrated, deploys, and never migrates", () => {
    expect(simulate({ event: "workflow_dispatch", stage: "deploy" }).ran).toEqual(["ci", "preflight", "verify", "deploy"]);
    expect(simulate({ event: "workflow_dispatch", stage: "deploy", failing: ["verify"] }).ran).toEqual(["ci", "preflight", "verify"]); // unmigrated database: no deploy
    expect(simulate({ event: "workflow_dispatch", stage: "deploy", failing: ["ci"] }).ran).toEqual(["ci"]);
    expect(simulate({ event: "workflow_dispatch", stage: "deploy", failing: ["preflight"] }).ran).toEqual(["ci", "preflight"]);
  });

  it("no stage runs anything when started from a ref other than main", () => {
    for (const stage of ["check", "migrate", "deploy", "full"]) {
      expect(simulate({ event: "workflow_dispatch", stage, ref: "refs/heads/claude/zen-darwin-5vgl0z" }).ran, stage).toEqual([]);
    }
    expect(simulate({ event: "push", ref: "refs/heads/some-branch" }).ran).toEqual([]);
  });

  it("every database-writing or deploying path requires both CI and the preflight", () => {
    for (const stage of ["migrate", "deploy", "full"]) {
      const { ran } = simulate({ event: "workflow_dispatch", stage });
      expect(ran.slice(0, 2)).toEqual(["ci", "preflight"]);
    }
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
