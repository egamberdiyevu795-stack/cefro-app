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
import path from "node:path";
import { fileURLToPath } from "node:url";

const KEYS = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
const targetsOf = (env) => (Array.isArray(env.target) ? env.target : env.target ? [env.target] : []);

/** @returns {{ problems: string[], warnings: string[] }} */
export function evaluateVercelProject({ project, envs, productionBranch = "main", allowPreviewTurso = false }) {
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
  if (!branch) {
    warnings.push(`Could not read the project's production branch from the Vercel API; confirm in Vercel (Settings > Environments > Production > Branch Tracking) that it is "${productionBranch}".`);
  } else if (branch !== productionBranch) {
    problems.push(`The Vercel production branch is "${branch}", not "${productionBranch}". Pushes to "${branch}" would deploy to production directly, without the checks and the migration. Set Branch Tracking to "${productionBranch}".`);
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
      allowPreviewTurso: process.env.CEFRO_ALLOW_PREVIEW_TURSO === "true",
    });
    for (const w of warnings) console.warn(`::warning::check-vercel-project: ${w}`);
    if (problems.length > 0) {
      for (const p of problems) console.error(`::error::check-vercel-project: ${p}`);
      process.exit(1);
    }
    console.log("check-vercel-project: OK (database credentials are Production-only; production branch is main).");
  } catch (error) {
    // Messages above never contain the token; nothing else from the request is printed.
    console.error(`::error::check-vercel-project: ${error instanceof Error ? error.message : "request failed"}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
