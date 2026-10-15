#!/usr/bin/env node
// Pre-deployment guard on the Vercel project's configuration (read-only API calls; the token is never printed).
//
//   VERCEL_TOKEN=... VERCEL_PROJECT_ID=... VERCEL_ORG_ID=... node scripts/ci/check-vercel-project.mjs
//
// It enforces the two settings the pipeline cannot enforce from inside the repository:
//  1. The database credentials exist for Production and ONLY for Production. A Preview deployment that held them
//     would read and write the production database at run time (the migration script is not the only way to touch it).
//     Set CEFRO_ALLOW_PREVIEW_TURSO=true only if Preview deliberately uses a different, separate Turso database.
//  2. Vercel's production branch is `main`, the only branch whose automatic Git deployments vercel.json switches off.
//     Any other production branch would deploy straight from a push, bypassing the checks and the migration.
//     Fail closed: if the API does not say which branch is the production branch, Vercel is using the repository's
//     default branch, so that is accepted ONLY if GitHub reports it to be `main` (GITHUB_DEFAULT_BRANCH). Otherwise
//     the production branch is unknown and nothing is migrated or deployed.
//  3. No Deploy Hook exists: a hook builds a branch on request, outside the pipeline.
//  4. The Vercel project is the one for THIS repository. The project and organisation ids come from secrets, so a wrong
//     value would otherwise deploy this code into someone else's project (or migrate-and-deploy against the wrong app).
//     The project's `link` object is compared with the GitHub repository when it carries the repository (`repoId`, or
//     `org` + `repo`); a mismatch is refused. The API response was NOT available while this was written, so absence is not
//     treated as success: if the link does not name the repository, the pipeline stops unless the repository variable
//     CEFRO_VERCEL_PROJECT_REPO equals "<owner>/<repo>", which records that a person confirmed in Vercel (Project >
//     Settings > Git) that the project is connected to this repository.
import path from "node:path";
import { fileURLToPath } from "node:url";

const KEYS = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
const targetsOf = (env) => (Array.isArray(env.target) ? env.target : env.target ? [env.target] : []);

/**
 * Non-secret facts that let a person see WHICH Vercel project the pipeline looked at and what it found there: the
 * project's name, its reported production branch, and for each database variable only its name and the environments it
 * is assigned to. Never values, ids or tokens.
 * @param {{ project?: any, envs: any[] }} input
 * @returns {string[]}
 */
export function describeVercelProject({ project, envs }) {
  const lines = [`Vercel project looked at: "${String(project?.name ?? "(name not returned)").slice(0, 80)}"`];
  lines.push(`Production branch reported by Vercel: ${project?.link?.productionBranch ? `"${String(project.link.productionBranch).slice(0, 80)}"` : "(none reported)"}`);
  for (const key of KEYS) {
    const entries = envs.filter((e) => e.key === key);
    lines.push(entries.length === 0 ? `${key}: not found in this project` : `${key}: ${entries.map((e) => `[${targetsOf(e).join(", ") || "no environment"}]`).join(" ")}`);
  }
  return lines;
}

/**
 * @param {{ project?: any, envs: any[], productionBranch?: string, githubDefaultBranch?: string, allowPreviewTurso?: boolean, githubRepository?: string, githubRepositoryId?: string, acknowledgedRepository?: string }} input
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function evaluateVercelProject({ project, envs, productionBranch = "main", githubDefaultBranch, allowPreviewTurso = false, githubRepository, githubRepositoryId, acknowledgedRepository }) {
  const problems = [];
  const warnings = [];
  for (const key of KEYS) {
    const entries = envs.filter((e) => e.key === key);
    if (!entries.some((e) => targetsOf(e).includes("production"))) {
      problems.push(`${key} is not set for the Production environment in the Vercel project.`);
    }
    if (!allowPreviewTurso) {
      for (const e of entries) {
        const exposed = targetsOf(e).filter((t) => t === "preview" || t === "development");
        if (exposed.length > 0) {
          problems.push(`${key} is also available to ${exposed.join(" and ")}. Edit the variable in Vercel and untick everything except Production, so a Preview deployment can never touch the production database.`);
        }
        if (Array.isArray(e.customEnvironmentIds) && e.customEnvironmentIds.length > 0) {
          warnings.push(`${key} is also assigned to a custom environment; make sure that environment is not a Preview of the production database.`);
        }
      }
    }
  }
  const branch = project?.link?.productionBranch;
  if (branch) {
    if (branch !== productionBranch) {
      problems.push(`The Vercel production branch is "${branch}", not "${productionBranch}". Pushes to "${branch}" would deploy to production directly, without the checks and the migration. Set Branch Tracking to "${productionBranch}".`);
    }
  } else if (githubDefaultBranch === productionBranch) {
    warnings.push(`The Vercel API did not report a production branch; Vercel then uses the repository's default branch, which GitHub reports as "${productionBranch}". Setting Branch Tracking to "${productionBranch}" explicitly in Vercel removes this warning.`);
  } else {
    problems.push(`The Vercel production branch cannot be determined, and the GitHub default branch is ${githubDefaultBranch ? `"${githubDefaultBranch}"` : "unknown"}, not "${productionBranch}". Refusing to migrate or deploy. Make "${productionBranch}" the default branch on GitHub and set Branch Tracking to "${productionBranch}" in Vercel.`);
  }
  const hooks = project?.link?.deployHooks;
  if (Array.isArray(hooks) && hooks.length > 0) {
    problems.push(`The Vercel project has ${hooks.length} Deploy Hook(s). A hook builds a branch on request, outside this pipeline; delete them (Settings > Git > Deploy Hooks).`);
  }

  // 4. Is this Vercel project connected to this repository?
  const link = project?.link;
  if (link?.type && link.type !== "github") {
    problems.push(`The Vercel project is connected to ${String(link.type).slice(0, 20)}, not GitHub. Refusing to deploy into it.`);
  }
  const apiRepoId = link?.repoId != null ? String(link.repoId) : undefined;
  const apiRepo = typeof link?.org === "string" && typeof link?.repo === "string" ? `${link.org}/${link.repo}`.toLowerCase() : undefined;
  const mismatches = [];
  let confirmed = false;
  if (apiRepoId && githubRepositoryId) {
    if (apiRepoId === String(githubRepositoryId)) confirmed = true;
    else mismatches.push("The Vercel project is connected to a different GitHub repository than this one (repository id mismatch). The project id / organisation id secrets may point at the wrong project.");
  }
  if (apiRepo && githubRepository) {
    if (apiRepo === githubRepository.toLowerCase()) confirmed = true;
    else mismatches.push(`The Vercel project is connected to "${apiRepo}", not "${githubRepository.toLowerCase()}". The project id / organisation id secrets may point at the wrong project.`);
  }
  if (mismatches.length > 0) {
    problems.push(...mismatches); // any contradiction wins over a match
  } else if (!confirmed) {
    if (githubRepository && acknowledgedRepository && acknowledgedRepository.toLowerCase() === githubRepository.toLowerCase()) {
      warnings.push(`The Vercel API did not show which repository the project is connected to; relying on the recorded manual confirmation (CEFRO_VERCEL_PROJECT_REPO=${githubRepository}).`);
    } else {
      problems.push(`The Vercel API did not show which repository the project is connected to, so it cannot be verified that this is the right project. Confirm in Vercel (Project > Settings > Git) that it is connected to "${githubRepository ?? "this repository"}", then set the GitHub repository variable CEFRO_VERCEL_PROJECT_REPO to that value.`);
    }
  }
  return { problems, warnings };
}

async function api(pathname, token, signal) {
  const response = await fetch(`https://api.vercel.com${pathname}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`Vercel API ${pathname.split("?")[0].replace(/\/projects\/[^/]+/, "/projects/<id>")} answered HTTP ${response.status}${response.status === 401 || response.status === 403 ? " (check VERCEL_TOKEN and that it can read this project/team)" : ""}`);
  return response.json();
}

async function main() {
  const { VERCEL_TOKEN: token, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId } = process.env;
  if (!token || !projectId) {
    console.error("check-vercel-project: VERCEL_TOKEN and VERCEL_PROJECT_ID must be set.");
    process.exit(1);
  }
  const team = orgId?.startsWith("team_") ? `teamId=${encodeURIComponent(orgId)}` : "";
  const signal = AbortSignal.timeout(30_000);
  try {
    const project = await api(`/v9/projects/${encodeURIComponent(projectId)}${team ? `?${team}` : ""}`, token, signal);
    const list = await api(`/v10/projects/${encodeURIComponent(projectId)}/env${team ? `?${team}` : ""}`, token, signal);
    const { problems, warnings } = evaluateVercelProject({
      project,
      envs: list.envs ?? [],
      githubDefaultBranch: process.env.GITHUB_DEFAULT_BRANCH,
      githubRepository: process.env.CEFRO_GITHUB_REPOSITORY,
      githubRepositoryId: process.env.CEFRO_GITHUB_REPOSITORY_ID,
      acknowledgedRepository: process.env.CEFRO_VERCEL_PROJECT_REPO,
      allowPreviewTurso: process.env.CEFRO_ALLOW_PREVIEW_TURSO === "true",
    });
    for (const line of describeVercelProject({ project, envs: list.envs ?? [] })) console.log(`check-vercel-project: ${line}`);
    for (const w of warnings) console.warn(`::warning::check-vercel-project: ${w}`);
    if (problems.length > 0) {
      for (const p of problems) console.error(`::error::check-vercel-project: ${p}`);
      process.exit(1);
    }
    console.log("check-vercel-project: OK (database credentials are Production-only; production branch is main; no deploy hooks; project is linked to this repository).");
  } catch (error) {
    // Messages above never contain the token; nothing else from the request is printed.
    console.error(`::error::check-vercel-project: ${error instanceof Error ? error.message : "request failed"}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
