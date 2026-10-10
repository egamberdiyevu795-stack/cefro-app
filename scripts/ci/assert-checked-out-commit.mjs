#!/usr/bin/env node
// Fails unless the working tree is exactly the commit this workflow run was started for.
//
//   node scripts/ci/assert-checked-out-commit.mjs            (reads GITHUB_SHA)
//
// Why: the pipeline's checks (CI, the head-of-main test) are about GITHUB_SHA, but the migration files that are applied and
// the files uploaded to Vercel are whatever is in the working tree. `actions/checkout` is trusted to put GITHUB_SHA there;
// this makes that an assertion instead of an assumption, and it runs before any migration or deployment command.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;

/**
 * @param {{ expected: string | undefined, cwd?: string }} input
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertCheckedOutCommit({ expected, cwd = process.cwd() }) {
  if (!expected || !SHA.test(expected)) return { ok: false, error: "GITHUB_SHA is missing or not a full 40-character commit id." };
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  let head;
  try {
    head = git("rev-parse", "HEAD");
  } catch {
    return { ok: false, error: "cannot read the checked-out commit (is this a git checkout?)." };
  }
  if (head !== expected) {
    return { ok: false, error: `the checked-out commit ${head.slice(0, 12)} is not the commit this run was started for (${expected.slice(0, 12)}). Nothing was migrated or deployed.` };
  }
  if (git("status", "--porcelain") !== "") {
    return { ok: false, error: "the working tree has changes (modified or untracked files) that are not part of the commit; refusing to use it." };
  }
  return { ok: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = assertCheckedOutCommit({ expected: process.env.GITHUB_SHA });
  if (!result.ok) {
    console.error(`::error::assert-checked-out-commit: ${result.error}`);
    process.exit(1);
  }
  console.log(`assert-checked-out-commit: OK (${process.env.GITHUB_SHA?.slice(0, 12)} is checked out and clean).`);
}
