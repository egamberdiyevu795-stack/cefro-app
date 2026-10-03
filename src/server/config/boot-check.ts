import "server-only";
import { getEnv } from "./env";
import { describeProviderMode, usesTemporaryStorage, validateAuthConfig, validateProviderConfig } from "./provider-config";
import { logger } from "@/server/logging/logger";

/**
 * Runs once when the server starts (src/instrumentation.ts), not during `next build`.
 *
 * - Production: a misconfigured provider makes registration throw. Next.js then reports "Failed to
 *   prepare server" and every request returns 500 (verified with `next start`), so a health check fails
 *   and a bad deploy is caught instead of students recording answers that can never be evaluated.
 *   (The process itself stays up: Next does not exit on an instrumentation error.)
 * - Development and tests: the problem is logged loudly but the server still starts (mock providers
 *   and test overrides are legitimate there).
 * Only variable names are logged, never values. No provider is contacted.
 */
export function checkProvidersAtBoot(): void {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    logger.error("Invalid server configuration (see .env.example)", { error });
    if (process.env.NODE_ENV === "production") throw new Error("Invalid server configuration");
    return;
  }

  if (usesTemporaryStorage(env)) {
    logger.warn(
      "Database and recordings are in the platform's temporary directory: instance-local, lost on cold starts and redeploys. Test deployment only (docs/DEPLOY_VERCEL.md).",
    );
  }

  const mode = describeProviderMode(env);
  const problems = [...validateProviderConfig(env), ...validateAuthConfig(env)];
  if (problems.length === 0) {
    logger.info("Provider configuration OK", { ...mode });
    return;
  }
  for (const problem of problems) logger.error("Provider configuration problem", { ...mode, ...problem });
  if (env.NODE_ENV === "production") {
    throw new Error(`Invalid provider configuration: ${problems.map((p) => p.variable).join(", ")}`);
  }
}
