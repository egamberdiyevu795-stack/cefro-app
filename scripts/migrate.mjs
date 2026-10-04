#!/usr/bin/env node
// Applies the database migrations to the hosted (Turso/libSQL) database, then checks foreign keys.
//
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate
//
// Runs automatically in the Vercel build (`vercel-build`) so every deployment is migrated BEFORE the new code serves
// traffic, and by one process only (not by whichever function instance starts first). Without the two variables
// (local development, CI) it does nothing: local databases migrate themselves when the app opens them.
// Credentials are never printed.
import path from "node:path";
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url && !authToken && process.env.VERCEL) {
  console.error("db:migrate: running on Vercel without TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Add both in the project's environment variables; a deployment without the hosted database cannot keep attempts between requests.");
  process.exit(1);
}
if (!url && !authToken) {
  console.log("db:migrate: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set; nothing to migrate (local databases migrate on open).");
  process.exit(0);
}
if (!url || !authToken) {
  console.error("db:migrate: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be set.");
  process.exit(1);
}

const secrets = [url, authToken];
try {
  secrets.push(new URL(url.replace(/^libsql:/, "https:")).host);
} catch {
  console.error("db:migrate: TURSO_DATABASE_URL is not a valid address.");
  process.exit(1);
}
const scrub = (text) => secrets.reduce((out, secret) => out.split(secret).join("[redacted]"), String(text));

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
  console.error(`db:migrate: FAILED: ${scrub(error?.stack ?? error)}`);
  process.exit(1);
}
