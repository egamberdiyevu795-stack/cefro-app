import "server-only";
import { isTursoConfigured } from "@/server/db/target";
import { HttpError } from "@/server/errors";
import { getEnv } from "./env";
import { describeProviderMode, validateAuthConfig, validateProviderConfig, type ConfigProblem } from "./provider-config";
import { logger } from "@/server/logging/logger";

/**
 * Server configuration checks (providers, sign-in). Only variable names are ever logged or returned, never values.
 * No provider is contacted.
 *
 * Where the check is enforced, in production:
 * - Every API route (`withErrorHandling` in server/http.ts): 503 "service_not_configured" before the handler runs.
 * - The app's pages: home, login, register via `src/app/(entry)/layout.tsx`; the task list via `src/app/(site)/layout.tsx`;
 *   the practice page itself. The page fails (500).
 * - `/api/health`: reports "unavailable" (503), so a deploy with a bad configuration fails its health check.
 *
 * Not enforced in mock mode (`?mock=1`: the task list, practice, dashboard and History with demo data, which never
 * touch the database) and on the `/result` prototype. (The real `/dashboard` is not checked here either, but it reads
 * the database, so without one it fails anyway.) That is why the check no longer runs as a startup gate: a throwing instrumentation hook makes Next.js answer
 * 500 for EVERY route ("Failed to prepare server"), which took down pages that need nothing (e.g. a Vercel Preview
 * with no environment variables). See docs/DEPLOY_VERCEL.md, "What a Preview does".
 *
 * Development and tests: problems are logged, nothing is refused (mock providers and test overrides are legitimate).
 */

/** Every configuration problem of this server, or [] when it can serve students. */
export function serverConfigProblems(): ConfigProblem[] {
  let env;
  try {
    env = getEnv();
  } catch {
    return [{ variable: "(environment)", message: "invalid server configuration (see .env.example)" }];
  }
  return [...validateProviderConfig(env), ...validateAuthConfig(env)];
}

/** Are the routes that use providers or sign-in allowed to run? Always yes outside production. */
export function isServerConfigured(): boolean {
  let production: boolean;
  try {
    production = getEnv().NODE_ENV === "production";
  } catch {
    production = process.env.NODE_ENV === "production";
  }
  return !production || serverConfigProblems().length === 0;
}

/**
 * Call at the top of anything that needs the server configuration (API routes, the app's pages). In production a
 * misconfigured server refuses with 503; elsewhere it never throws. Details go to the log by `checkProvidersAtBoot`.
 */
export function assertServerConfigured(): void {
  if (isServerConfigured()) return;
  throw new HttpError(503, "service_not_configured", "CEFRO is not available right now. Please try again later.", 300);
}

/**
 * Runs once when the server starts (src/instrumentation.ts), not during `next build`. Logs every problem loudly
 * (variable names only). It does not throw: enforcement is per route, see above.
 */
export function checkProvidersAtBoot(): void {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    logger.error("Invalid server configuration (see .env.example)", { error });
    return;
  }

  const mode = describeProviderMode(env);
  const problems = [...validateProviderConfig(env), ...validateAuthConfig(env)];
  if (problems.length === 0) {
    logger.info("Provider configuration OK", { ...mode, database: isTursoConfigured(env) ? "turso" : "local-sqlite" });
    return;
  }
  for (const problem of problems) logger.error("Provider configuration problem", { ...mode, ...problem });
  if (env.NODE_ENV === "production") {
    logger.error("Server not configured: API routes, the app's pages and /api/health refuse until this is fixed", {
      variables: problems.map((p) => p.variable),
    });
  }
}
