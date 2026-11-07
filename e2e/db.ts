import path from "node:path";
import { createClient } from "@libsql/client";

/**
 * Direct access to this run's throwaway database (`./data/e2e/<run id>.db`, see playwright.config.ts), for the few
 * states the app itself refuses to create: an exam date in the past, an attempt that failed. Test-only.
 */
export async function runSql(sql: string, args: Array<string | number | null> = []): Promise<number> {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) throw new Error("E2E_RUN_ID is not set: run the tests through playwright.config.ts");
  const client = createClient({ url: `file:${path.resolve("data/e2e", `${runId}.db`)}` });
  try {
    return (await client.execute({ sql, args })).rowsAffected;
  } finally {
    client.close();
  }
}
