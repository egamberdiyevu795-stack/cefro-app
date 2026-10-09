import "server-only";
import { INSECURE_DEV_AUTH_SECRET } from "@/server/auth/secret";
import { isFfmpegAvailable, isSpeechGuardEnabled } from "@/server/audio/speech-guard";
import { PREVIEW_TURSO_MESSAGE, isTursoConfigured, isTursoUrl, previewMayNotUseTurso } from "@/server/db/target";
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
    case "gemini":
      if (!env.GEMINI_API_KEY) problems.push({ variable: "GEMINI_API_KEY", message: "required when TRANSCRIPTION_PROVIDER=gemini" });
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

  // The Speech Activity Guard decodes audio with ffmpeg. Running without it would let silent recordings reach the
  // transcription provider, so a missing ffmpeg is a configuration problem, not something to skip silently.
  if (isSpeechGuardEnabled(env) && !isFfmpegAvailable(env.FFMPEG_PATH)) {
    problems.push({ variable: "FFMPEG_PATH", message: "ffmpeg is required by the speech activity guard (install ffmpeg, set FFMPEG_PATH, or SPEECH_GUARD=off for development)" });
  }

  problems.push(...validateDatabaseConfig(env));
  return problems;
}

/**
 * Database and storage configuration. The hosted database needs both its variables and an https address; and on
 * Vercel it is mandatory, because a function's filesystem belongs to a single instance and is wiped on cold starts and
 * redeploys, so a local SQLite file or local recordings would make attempts vanish between requests.
 */
export function validateDatabaseConfig(env: ServerEnv): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const url = env.TURSO_DATABASE_URL;
  const token = env.TURSO_AUTH_TOKEN;
  if (url && !token) problems.push({ variable: "TURSO_AUTH_TOKEN", message: "required when TURSO_DATABASE_URL is set" });
  if (token && !url) problems.push({ variable: "TURSO_DATABASE_URL", message: "required when TURSO_AUTH_TOKEN is set" });
  if (url && !isTursoUrl(url)) problems.push({ variable: "TURSO_DATABASE_URL", message: "must be a libsql:// or https:// address" });
  if (previewMayNotUseTurso(env)) problems.push({ variable: "TURSO_DATABASE_URL", message: PREVIEW_TURSO_MESSAGE });
  if (process.env.VERCEL && !isTursoConfigured(env)) {
    problems.push({
      variable: "TURSO_DATABASE_URL",
      message: "required on Vercel together with TURSO_AUTH_TOKEN: function instances share no filesystem, so a local database would lose attempts",
    });
  }
  if (env.AUDIO_STORAGE_PROVIDER === "database" && !isTursoConfigured(env) && process.env.VERCEL) {
    problems.push({ variable: "AUDIO_STORAGE_PROVIDER", message: "recordings in the database need the hosted database on Vercel" });
  }
  if (env.AUDIO_STORAGE_PROVIDER === "local" && process.env.VERCEL) {
    problems.push({ variable: "AUDIO_STORAGE_PROVIDER", message: "local recordings are lost between Vercel function instances; use auto or database" });
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
