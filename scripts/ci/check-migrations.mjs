#!/usr/bin/env node
// Migration safety checks, run in CI before anything can reach the production database.
//
//   node scripts/ci/check-migrations.mjs [--base <git sha>]
//
// Why: in the deployment pipeline the production migration runs BEFORE the new code is deployed, so for a short time
// the OLD application runs against the NEW schema (and, if the deployment fails afterwards, for longer). A migration
// must therefore be backward compatible ("expand, then contract"): add things first, remove them in a later release.
//
//  1. The journal and the SQL files agree, and migration timestamps strictly increase. (Drizzle skips a migration whose
//     timestamp is older than the newest one already applied - silently.)
//  2. A migration that has already been committed is never edited, deleted or renamed (--base): the production database
//     recorded it, and editing it would make the repository disagree with the data.
//  3. New migrations (after the grandfathered ones, which are already applied) contain no destructive or old-code-breaking
//     statement - DROP TABLE/COLUMN/INDEX, RENAME, DELETE FROM, TRUNCATE, ADD COLUMN ... NOT NULL without a DEFAULT, PRAGMA
//     foreign_keys - unless the file carries an explicit, reviewed approval line:
//         -- cefro:destructive-approved: <why this is safe for the old code and for existing data>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Migrations up to this index are already applied everywhere; they predate these rules and are never rewritten. */
export const GRANDFATHERED_THROUGH = 4;

const RULES = [
  [/\bDROP\s+(TABLE|COLUMN|INDEX|VIEW|TRIGGER)\b/i, "drops schema the previous release may still use"],
  [/\bRENAME\b/i, "renames schema the previous release may still use"],
  [/\bDELETE\s+FROM\b/i, "deletes data"],
  [/\bTRUNCATE\b/i, "deletes data"],
  [/\bPRAGMA\s+foreign_keys\b/i, "changes foreign-key enforcement (table rebuilds belong in a reviewed, approved migration)"],
];

/** Statement-level rule: ALTER TABLE ... ADD ... NOT NULL with no DEFAULT anywhere in the same statement. */
const addsRequiredColumnWithoutDefault = (sql) =>
  sql.split(";").some((statement) => /\bADD\b/i.test(statement) && /\bNOT\s+NULL\b/i.test(statement) && !/\bDEFAULT\b/i.test(statement));

const stripComments = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * @param {string} dir the migrations folder
 * @param {{ base?: string, cwd?: string }} [options] `base`: git commit to compare with; `cwd`: where git runs
 * @returns {string[]} problems; empty when the migrations are safe to apply.
 */
export function checkMigrations(dir, { base, cwd = process.cwd() } = {}) {
  const problems = [];
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const tags = journal.entries.map((e) => e.tag);

  for (const [i, entry] of journal.entries.entries()) {
    if (entry.idx !== i) problems.push(`journal entry ${entry.tag}: idx ${entry.idx} should be ${i}`);
    if (!files.includes(`${entry.tag}.sql`)) problems.push(`journal lists ${entry.tag} but ${entry.tag}.sql does not exist`);
    if (i > 0 && !(entry.when > journal.entries[i - 1].when)) {
      problems.push(`${entry.tag}: timestamp ${entry.when} is not newer than ${journal.entries[i - 1].tag}; Drizzle would silently skip it`);
    }
  }
  for (const file of files) {
    if (!tags.includes(file.replace(/\.sql$/, ""))) problems.push(`${file} exists but is missing from meta/_journal.json`);
  }

  for (const [i, entry] of journal.entries.entries()) {
    if (i <= GRANDFATHERED_THROUGH) continue;
    const file = `${entry.tag}.sql`;
    if (!files.includes(file)) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    if (/^\s*--\s*cefro:destructive-approved:\s*\S/im.test(raw)) continue;
    const sql = stripComments(raw);
    const hints = RULES.filter(([pattern]) => pattern.test(sql)).map(([, why]) => why);
    if (addsRequiredColumnWithoutDefault(sql)) hints.push("adds a NOT NULL column without a DEFAULT (fails on existing rows; the previous release does not write it)");
    for (const why of hints) {
      problems.push(`${file}: ${why}. Make it backward compatible, or add "-- cefro:destructive-approved: <reason>" after review.`);
    }
  }

  if (base && !/^0+$/.test(base)) {
    let diff;
    try {
      diff = execFileSync("git", ["diff", "--name-status", "--no-renames", base, "HEAD", "--", dir], { cwd, encoding: "utf8" });
    } catch {
      console.warn(`check-migrations: cannot diff against ${base} (not in this checkout); skipping the "no edits to applied migrations" check.`);
      diff = "";
    }
    for (const line of diff.split("\n").filter(Boolean)) {
      const [status, file] = line.split("\t");
      if (!/\.sql$|_snapshot\.json$/.test(file)) continue;
      if (status !== "A") problems.push(`${file}: an existing migration was ${status === "D" ? "deleted" : "modified"}; applied migrations are immutable. Add a new migration instead.`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex > 0 ? process.argv[baseIndex + 1] : undefined;
  const problems = checkMigrations(path.join(process.cwd(), "src/server/db/migrations"), { base });
  if (problems.length > 0) {
    for (const p of problems) console.error(`check-migrations: ${p}`);
    process.exit(1);
  }
  console.log("check-migrations: OK (journal consistent, applied migrations untouched, new migrations backward compatible).");
}
