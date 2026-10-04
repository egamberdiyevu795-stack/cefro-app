import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Client, InStatement, ResultSet, Transaction, TransactionMode } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getEnv } from "@/server/config/env";
import * as schema from "./schema";
import { DatabaseUnavailableError, safeDatabaseMessage } from "./errors";
import { type DatabaseTarget, resolveDatabaseTarget } from "./target";

/**
 * The database connection: Drizzle over libSQL.
 *
 *  - Hosted (Turso): @libsql/client/web over HTTPS. Stateless requests, no sockets and no native module, so it suits
 *    serverless functions, and every instance sees the same data. Each request is bounded by a timeout.
 *  - Local (file or :memory:): the Node libSQL client on a SQLite file, for development, tests and self-hosting.
 *    Operations are serialised (see `serialised`) to keep the one-writer behaviour the app was built around.
 *
 * Everything is asynchronous. Both clients are loaded lazily so the hosted path never loads the native module.
 */
export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

export const MIGRATIONS_DIR = path.join(process.cwd(), "src/server/db/migrations");

/** One shared connection per process (and per dev hot reload). A failed start is not remembered, so the next request retries. */
const globalForDb = globalThis as unknown as { __cefroDb?: Promise<Db>; __cefroDbOverride?: Db };

export function getDb(): Promise<Db> {
  if (globalForDb.__cefroDbOverride) return Promise.resolve(globalForDb.__cefroDbOverride);
  if (!globalForDb.__cefroDb) {
    const attempt = openConfiguredDatabase().catch((error) => {
      if (globalForDb.__cefroDb === attempt) globalForDb.__cefroDb = undefined;
      throw new DatabaseUnavailableError(`Could not open the database: ${safeDatabaseMessage(error)}`, { cause: error });
    });
    globalForDb.__cefroDb = attempt;
  }
  return globalForDb.__cefroDb;
}

/** Test helper: replace the shared connection (e.g. with an in-memory database). */
export function setDbForTesting(db: Db | undefined) {
  globalForDb.__cefroDbOverride = db;
  if (!db) globalForDb.__cefroDb = undefined;
}

async function openConfiguredDatabase(): Promise<Db> {
  return openDatabase(resolveDatabaseTarget(getEnv()));
}

export interface OpenOptions {
  /** Test seam: replaces `fetch` for the hosted client. */
  fetch?: typeof fetch;
  /** Local databases only: migration folder to apply (default: the app's). */
  migrationsFolder?: string;
  /** Local databases apply migrations on open (default true). The hosted database is migrated by `npm run db:migrate`. */
  autoMigrate?: boolean;
}

/** Open a database and make it ready: local ones are migrated; the hosted one must already be migrated. */
export async function openDatabase(target: string | DatabaseTarget, options: OpenOptions = {}): Promise<Db> {
  const resolved: DatabaseTarget = typeof target === "string" ? { kind: "file", path: target } : target;
  const db = await createDatabase(resolved, options);
  if (resolved.kind === "turso") {
    await assertSchemaCurrent(db, options.migrationsFolder);
    return db;
  }
  if (options.autoMigrate !== false) await migrateDatabase(db, options.migrationsFolder);
  await db.$client.execute("PRAGMA foreign_keys = ON");
  return db;
}

/** Connect without migrating (used by openDatabase, the migration script and the migration tests). */
export async function createDatabase(target: DatabaseTarget, options: Pick<OpenOptions, "fetch"> = {}): Promise<Db> {
  if (target.kind === "turso") {
    const [{ createClient }, { drizzle }] = await Promise.all([import("@libsql/client/web"), import("drizzle-orm/libsql/web")]);
    const client = createClient({ url: target.url, authToken: target.authToken, fetch: boundedFetch(target.timeoutMs, options.fetch) });
    return drizzle(client, { schema }) as unknown as Db;
  }
  const [{ createClient }, { drizzle }] = await Promise.all([import("@libsql/client"), import("drizzle-orm/libsql")]);
  const inMemory = target.path === ":memory:";
  if (!inMemory) fs.mkdirSync(path.dirname(path.resolve(target.path)), { recursive: true });
  // One connection: PRAGMAs are per connection, and a pool of connections in one process contends for the file lock.
  const client = serialised(createClient({ url: inMemory ? ":memory:" : `file:${path.resolve(target.path)}`, concurrency: 1 }));
  if (!inMemory) await client.execute("PRAGMA journal_mode = WAL");
  return drizzle(client, { schema }) as unknown as Db;
}

/** Every request to the hosted database ends within `timeoutMs`; the client library has no timeout of its own. */
export function boundedFetch(timeoutMs: number, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal });
  };
}

/**
 * Local clients run one operation at a time, and a transaction holds the lock for its whole life. This mirrors how
 * the synchronous SQLite driver behaved (callers queue instead of failing with "database is locked", and nothing
 * races across connections) without blocking the event loop.
 */
export function serialised(client: Client): Client {
  let tail: Promise<void> = Promise.resolve();
  const acquire = async (): Promise<() => void> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => (release = resolve));
    await previous;
    return release;
  };
  const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    const release = await acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
  return new Proxy(client, {
    get(target, property) {
      switch (property) {
        case "execute":
          return (statement: InStatement, args?: never) => exclusive(() => target.execute(statement as never, args));
        case "batch":
          return (statements: InStatement[], mode?: TransactionMode) => exclusive(() => target.batch(statements, mode));
        case "migrate":
          return (statements: InStatement[]) => exclusive(() => target.migrate(statements));
        case "executeMultiple":
          return (sql: string) => exclusive(() => target.executeMultiple(sql));
        case "transaction":
          return async (mode?: TransactionMode): Promise<Transaction> => {
            const release = await acquire();
            let released = false;
            const done = () => {
              if (!released) {
                released = true;
                release();
              }
            };
            try {
              const tx = await target.transaction(mode);
              return new Proxy(tx, {
                get(txTarget, txProperty) {
                  const value = Reflect.get(txTarget, txProperty, txTarget);
                  if (txProperty === "commit" || txProperty === "rollback" || txProperty === "close") {
                    return async (...args: unknown[]) => {
                      try {
                        return await (value as (...a: unknown[]) => unknown).apply(txTarget, args);
                      } finally {
                        done();
                      }
                    };
                  }
                  return typeof value === "function" ? value.bind(txTarget) : value;
                },
              });
            } catch (error) {
              done();
              throw error;
            }
          };
        default: {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    },
  });
}

/**
 * Apply pending migrations, then check the whole database for dangling references. The libSQL client runs the batch of
 * pending migrations as one transaction with foreign keys switched off (needed for SQLite table rebuilds); the check
 * afterwards fails loudly instead of leaving a silently inconsistent database.
 */
export async function migrateDatabase(db: Db, migrationsFolder: string = MIGRATIONS_DIR): Promise<void> {
  await migrate(db, { migrationsFolder });
  const violations = (await db.$client.execute("PRAGMA foreign_key_check")).rows;
  if (violations.length > 0) {
    const summary = violations
      .slice(0, 5)
      .map((row) => `${String(row.table)}#${String(row.rowid)} → ${String(row.parent)}`)
      .join(", ");
    throw new Error(`Database migration left ${violations.length} foreign key violation(s): ${summary}`);
  }
}

/** Number of migrations the code ships, from the journal. */
export function shippedMigrationCount(migrationsFolder: string = MIGRATIONS_DIR): number {
  return readMigrationFiles({ migrationsFolder }).length;
}

/**
 * The hosted database is migrated at deploy time (`npm run db:migrate`), never by whichever function instance starts
 * first (several can start at once). A database that is behind the code is a deployment error: say so clearly.
 */
export async function assertSchemaCurrent(db: Db, migrationsFolder: string = MIGRATIONS_DIR): Promise<void> {
  const expected = shippedMigrationCount(migrationsFolder);
  let applied: number;
  try {
    const result: ResultSet = await db.$client.execute("SELECT count(*) AS applied FROM __drizzle_migrations");
    applied = Number(result.rows[0]?.applied ?? 0);
  } catch {
    applied = 0; // table missing: never migrated
  }
  if (applied < expected) {
    throw new Error(`The database has ${applied} of ${expected} migrations applied. Run "npm run db:migrate" against it (it is a separate step from the build, run once before deploying a change that adds migrations).`);
  }
}
