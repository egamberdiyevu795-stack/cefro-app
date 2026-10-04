import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

/**
 * Minimal structured logger (JSON lines to stdout/stderr).
 *
 * Technical error details belong here — never in responses to students.
 * Swap the implementation for a hosted logger later without changing callers.
 */
/**
 * Credentials must never reach a log line, whatever error carried them. Any configured secret (database token and
 * address, signing secret, provider keys) is replaced in the serialised line.
 */
const SECRET_VARIABLES = ["TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL", "AUTH_SECRET", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

export function redactSecrets(line: string, env: NodeJS.ProcessEnv = process.env): string {
  const secrets = new Set<string>();
  for (const name of SECRET_VARIABLES) {
    const value = env[name];
    if (!value || value.length < 8) continue;
    secrets.add(value);
    if (name === "TURSO_DATABASE_URL") {
      try {
        secrets.add(new URL(value.replace(/^libsql:/, "https:")).host);
      } catch {
        /* not a URL */
      }
    }
  }
  return [...secrets].sort((a, b) => b.length - a.length).reduce((out, secret) => out.split(secret).join("[redacted]"), line);
}

function write(level: Level, message: string, context?: Context) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? serialiseContext(context) : {}),
  };
  const line = redactSecrets(JSON.stringify(entry));
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

function serialiseContext(context: Context): Context {
  const out: Context = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack, cause: describeCause(value) }
        : value;
  }
  return out;
}

function describeCause(error: Error): unknown {
  const cause = (error as { cause?: unknown }).cause;
  return cause instanceof Error ? { name: cause.name, message: cause.message } : cause;
}

export const logger = {
  debug: (message: string, context?: Context) => write("debug", message, context),
  info: (message: string, context?: Context) => write("info", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, context?: Context) => write("error", message, context),
};
