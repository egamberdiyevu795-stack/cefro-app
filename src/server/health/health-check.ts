import "server-only";
import { assertSchemaCurrent, getDb } from "@/server/db/client";
import { safeDatabaseMessage } from "@/server/db/errors";
import { logger } from "@/server/logging/logger";

/**
 * Is this deployment able to serve? That means: the database it is configured for can be reached with the credentials
 * it actually runs with, and it has been migrated to the schema this code expects.
 *
 * It answers yes or no only. Why it is "no" goes to the server log (redacted), never to the caller: the endpoint is
 * public, so it must not reveal configuration, versions, table names or error text.
 *
 * The answer is kept for a few seconds so that polling cannot turn into database load.
 */
const CACHE_MS = 5_000;
let cached: { at: number; healthy: boolean } | undefined;

export async function isHealthy(now: number = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < CACHE_MS) return cached.healthy;
  let healthy = false;
  try {
    const db = await getDb();
    await db.$client.execute("SELECT 1");
    await assertSchemaCurrent(db);
    healthy = true;
  } catch (error) {
    logger.error("Health check failed", { detail: safeDatabaseMessage(error) });
  }
  cached = { at: now, healthy };
  return healthy;
}

export function resetHealthCacheForTesting() {
  cached = undefined;
}
