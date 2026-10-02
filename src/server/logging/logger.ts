import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

/**
 * Minimal structured logger (JSON lines to stdout/stderr).
 *
 * Technical error details belong here — never in responses to students.
 * Swap the implementation for a hosted logger later without changing callers.
 */
function write(level: Level, message: string, context?: Context) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? serialiseContext(context) : {}),
  };
  const line = JSON.stringify(entry);
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
