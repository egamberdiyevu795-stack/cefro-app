#!/usr/bin/env node
// Database migrations for the hosted (Turso/libSQL) database.
//
//   npm run db:migrate                                     apply pending migrations (no-op without Turso credentials)
//   npm run db:migrate -- --require-remote                 the same, but missing/incomplete credentials are an ERROR
//   npm run db:migrate -- --check [--require-remote]       READ-ONLY report: connectivity, applied vs pending migrations
//   npm run db:migrate -- --check --require-current        ... and fail unless every shipped migration is applied
//
// Credentials come from TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. The production pipeline always passes
// --require-remote, so a missing secret can never turn into a silent "nothing to migrate" followed by a deployment.
//
// Safety, in the order it is applied:
//  - Refuses to run in a Vercel Preview build, and refuses an http:// address (the token would travel unencrypted;
//    only an explicit loopback address, used by the tests, may use http).
//  - Refuses a database that is not managed by this repository: tables but no migration history (probably the wrong
//    database), or a migration history this code does not know (the database is ahead of, or unrelated to, this code).
//  - --check only SELECTs and runs PRAGMA foreign_key_check; it never writes.
//  - Applying migrations is one transaction (Drizzle's libSQL migrator), idempotent, followed by a foreign-key check.
//
// This is NOT part of the Vercel build. Credentials and connection details are never printed: every message is
// redacted, including the underlying error chain.
import path from "node:path";
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const KNOWN_FLAGS = ["--require-remote", "--check", "--require-current"];
const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!KNOWN_FLAGS.includes(flag)) die(`unknown option ${flag.slice(0, 40)}. Known: ${KNOWN_FLAGS.join(", ")}.`);
}
const requireRemote = flags.has("--require-remote");
const checkOnly = flags.has("--check");
const requireCurrent = flags.has("--require-current");
if (requireCurrent && !checkOnly) die("--require-current is only meaningful together with --check.");

function die(message) {
  console.error(`db:migrate: ${message}`);
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (process.env.VERCEL_ENV === "preview") {
  die("refusing to run in a Vercel Preview build. Migrations are applied by the production pipeline (or deliberately by hand); a Preview must never touch the shared database.");
}
if (!url && !authToken) {
  if (requireRemote || process.env.VERCEL) {
    die("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are both missing or empty. Set them in the environment this runs in (GitHub: the `production` environment's secrets; Vercel: project environment variables).");
  }
  console.log("db:migrate: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set; nothing to migrate (local databases migrate on open).");
  process.exit(0);
}
if (!url || !authToken) {
  die(`TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be set (${url ? "TURSO_AUTH_TOKEN" : "TURSO_DATABASE_URL"} is missing or empty).`);
}

const invalidAddress = "TURSO_DATABASE_URL is not a valid address (expected libsql://<database>-<org>.turso.io or https://…; check for quotes, spaces or a trailing newline).";
let endpoint;
try {
  endpoint = new URL(url.trim().replace(/^libsql:/, "https:"));
} catch {
  die(invalidAddress);
}
const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
if (!endpoint.hostname) die(invalidAddress);
if (endpoint.protocol === "http:" && !loopback) {
  die("TURSO_DATABASE_URL uses http://, which is refused: the token would travel unencrypted. Use libsql:// or https://.");
}
if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) die(invalidAddress);

const secrets = [url, url.trim(), authToken, endpoint.host, endpoint.origin].filter((secret) => secret.length > 0);
// Known secrets first, then anything shaped like a credential (a bearer header, a JWT), in case a library echoes one.
const scrub = (text) =>
  secrets
    .reduce((out, secret) => out.split(secret).join("[redacted]"), String(text))
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.?[\w-]*/g, "[redacted]");

/** Every message in an error chain (drizzle wraps the real failure in `cause`), redacted and without repeats. */
function causeChain(error) {
  const lines = [];
  for (let e = error, depth = 0; e && depth < 6; e = e.cause, depth++) {
    const detail = [e.code, e.message ?? e].filter(Boolean).join(": ");
    // Drizzle's wrapper repeats the whole statement over several lines; keep the start of it, on one line.
    const line = scrub(detail).replace(/\s+/g, " ").trim().slice(0, 160);
    if (line && !lines.includes(line)) lines.push(line);
  }
  return lines;
}

/** A plain-language reading of the likeliest reason, for the common failures. */
function explain(text) {
  if (/\b401\b|unauthori[sz]ed|authentication|invalid (auth )?token|jwt/i.test(text)) {
    return "Authentication failed: the token is wrong, expired, or belongs to a different database. Create a new token for this database and set TURSO_AUTH_TOKEN again (no quotes or spaces).";
  }
  if (/\b403\b|forbidden|read.?only|permission|not authori[sz]ed to/i.test(text)) {
    return "Not allowed to write: the token may be read-only. Create a token with write access to this database.";
  }
  if (/\b404\b|not found|no such database/i.test(text)) {
    return "Database not found: check TURSO_DATABASE_URL (name, organisation) and that the token belongs to this database.";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|timed? ?out|abort|bad port|invalid url/i.test(text)) {
    return "Could not reach the database: check TURSO_DATABASE_URL (spelling, https:// or libsql://), your network, and that the database is not paused or deleted.";
  }
  return null;
}

const migrationsFolder = path.join(process.cwd(), "src/server/db/migrations");
const shipped = readMigrationFiles({ migrationsFolder });
const shippedHashes = new Set(shipped.map((m) => m.hash));

const client = createClient({
  url: endpoint.href.replace(/\/$/, ""),
  authToken,
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }),
});

/** Read-only look at the database: which of this repository's migrations it has, and whether it is ours at all. */
async function inspect() {
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows
    .map((row) => String(row.name))
    // Engine-internal tables are not application data.
    .filter((name) => !/^(sqlite_|libsql_|_litestream)/.test(name));
  const hasHistory = tables.includes("__drizzle_migrations");
  const appliedHashes = hasHistory ? (await client.execute("SELECT hash FROM __drizzle_migrations")).rows.map((row) => String(row.hash)) : [];
  const otherTables = tables.filter((name) => name !== "__drizzle_migrations");
  return {
    appliedHashes,
    otherTables: otherTables.length,
    pending: shipped.filter((m) => !appliedHashes.includes(m.hash)).length,
    unknown: appliedHashes.filter((hash) => !shippedHashes.has(hash)).length,
  };
}

/** Is this database one this repository may touch? Anything unexpected stops here, before any write. */
function assertOurs(state) {
  if (state.appliedHashes.length === 0 && state.otherTables > 0) {
    die(`the database already contains ${state.otherTables} table(s) but no CEFRO migration history. It is probably not the intended database; refusing to touch it.`);
  }
  if (state.unknown > 0) {
    die(`the database has ${state.unknown} migration(s) this code does not know. It is ahead of this version (a newer release already migrated it) or unrelated; refusing to touch it.`);
  }
}

async function assertForeignKeysClean() {
  const violations = (await client.execute("PRAGMA foreign_key_check")).rows;
  if (violations.length > 0) {
    die(`${violations.length} foreign key violation(s) in the database (first: ${scrub(JSON.stringify(violations[0]))}).`);
  }
}

try {
  const started = Date.now();
  const before = await inspect();
  assertOurs(before);

  if (checkOnly) {
    await assertForeignKeysClean();
    const applied = shipped.length - before.pending;
    console.log(`db:migrate --check: connected (read-only). ${applied} of ${shipped.length} migrations applied, ${before.pending} pending; foreign key check clean.`);
    if (requireCurrent && before.pending > 0) {
      die(`${before.pending} migration(s) are not applied yet. Run the migrate stage (or \`npm run db:migrate -- --require-remote\`) first; nothing was deployed.`);
    }
    process.exit(0);
  }

  await migrate(drizzle(client), { migrationsFolder });
  const after = await inspect();
  if (after.pending > 0) die(`${after.pending} migration(s) are still pending after migrating; something is wrong with the database.`);
  await assertForeignKeysClean();
  console.log(`db:migrate: OK. ${shipped.length} migrations applied, foreign key check clean (${Date.now() - started} ms).`);
} catch (error) {
  const chain = causeChain(error);
  console.error("db:migrate: FAILED. Applying migrations is a single transaction, so a failed run leaves the database as it was; it is safe to run again.");
  for (const [index, line] of chain.entries()) console.error(`  ${index === 0 ? "while" : "cause"}: ${line}`);
  const hint = explain(chain.join(" "));
  if (hint) console.error(`db:migrate: ${hint}`);
  process.exit(1);
}
