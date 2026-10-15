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
    expect(String(deploy.jobs.deploy.if)).toContain("needs.verify.result == 'success'"); // nothing but a successful verify lets it run
  });

  it("never cancels a run halfway, and keeps the migration under its own second lock", () => {
    expect(deploy.concurrency["cancel-in-progress"]).toBe(false);
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
 * Evaluates the real `if:` conditions of deploy.yml with GitHub's semantics: a job whose condition has no status function
 * (always/cancelled/failure/success) also needs every `needs` job to have succeeded; one that uses always() or
 * !cancelled() decides for itself. A job that did not run has the result "skipped".
 *
 * Cancellation: once the run is cancelled GitHub starts no new job except those whose condition says always(), so
 * `cancelAfter` names the last job that completed before the cancel; every later job is evaluated with cancelled() = true,
 * and one that has no status function is cancelled by the runner (modelled as not running).
 */
type Scenario = { event: "push" | "workflow_dispatch"; ref?: string; stage?: string; failing?: string[]; cancelledJobs?: string[]; cancelAfter?: string; armed?: string | false };
const STATUS_FUNCTION = /\b(always|cancelled|failure|success)\(\)/;

function ancestorsOf(name: string, jobs: Record<string, Job>, seen = new Set<string>()): string[] {
  for (const parent of needs(jobs[name])) {
    if (!seen.has(parent)) {
      seen.add(parent);
      ancestorsOf(parent, jobs, seen);
    }
  }
  return [...seen];
}

function simulate(scenario: Scenario, jobs: Record<string, Job> = deploy.jobs) {
  const results: Record<string, string> = {};
  const ran: string[] = [];
  let cancelled = false;
  for (const [name, job] of Object.entries(jobs)) {
    const expression = typeof job.if === "string" ? job.if : "true";
    const context = {
      github: { ref: scenario.ref ?? "refs/heads/main", event_name: scenario.event },
      inputs: { stage: scenario.event === "push" ? undefined : (scenario.stage ?? "check") },
      // The repository variable that arms push-triggered runs; armed by default so the pipeline tests below exercise it.
      vars: { CEFRO_AUTO_DEPLOY: scenario.armed === false ? undefined : (scenario.armed ?? "true") },
      needs: Object.fromEntries(needs(job).map((n) => [n, { result: results[n] }])),
    };
    const condition = new Function("github", "inputs", "needs", "always", "cancelled", "vars", `return Boolean(${expression.replace(/\s+/g, " ")});`);
    const usesStatusFunction = STATUS_FUNCTION.test(expression);
    // GitHub's implicit success() looks at every ANCESTOR job, not only the direct `needs`: a skipped ancestor skips a job that
    // has no status function (observed on the real service: the manual `check` stage skipped a job whose only direct need had succeeded).
    const needsOk = ancestorsOf(name, jobs).every((n) => results[n] === "success");
    let run = (usesStatusFunction || needsOk) && condition(context.github, context.inputs, context.needs, () => true, () => cancelled, context.vars);
    if (cancelled && !usesStatusFunction) run = false; // the runner cancels jobs that are still waiting
    results[name] = !run ? "skipped" : scenario.cancelledJobs?.includes(name) ? "cancelled" : scenario.failing?.includes(name) ? "failure" : "success";
    if (run) ran.push(name);
    if (scenario.cancelAfter === name) cancelled = true;
  }
  return { ran, results };
}

describe("the automatic pipeline must be armed; the first rollout is manual", () => {
  it("an unarmed push to main runs no job at all, so the first push cannot migrate or deploy anything", () => {
    for (const armed of [false, "", "false", "TRUE", "1", "yes"] as const) {
      expect(simulate({ event: "push", armed }).ran, String(armed)).toEqual([]);
    }
  });

  it("only the exact value true arms it, and then a push runs the whole pipeline", () => {
    expect(simulate({ event: "push", armed: "true" }).ran).toEqual(["ci", "preflight", "migrate", "verify", "deploy"]);
  });

  it("setting the variable back to anything else stops automatic deployments again (emergency stop)", () => {
    expect(simulate({ event: "push", armed: "false" }).ran).toEqual([]);
  });

  it("manual stages are not gated by the variable: they work unarmed, in the required order, each isolated", () => {
    expect(simulate({ event: "workflow_dispatch", stage: "check", armed: false }).ran).toEqual(["preflight", "check"]);
    expect(simulate({ event: "workflow_dispatch", stage: "migrate", armed: false }).ran).toEqual(["ci", "preflight", "migrate"]);
    expect(simulate({ event: "workflow_dispatch", stage: "deploy", armed: false }).ran).toEqual(["ci", "preflight", "verify", "deploy"]);
    expect(simulate({ event: "workflow_dispatch", stage: "full", armed: false }).ran).toEqual(["ci", "preflight", "migrate", "verify", "deploy"]);
  });

  it("the variable is a repository variable (not a secret) read only by the ci job's condition", () => {
    const text = read(".github/workflows/deploy.yml").replace(/#.*$/gm, "");
    expect(text.match(/vars\.CEFRO_AUTO_DEPLOY/g)).toHaveLength(1);
    expect(String(deploy.jobs.ci.if)).toContain("vars.CEFRO_AUTO_DEPLOY == 'true'");
  });
});

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

describe("cancellation and upstream failure never start a later production operation", () => {
  const writers = ["migrate", "verify", "deploy"];

  it("no condition uses always(): a cancelled run must not keep starting jobs", () => {
    expect(read(".github/workflows/deploy.yml").replace(/#.*$/gm, "")).not.toMatch(/\balways\(\)/);
    // These jobs have an ancestor that is skipped in some stage (ci in `check`, migrate in `deploy`), so GitHub's implicit
    // success() would skip them; they must decide for themselves, with explicit result tests (checked by the scenario tests).
    for (const name of ["preflight", "check", "verify", "deploy"]) expect(String(deploy.jobs[name].if), name).toContain("!cancelled()");
  });

  it("every job that decides for itself is false once the run is cancelled, whatever its upstream results are", () => {
    for (const [name, job] of Object.entries(deploy.jobs)) {
      const expression = String(job.if ?? "true");
      if (!STATUS_FUNCTION.test(expression)) continue;
      const condition = new Function("github", "inputs", "needs", "always", "cancelled", "vars", `return Boolean(${expression.replace(/\s+/g, " ")});`);
      for (const stage of ["check", "migrate", "deploy", "full", undefined]) {
        const needsAllGreen = Object.fromEntries(needs(job).map((n) => [n, { result: "success" }]));
        const event = stage ? "workflow_dispatch" : "push";
        expect(condition({ ref: "refs/heads/main", event_name: event }, { stage }, needsAllGreen, () => true, () => true, { CEFRO_AUTO_DEPLOY: "true" }), `${name} / ${stage}`).toBe(false);
      }
    }
  });

  it.each([
    ["push", undefined, ["ci", "preflight", "migrate", "verify"]],
    ["workflow_dispatch", "full", ["ci", "preflight", "migrate", "verify"]],
    ["workflow_dispatch", "deploy", ["ci", "preflight", "verify"]],
    ["workflow_dispatch", "migrate", ["ci", "preflight", "migrate"]],
    ["workflow_dispatch", "check", ["preflight", "check"]],
  ] as const)("cancelling a %s %s run at any point stops everything after that point", (event, stage, order) => {
    const full = simulate({ event, stage }).ran;
    expect(full).toEqual(expect.arrayContaining([...order]));
    for (const [index, last] of full.entries()) {
      const { ran } = simulate({ event, stage, cancelAfter: last });
      expect(ran, `cancelled after ${last}`).toEqual(full.slice(0, index + 1));
      expect(ran.filter((job) => !full.slice(0, index + 1).includes(job))).toEqual([]);
    }
  });

  it("the old always() condition WOULD have continued after a cancel (this test detects that regression)", () => {
    const mutated = JSON.parse(JSON.stringify(deploy.jobs)) as Record<string, Job>;
    for (const name of ["preflight", "verify"]) mutated[name].if = String(mutated[name].if).replace("!cancelled()", "always()");
    // Cancelled after the preflight of a deploy-only run: with always(), verify still starts.
    const { ran } = simulate({ event: "workflow_dispatch", stage: "deploy", cancelAfter: "preflight" }, mutated);
    expect(ran).toContain("verify");
    expect(simulate({ event: "workflow_dispatch", stage: "deploy", cancelAfter: "preflight" }).ran).not.toContain("verify");
  });

  it("a failed, skipped or cancelled upstream job blocks every later stage", () => {
    const stages: [Scenario["event"], string | undefined][] = [["push", undefined], ["workflow_dispatch", "full"]];
    const upstream: Record<string, string[]> = { ci: ["preflight", "migrate", "verify", "deploy"], preflight: ["migrate", "verify", "deploy"], migrate: ["verify", "deploy"], verify: ["deploy"] };
    for (const [event, stage] of stages) {
      for (const [job, blocked] of Object.entries(upstream)) {
        for (const how of ["failing", "cancelledJobs"] as const) {
          const { ran } = simulate({ event, stage, [how]: [job] });
          expect(ran, `${job} ${how}`).not.toEqual(expect.arrayContaining([blocked[0]]));
          for (const later of blocked) expect(ran, `${job} ${how} -> ${later}`).not.toContain(later);
        }
      }
    }
  });

  it("deploy-only needs a verify that succeeded; a cancelled or failed verify never reaches the deployment", () => {
    for (const how of ["failing", "cancelledJobs"] as const) {
      expect(simulate({ event: "workflow_dispatch", stage: "deploy", [how]: ["verify"] }).ran).not.toContain("deploy");
    }
    expect(writers.every((w) => deploy.jobs[w] !== undefined)).toBe(true);
  });
});

describe("concurrency", () => {
  const groupOf = (event: "push" | "workflow_dispatch", stage?: string) => {
    const expression = deploy.concurrency.group.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
    return new Function("github", "inputs", `return ${expression};`)({ event_name: event }, { stage }) as string;
  };

  it("a push and every manual writing stage share one group, so migrations and deployments are serialised", () => {
    const group = groupOf("push");
    expect(group).toBe("production-deploy");
    for (const stage of ["migrate", "deploy", "full"]) expect(groupOf("workflow_dispatch", stage), stage).toBe(group);
  });

  it("the manual read-only check has its own group: it cannot cancel or replace a waiting production run, nor wait behind one", () => {
    expect(groupOf("workflow_dispatch", "check")).toBe("production-check");
    expect(groupOf("workflow_dispatch", "check")).not.toBe(groupOf("push"));
  });

  it("a dispatch that names no stage gets the declared default, check, so it can never be a writing run", () => {
    const stage = (deploy.on.workflow_dispatch as { inputs: { stage: { default: string } } }).inputs.stage;
    expect(stage.default).toBe("check");
  });

  it("the check stage never runs a job that writes, so isolating it cannot create a migration/deploy race", () => {
    const { ran } = simulate({ event: "workflow_dispatch", stage: "check" });
    expect(ran).toEqual(["preflight", "check"]);
    for (const writer of ["migrate", "verify", "deploy"]) expect(ran).not.toContain(writer);
  });

  it("the called CI workflow's own group never equals a caller group (a shared name deadlocks reusable workflows)", () => {
    const ciText = read(".github/workflows/ci.yml");
    const group = /group:\s*(ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\})/.exec(ciText)?.[1];
    expect(group).toBeTruthy();
    // Inside a called workflow, github.workflow is the CALLER's name.
    const resolved = group!.replace("${{ github.workflow }}", "Deploy production").replace("${{ github.ref }}", "refs/heads/main");
    expect(["production-deploy", "production-check", "production-database-migration"]).not.toContain(resolved);
  });
});

describe("the deployment uses exactly the tested commit and a validated URL", () => {
  const stepsOf = (job: string) => deploy.jobs[job].steps ?? [];
  const indexOf = (job: string, needle: string) => stepsOf(job).findIndex((s) => (s.run ?? "").includes(needle));

  it("asserts the checked-out commit equals GITHUB_SHA before any migration command and before the deployment CLI", () => {
    for (const job of ["migrate", "verify", "deploy"]) {
      const assertAt = indexOf(job, "scripts/ci/assert-checked-out-commit.mjs");
      expect(assertAt, job).toBeGreaterThan(-1);
      const checkoutAt = stepsOf(job).findIndex((s) => s.uses === "actions/checkout@v4");
      expect(checkoutAt, job).toBeLessThan(assertAt);
      const firstUse = stepsOf(job).findIndex((s) => /db:migrate|vercel@|npm ci/.test(s.run ?? ""));
      expect(assertAt, `${job}: assertion before the first command that uses the files`).toBeLessThan(firstUse);
    }
    const deployAssert = indexOf("deploy", "assert-checked-out-commit");
    const deployCli = indexOf("deploy", "deploy --prod");
    expect(deployAssert).toBeLessThan(deployCli);
    expect(deployCli - deployAssert, "nothing else runs between the assertion and the CLI").toBe(1);
  });

  it("the assertion step has no secrets and the script reads GITHUB_SHA, which GitHub sets for the run", () => {
    for (const job of ["migrate", "verify", "deploy"]) {
      const step = stepsOf(job).find((s) => (s.run ?? "").includes("assert-checked-out-commit"));
      expect(step?.env).toBeUndefined();
    }
    expect(read("scripts/ci/assert-checked-out-commit.mjs")).toContain("process.env.GITHUB_SHA");
  });

  it("the deployment URL is parsed and validated by the script before it is written to $GITHUB_OUTPUT", () => {
    const step = stepsOf("deploy").find((s) => (s.run ?? "").includes("deploy --prod"));
    const run = step?.run ?? "";
    expect(run).toContain("node scripts/ci/parse-deploy-url.mjs");
    expect(run.indexOf("parse-deploy-url")).toBeLessThan(run.indexOf("GITHUB_OUTPUT"));
    expect(run).not.toMatch(/url="\$\(npx/); // the raw CLI output is not what lands in GITHUB_OUTPUT
    expect(run).not.toMatch(/\$\{\{/);
  });

  it("the Vercel check receives the repository identity and the recorded manual confirmation", () => {
    const step = stepsOf("preflight").find((s) => (s.run ?? "").includes("check-vercel-project"));
    expect(step?.env?.CEFRO_GITHUB_REPOSITORY).toBe("${{ github.repository }}");
    expect(step?.env?.CEFRO_GITHUB_REPOSITORY_ID).toBe("${{ github.repository_id }}");
    expect(step?.env?.CEFRO_VERCEL_PROJECT_REPO).toBe("${{ vars.CEFRO_VERCEL_PROJECT_REPO }}");
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
