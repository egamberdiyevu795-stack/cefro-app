import "server-only";
import { INSECURE_DEV_AUTH_SECRET } from "@/server/auth/secret";
import type { ServerEnv } from "./env";

/**
 * Early, offline validation of provider configuration. It never calls a provider and never reports a
 * secret's value: only variable names and what is wrong with them.
 */
export interface ConfigProblem {
  variable: string;
  message: string;
}

export interface ProviderMode {
  transcription: ServerEnv["TRANSCRIPTION_PROVIDER"];
  evaluation: ServerEnv["EVALUATION_PROVIDER"];
  /** "real" = both providers are real services; "development_mock" = at least one is a mock. */
  mode: "real" | "development_mock";
}

export function describeProviderMode(env: ServerEnv): ProviderMode {
  const mock = env.TRANSCRIPTION_PROVIDER === "mock" || env.EVALUATION_PROVIDER === "mock";
  return { transcription: env.TRANSCRIPTION_PROVIDER, evaluation: env.EVALUATION_PROVIDER, mode: mock ? "development_mock" : "real" };
}

export function validateProviderConfig(env: ServerEnv): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const production = env.NODE_ENV === "production";

  switch (env.TRANSCRIPTION_PROVIDER) {
    case "openai":
      if (!env.OPENAI_API_KEY) problems.push({ variable: "OPENAI_API_KEY", message: "required when TRANSCRIPTION_PROVIDER=openai" });
      break;
    case "mock":
      if (production) problems.push({ variable: "TRANSCRIPTION_PROVIDER", message: "the mock transcriber is development-only and is refused in production" });
      break;
  }

  switch (env.EVALUATION_PROVIDER) {
    case "gemini":
      if (!env.GEMINI_API_KEY) problems.push({ variable: "GEMINI_API_KEY", message: "required when EVALUATION_PROVIDER=gemini" });
      break;
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) problems.push({ variable: "ANTHROPIC_API_KEY", message: "required when EVALUATION_PROVIDER=anthropic" });
      break;
    case "mock":
      if (production) problems.push({ variable: "EVALUATION_PROVIDER", message: "the mock evaluator is development-only and is refused in production" });
      break;
  }

  return problems;
}

/** Authentication configuration. Production must have a real secret (the development fallback is public) and a public https origin. */
export function validateAuthConfig(env: ServerEnv): ConfigProblem[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: ConfigProblem[] = [];
  if (!env.AUTH_SECRET) problems.push({ variable: "AUTH_SECRET", message: "required in production (32+ random characters); it signs the login-session cookie" });
  else if (env.AUTH_SECRET === INSECURE_DEV_AUTH_SECRET) problems.push({ variable: "AUTH_SECRET", message: "is the public development value; set a real secret" });
  if (!env.APP_URL) problems.push({ variable: "APP_URL", message: "required in production (the public https origin, e.g. https://app.example.com); the sign-in origin check uses it" });
  else if (!env.APP_URL.startsWith("https://")) problems.push({ variable: "APP_URL", message: "must be an https:// URL in production (login cookies are Secure)" });
  return problems;
}
