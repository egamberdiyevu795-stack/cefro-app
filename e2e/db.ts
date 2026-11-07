import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

/**
 * Direct access to this run's throwaway database (`./data/e2e/<run id>.db`, see playwright.config.ts), for the few
 * states the app itself refuses to create: an exam date in the past, an attempt that failed. Test-only.
 */

/** Where this run's throwaway databases live, under the project. Nothing else may be opened. */
export const E2E_DATA_DIR = path.join("data", "e2e");

/**
 * The run's throwaway database file, or an error. The guard: the run id is the number playwright.config.ts made
 * (`Date.now()`), the file is directly inside `<root>/data/e2e/`, it already exists (the test server created it:
 * nothing new is ever created here), and it is a plain local file (no URL, so never a hosted database).
 */
export function throwawayDatabasePath(runId: string | undefined, root: string = process.cwd()): string {
  if (!runId) throw new Error("e2e/db: E2E_RUN_ID is not set; run the tests through playwright.config.ts");
  if (!/^\d{13}$/.test(runId)) throw new Error(`e2e/db: refusing run id "${runId}": not a test run id`);
  const dir = path.resolve(root, E2E_DATA_DIR);
  const file = path.resolve(dir, `${runId}.db`);
  if (path.dirname(file) !== dir) throw new Error(`e2e/db: refusing ${file}: not in ${dir}`);
  const real = fs.existsSync(file) ? fs.realpathSync(file) : null;
  if (!real) throw new Error(`e2e/db: refusing ${file}: no such test database (the test server creates it)`);
  if (path.dirname(real) !== fs.realpathSync(dir)) throw new Error(`e2e/db: refusing ${file}: it links outside ${dir}`);
  return real;
}

export async function runSql(sql: string, args: Array<string | number | null> = []): Promise<number> {
  const client = createClient({ url: `file:${throwawayDatabasePath(process.env.E2E_RUN_ID)}` });
  try {
    return (await client.execute({ sql, args })).rowsAffected;
  } finally {
    client.close();
  }
}
