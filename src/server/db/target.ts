import "server-only";
import type { ServerEnv } from "@/server/config/env";

/**
 * Which database the app talks to, decided from configuration alone (no I/O, so it is easy to test).
 *
 *  - Both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN set: the hosted libSQL database, reached over HTTPS. This is the
 *    setup for serverless hosting, where every function instance must see the same data.
 *  - Neither set: a local SQLite file (development, tests, a self-hosted server with a disk).
 *  - Only one of the two: a configuration error, never a silent fallback to a local file.
 */
export type DatabaseTarget =
  | { kind: "turso"; url: string; authToken: string; timeoutMs: number }
  | { kind: "file"; path: string };

type DatabaseEnv = Pick<ServerEnv, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN" | "DATABASE_PATH" | "DATABASE_TIMEOUT_MS">;

/** The HTTP client talks https; `libsql://` is the same server addressed with Turso's own scheme. */
export function normalizeTursoUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.startsWith("libsql://") ? `https://${trimmed.slice("libsql://".length)}` : trimmed;
}

export function isTursoUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeTursoUrl(url));
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function resolveDatabaseTarget(env: DatabaseEnv): DatabaseTarget {
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;
  if (url && authToken) return { kind: "turso", url: normalizeTursoUrl(url), authToken, timeoutMs: env.DATABASE_TIMEOUT_MS };
  if (url || authToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set together (only one of them is set)");
  }
  return { kind: "file", path: env.DATABASE_PATH };
}

export function isTursoConfigured(env: Pick<ServerEnv, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">): boolean {
  return Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

/** Replace credentials (token, URL, host) in any text that might be logged or shown. */
export function redactDatabaseSecrets(text: string, env: Pick<ServerEnv, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">): string {
  const secrets: string[] = [];
  if (env.TURSO_AUTH_TOKEN) secrets.push(env.TURSO_AUTH_TOKEN);
  if (env.TURSO_DATABASE_URL) {
    secrets.push(env.TURSO_DATABASE_URL, normalizeTursoUrl(env.TURSO_DATABASE_URL));
    try {
      secrets.push(new URL(normalizeTursoUrl(env.TURSO_DATABASE_URL)).host);
    } catch {
      /* not a URL: nothing more to add */
    }
  }
  return secrets
    .filter((secret) => secret.length >= 6)
    .sort((a, b) => b.length - a.length)
    .reduce((out, secret) => out.split(secret).join("[redacted]"), text);
}
