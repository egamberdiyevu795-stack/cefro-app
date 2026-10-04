#!/usr/bin/env node
// Applies the database migrations to the hosted (Turso/libSQL) database, then checks foreign keys.
//
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate
//
// This is an explicit, deliberate step: run it once from a trusted machine (or CI job) before deploying a change that
// adds migrations. It is NOT part of the Vercel build, so a build never touches the database and a Preview build can
// never write to the production database. Running instances only verify the schema is current. It is idempotent.
// Without the two variables (local development, CI) it does nothing: local databases migrate when the app opens them.
// Credentials are never printed: every message below is redacted, including the underlying error chain.
import path from "node:path";
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (process.env.VERCEL_ENV === "preview") {
  console.error("db:migrate: refusing to run in a Vercel Preview build. Migrations are applied explicitly, once, with `npm run db:migrate` from a trusted machine; a Preview must never write to the shared database.");
  process.exit(1);
}
if (!url && !authToken && process.env.VERCEL) {
  console.error("db:migrate: running on Vercel without TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Set both for this environment (Vercel project settings, Production and Preview), or run `npm run db:migrate` from your machine with them exported.");
  process.exit(1);
}
if (!url && !authToken) {
  console.log("db:migrate: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set; nothing to migrate (local databases migrate on open).");
  process.exit(0);
}
if (!url || !authToken) {
  console.error(`db:migrate: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be set (${url ? "TURSO_AUTH_TOKEN" : "TURSO_DATABASE_URL"} is missing or empty).`);
  process.exit(1);
}

const secrets = [url, authToken];
try {
  secrets.push(new URL(url.replace(/^libsql:/, "https:")).host);
} catch {
  console.error("db:migrate: TURSO_DATABASE_URL is not a valid address (expected libsql://<database>-<org>.turso.io or https://…; check for quotes, spaces or a trailing newline).");
  process.exit(1);
}
// Known secrets first, then anything shaped like a credential (a bearer header, a JWT), in case a library echoes one.
const scrub = (text) =>
  secrets
    .filter((secret) => secret.length > 0)
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

const client = createClient({
  url: url.replace(/^libsql:/, "https:"),
  authToken,
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }),
});
const db = drizzle(client);

try {
  const started = Date.now();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });
  const applied = Number((await client.execute("SELECT count(*) AS n FROM __drizzle_migrations")).rows[0].n);
  const violations = (await client.execute("PRAGMA foreign_key_check")).rows;
  if (violations.length > 0) {
    console.error(`db:migrate: ${violations.length} foreign key violation(s) after migrating (first: ${scrub(JSON.stringify(violations[0]))}).`);
    process.exit(1);
  }
  console.log(`db:migrate: OK. ${applied} migrations applied, foreign key check clean (${Date.now() - started} ms).`);
} catch (error) {
  const chain = causeChain(error);
  console.error("db:migrate: FAILED. Pending migrations run in one transaction, so a failed run leaves them unapplied; it is safe to run again.");
  for (const [index, line] of chain.entries()) console.error(`  ${index === 0 ? "while" : "cause"}: ${line}`);
  const hint = explain(chain.join(" "));
  if (hint) console.error(`db:migrate: ${hint}`);
  process.exit(1);
}
