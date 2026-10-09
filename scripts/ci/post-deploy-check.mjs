#!/usr/bin/env node
// Post-deployment health check, run after `vercel deploy --prod`.
//
//   VERCEL_TOKEN=... VERCEL_ORG_ID=... node scripts/ci/post-deploy-check.mjs <deployment url>
//
// It waits until Vercel reports the deployment READY and assigned to its production domain(s), then asks the public
// /api/health of a production domain whether the deployed code can reach its database and finds it migrated.
//
// IMPORTANT: a failure here does NOT undo anything. The database was migrated BEFORE this deployment and stays migrated;
// nothing rolls it back. What is live is the new deployment. If this check fails, restore the previous release with
// `vercel rollback` (or "Instant Rollback" in the Vercel dashboard); because migrations are meant to be backward
// compatible, the previous release keeps working on the migrated database.
//
// Tokens are never printed.
import path from "node:path";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {unknown} body @returns {boolean} */
export const isHealthyBody = (body) => typeof body === "object" && body !== null && /** @type {{status?: unknown}} */ (body).status === "ok";

async function vercel(pathname, token) {
  const response = await fetch(`https://api.vercel.com${pathname}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Vercel API answered HTTP ${response.status}${response.status === 401 || response.status === 403 ? " (check VERCEL_TOKEN)" : ""}`);
  return response.json();
}

async function probe(alias) {
  try {
    const response = await fetch(`https://${alias}/api/health`, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    return isHealthyBody(await response.json().catch(() => null)) ? { ok: true, detail: "ok" } : { ok: false, detail: "unexpected response body" };
  } catch {
    return { ok: false, detail: "request failed" };
  }
}

export async function waitForHealthy({ deploymentUrl, token, orgId, attempts = 30, delayMs = 10_000, log = console.log }) {
  const host = new URL(deploymentUrl).host;
  const team = orgId?.startsWith("team_") ? `?teamId=${encodeURIComponent(orgId)}` : "";
  let aliases = [];
  for (let i = 1; i <= attempts; i++) {
    const deployment = await vercel(`/v13/deployments/${encodeURIComponent(host)}${team}`, token);
    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      return { ok: false, reason: `the deployment ended in state ${deployment.readyState}` };
    }
    aliases = Array.isArray(deployment.alias) ? deployment.alias : [];
    if (deployment.readyState === "READY" && deployment.aliasAssigned && aliases.length > 0) break;
    aliases = [];
    log(`post-deploy-check: waiting for the deployment to be ready and assigned to its domain (${i}/${attempts})`);
    await sleep(delayMs);
  }
  if (aliases.length === 0) return { ok: false, reason: "the deployment was not assigned to a production domain in time" };

  let last = "";
  for (let i = 1; i <= attempts; i++) {
    const results = await Promise.all(aliases.map(async (alias) => ({ alias, ...(await probe(alias)) })));
    const healthy = results.find((r) => r.ok);
    if (healthy) return { ok: true, alias: healthy.alias };
    last = results.map((r) => `${r.alias}: ${r.detail}`).join("; ");
    log(`post-deploy-check: not healthy yet (${last}) (${i}/${attempts})`);
    await sleep(delayMs);
  }
  return { ok: false, reason: `/api/health did not report ok (${last})` };
}

async function main() {
  const { VERCEL_TOKEN: token, VERCEL_ORG_ID: orgId } = process.env;
  const deploymentUrl = process.argv[2];
  if (!token || !deploymentUrl) {
    console.error("post-deploy-check: VERCEL_TOKEN and the deployment URL (argument) are required.");
    process.exit(1);
  }
  try {
    const result = await waitForHealthy({ deploymentUrl, token, orgId, attempts: Number(process.env.CEFRO_HEALTH_ATTEMPTS ?? 30), delayMs: Number(process.env.CEFRO_HEALTH_DELAY_MS ?? 10_000) });
    if (result.ok) {
      console.log(`post-deploy-check: OK. https://${result.alias}/api/health reports ok (database reachable, schema current).`);
      return;
    }
    console.error(`::error::post-deploy-check: ${result.reason}.`);
  } catch (error) {
    console.error(`::error::post-deploy-check: ${error instanceof Error ? error.message : "request failed"}.`);
  }
  console.error("::error::The new deployment is live but unhealthy. The database was migrated before it and is NOT rolled back. Restore the previous release with `vercel rollback` (or Instant Rollback in the Vercel dashboard); the previous release works on the migrated database if the migrations were backward compatible.");
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
