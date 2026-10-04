import "server-only";
import { getEnv } from "@/server/config/env";
import { redactDatabaseSecrets } from "./target";

/** The database could not be opened or reached (configuration, connectivity, timeout, not migrated). Never a missing row. */
export class DatabaseUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseUnavailableError";
  }
}

/** Constraint and SQL errors are bugs or data conflicts, not an unavailable database. */
const NOT_AVAILABILITY_CODES = /^SQLITE_(CONSTRAINT|ERROR|MISMATCH|RANGE|TOOBIG|FULL|READONLY|AUTH|MISUSE)/;

/**
 * Is this (or something it wraps) the database being unreachable or failing, as opposed to an ordinary application
 * error? Used to answer 503 with a retry hint instead of a misleading 404 or a generic 500, and to keep a database
 * outage from being mistaken for "not logged in" or "no such attempt".
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current instanceof DatabaseUnavailableError) return true;
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      if ((current.name === "LibsqlError" || current.name === "LibsqlBatchError") && !(typeof code === "string" && NOT_AVAILABILITY_CODES.test(code))) return true;
      if (current.name === "TimeoutError" || current.name === "AbortError") return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Text safe to log: any Turso credential, address or token is replaced. */
export function safeDatabaseMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  try {
    return redactDatabaseSecrets(message, getEnv());
  } catch {
    return message;
  }
}
