import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "@/server/config/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations");

// Survive Next.js dev hot reloads without opening a new connection each time.
const globalForDb = globalThis as unknown as { __cefroDb?: Db };

/**
 * Returns the shared database connection, creating it (and applying pending
 * migrations) on first use.
 */
export function getDb(): Db {
  if (!globalForDb.__cefroDb) {
    globalForDb.__cefroDb = openDatabase(getEnv().DATABASE_PATH);
  }
  return globalForDb.__cefroDb;
}

export function openDatabase(filePath: string): Db {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrateDatabase(sqlite, db);
  sqlite.pragma("foreign_keys = ON");
  return db;
}

/**
 * Apply pending migrations. SQLite can only add a foreign key to an existing table by rebuilding it,
 * and that is only safe with foreign-key enforcement off (the PRAGMA inside the migrator's own
 * transaction is ignored). So enforcement is off while migrating, and the whole database is checked
 * before it is switched on: a migration that leaves a dangling reference fails loudly at startup
 * instead of corrupting data silently.
 */
export function migrateDatabase(
  sqlite: Database.Database,
  db: BetterSQLite3Database<typeof schema>,
  migrationsFolder: string = MIGRATIONS_DIR,
): void {
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder });
  const violations = sqlite.pragma("foreign_key_check") as { table: string; rowid: number; parent: string }[];
  if (violations.length > 0) {
    const summary = violations
      .slice(0, 5)
      .map((v) => `${v.table}#${v.rowid} → ${v.parent}`)
      .join(", ");
    throw new Error(`Database migration left ${violations.length} foreign key violation(s): ${summary}`);
  }
}

/** Test helper: replace the shared connection (e.g. with an in-memory database). */
export function setDbForTesting(db: Db | undefined) {
  globalForDb.__cefroDb = db;
}
