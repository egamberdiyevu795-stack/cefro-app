import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "@/server/config/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations");

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
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

/** Test helper: replace the shared connection (e.g. with an in-memory database). */
export function setDbForTesting(db: Db | undefined) {
  globalForDb.__cefroDb = db;
}
