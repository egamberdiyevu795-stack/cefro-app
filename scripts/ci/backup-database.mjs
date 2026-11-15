#!/usr/bin/env node
// READ-ONLY full backup of the hosted (Turso/libSQL) database, written as one plain SQL file.
//
//   node scripts/ci/backup-database.mjs <output.sql>
//
// The production pipeline runs this right before every migration and keeps the file as a private workflow artifact
// (30 days). It never writes to the database: only SELECTs on sqlite_master and each table.
//
// Restore (into a NEW database, never over the live one):
//   turso db create cefro-restore --from-dump <output.sql>
//   then point TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (Vercel, Production) at cefro-restore and redeploy.
//
// Credentials come from TURSO_DATABASE_URL and TURSO_AUTH_TOKEN and are never printed. Row values are never printed
// either (the log shows table names and row counts only).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client/web";

const out = process.argv[2];
if (!out) die("usage: backup-database.mjs <output.sql>");

const url = process.env.TURSO_DATABASE_URL ?? "";
const authToken = process.env.TURSO_AUTH_TOKEN ?? "";
if (!url || !authToken) die("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
// Only an explicit loopback address (the tests' emulator) may use http; anything else would send the token unencrypted.
if (url.startsWith("http://") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) die("refusing an unencrypted http:// database address.");

const PAGE = 200;

function die(message) {
  console.error(`db:backup: ${message}`);
  process.exit(1);
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return `X'${Buffer.from(bytes).toString("hex")}'`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
  const client = createClient({ url, authToken });
  try {
    const schema = await client.execute(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE 'libsql_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name",
    );
    const tables = schema.rows.filter((r) => r.type === "table");
    const others = schema.rows.filter((r) => r.type !== "table");

    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    const fd = fs.openSync(out, "w");
    const write = (s) => fs.writeSync(fd, s);
    write(`-- CEFRO database backup, ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n`);

    let total = 0;
    for (const t of tables) {
      write(`${t.sql};\n`);
      let offset = 0;
      let count = 0;
      for (;;) {
        const page = await client.execute(`SELECT * FROM ${quoteIdent(t.name)} ORDER BY rowid LIMIT ${PAGE} OFFSET ${offset}`);
        if (page.rows.length === 0) break;
        const cols = page.columns.map(quoteIdent).join(", ");
        for (const row of page.rows) {
          const values = page.columns.map((_, i) => sqlLiteral(row[i])).join(", ");
          write(`INSERT INTO ${quoteIdent(t.name)} (${cols}) VALUES (${values});\n`);
        }
        count += page.rows.length;
        offset += page.rows.length;
        if (page.rows.length < PAGE) break;
      }
      console.log(`db:backup: ${t.name}: ${count} rows`);
      total += count;
    }
    for (const o of others) write(`${o.sql};\n`);
    write("COMMIT;\n");
    fs.closeSync(fd);
    const size = fs.statSync(out).size;
    console.log(`db:backup: done, ${tables.length} tables, ${total} rows, ${size} bytes.`);
  } catch (error) {
    // Never echo the error chain: it can contain the database address.
    die(`backup failed (${error?.code ?? error?.name ?? "error"}). Nothing was migrated.`);
  } finally {
    client.close();
  }
}

await main();
