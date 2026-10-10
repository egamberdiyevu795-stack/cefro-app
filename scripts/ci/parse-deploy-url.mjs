#!/usr/bin/env node
// Extracts the deployment URL from the Vercel CLI's standard output.
//
//   vercel deploy --prod ... | node scripts/ci/parse-deploy-url.mjs      (prints the URL, exit 0)
//
// The CLI normally prints one line, but a warning, a notice or a progress line on stdout must not break the pipeline or
// poison $GITHUB_OUTPUT. So: take every line that is exactly one https URL, keep only those on a Vercel deployment host
// (<label>.vercel.app: no credentials, port, path, query or fragment), and use the last one. Nothing else qualifies.
// Anything else is an error that says what was wrong WITHOUT echoing the output (it could contain anything).
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOYMENT_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.vercel\.app$/;

/**
 * @param {string} output the CLI's stdout
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
export function extractDeploymentUrl(output) {
  const lines = String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, error: "the Vercel CLI printed nothing on stdout, so there is no deployment URL." };

  const accepted = [];
  const rejectedHosts = new Set();
  let urlLines = 0;
  for (const line of lines) {
    if (!/^https?:\/\/\S+$/i.test(line)) continue; // prose, progress, warnings
    urlLines++;
    let url;
    try {
      url = new URL(line);
    } catch {
      continue;
    }
    const plain =
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === "" &&
      url.hash === "";
    if (plain && DEPLOYMENT_HOST.test(url.hostname)) accepted.push(`https://${url.hostname}`);
    else rejectedHosts.add(url.hostname.replace(/[^a-z0-9.-]/gi, "?").slice(0, 60));
  }
  if (accepted.length > 0) return { ok: true, url: accepted[accepted.length - 1] };
  if (urlLines === 0) return { ok: false, error: `the Vercel CLI output contained no URL line (${lines.length} line(s) of output, not shown).` };
  return { ok: false, error: `the Vercel CLI printed ${urlLines} URL(s), none of them a plain https deployment URL on *.vercel.app (hosts seen: ${[...rejectedHosts].join(", ") || "none"}).` };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const result = extractDeploymentUrl(Buffer.concat(chunks).toString("utf8"));
  if (!result.ok) {
    console.error(`::error::parse-deploy-url: ${result.error}`);
    console.error("::error::The deployment itself may already have been created: check the Vercel dashboard before running the deploy stage again. The health check was not run.");
    process.exit(1);
  }
  process.stdout.write(`${result.url}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
