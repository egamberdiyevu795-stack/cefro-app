import "server-only";
import { z } from "zod";

/**
 * Server configuration, read from environment variables and validated once.
 * Never import this module from client components (enforced by `server-only`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Local SQLite file, used when no Turso database is configured (development, tests, self-hosting with a disk). */
  DATABASE_PATH: z.string().default("./data/cefro.db"),
  /**
   * Hosted database (Turso/libSQL). When BOTH are set the app uses it instead of the local file: this is what makes
   * state and recordings visible to every serverless instance. Server-side only: never prefix with NEXT_PUBLIC_.
   */
  TURSO_DATABASE_URL: z.string().min(1).optional(),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),
  /** Upper bound for one request to the hosted database (a stalled connection must end in an error, not hang). */
  /**
   * Set by Vercel: "production", "preview" or "development". A Preview deployment is refused the Turso credentials
   * (see db/target.ts) unless CEFRO_ALLOW_PREVIEW_TURSO is "true", so a Preview can never read or write the production database.
   */
  VERCEL_ENV: z.string().optional(),
  /** "true" only when Preview deployments deliberately use their own, separate Turso database. */
  CEFRO_ALLOW_PREVIEW_TURSO: z.string().optional(),
  DATABASE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),

  /**
   * Where recordings are kept. "auto": the database (table recording_blobs) when a hosted database is configured,
   * otherwise files under AUDIO_STORAGE_DIR. "database" and "local" force one of them.
   */
  AUDIO_STORAGE_PROVIDER: z.enum(["auto", "local", "database"]).default("auto"),
  AUDIO_STORAGE_DIR: z.string().default("./data/audio"),

  TRANSCRIPTION_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("openai"),
  /**
   * Second speech-to-text provider, tried when the primary one fails with a provider error (timeout, rate limit,
   * outage). Never used for "no speech" results. "none" = no fallback. Set e.g. TRANSCRIPTION_PROVIDER=gemini with
   * TRANSCRIPTION_FALLBACK_PROVIDER=openai to switch to Gemini and keep OpenAI as the fallback.
   */
  TRANSCRIPTION_FALLBACK_PROVIDER: z.enum(["none", "openai", "gemini"]).default("none"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),

  EVALUATION_PROVIDER: z.enum(["anthropic", "gemini", "mock"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_EVALUATION_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EVALUATION_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  ANTHROPIC_EVALUATION_MAX_TOKENS: z.coerce.number().int().min(4000).max(128_000).default(16_000),
  /** Server-side refusal fallback (beta). Set to "false" if your account rejects the beta header. */
  ANTHROPIC_SERVER_FALLBACKS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),

  /**
   * Speech Activity Guard: recordings without enough speech never reach the transcription provider (models can invent
   * an answer for silence). "auto" = on for real providers, off for the development mock; "on"/"off" force it.
   * Needs ffmpeg when on (docs/AI_EVALUATION_QUALITY.md, Speech Activity Guard).
   */
  SPEECH_GUARD: z.enum(["auto", "on", "off"]).default("auto"),
  /** Unset = use the ffmpeg on PATH if there is one, otherwise the binary bundled with the ffmpeg-static package (Vercel). */
  FFMPEG_PATH: z.string().min(1).optional(),

  GEMINI_API_KEY: z.string().optional(),
  /**
   * Gemini model for evaluation. Pinned to the model ID the API itself reported answering
   * a "gemini-flash-latest" request, and verified by a successful run requesting this exact ID
   * (docs/AI_EVALUATION_QUALITY.md). The "-latest" alias moves silently; change this
   * deliberately and re-run the live validation.
   */
  GEMINI_EVALUATION_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  /**
   * Gemini model for speech-to-text when TRANSCRIPTION_PROVIDER=gemini. Defaults to the evaluation model. Fidelity to
   * what the learner actually said was validated only on synthetic speech: docs/AI_EVALUATION_QUALITY.md.
   */
  GEMINI_TRANSCRIPTION_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  /**
   * Audio step of the Multilevel evaluation: a model listens to the recording and judges pronunciation (intelligibility
   * and listener strain only) and pausing. "auto" = Gemini when GEMINI_API_KEY is set and the evaluator is not the
   * development mock; "gemini" forces it (GEMINI_API_KEY required); "off" disables it. Without it, pronunciation is
   * "not assessed" and every band is marked provisional.
   */
  AUDIO_ASSESSMENT: z.enum(["auto", "gemini", "off"]).default("auto"),
  GEMINI_AUDIO_ASSESSMENT_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  /** Thinking models spend output tokens on reasoning, so keep this generous. */
  GEMINI_EVALUATION_MAX_TOKENS: z.coerce.number().int().min(4000).max(65_000).default(24_000),
  /**
   * How much the Gemini evaluator reasons before answering. "high" by default: assessment quality matters more than a
   * few seconds of waiting. Only valid for models that support thinking levels.
   */
  GEMINI_THINKING_LEVEL: z.enum(["minimal", "low", "medium", "high"]).default("high"),
  /**
   * Sampling temperature for the Gemini evaluator. 0 (the lowest the API accepts) by default, so the same transcript
   * gives the same judgements as often as possible. Google suggests 1.0 for Gemini 3 thinking models (lower values can
   * cause repetition); raise it if live runs show looping or truncated output.
   */
  GEMINI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  /**
   * "schema": send the JSON schema to the API (constrained decoding) and in the prompt.
   * "json": only request JSON and describe the shape in the prompt. Escape hatch if the API
   * rejects the schema. Our own validation applies in both modes.
   */
  GEMINI_STRUCTURED_OUTPUT: z.enum(["schema", "json"]).default("schema"),

  /**
   * Usage limits (server-enforced, per anonymous or future signed-in user, plus one global ceiling).
   * Rationale and tuning: docs/ARCHITECTURE_DECISIONS.md, "Cost and abuse protection".
   */
  LIMIT_ATTEMPTS_PER_USER_HOUR: z.coerce.number().int().positive().default(15),
  LIMIT_ATTEMPTS_PER_USER_DAY: z.coerce.number().int().positive().default(60),
  LIMIT_CONCURRENT_PROCESSING_PER_USER: z.coerce.number().int().positive().default(2),
  /** Backstop against many anonymous identities (clearing cookies): total new attempts per hour. */
  LIMIT_ATTEMPTS_GLOBAL_HOUR: z.coerce.number().int().positive().default(600),
  /** Processing runs per attempt: the first run plus manual restarts and stalled re-claims. */
  LIMIT_PROCESSING_RUNS_PER_ATTEMPT: z.coerce.number().int().positive().default(3),

  /**
   * Wall-clock budget for one processing run (transcription + evaluation). Must stay below the route's
   * maxDuration (300 s) so a slow provider ends in a stored failure instead of a killed request.
   */
  PROCESSING_BUDGET_MS: z.coerce.number().int().min(10_000).max(290_000).default(270_000),

  /**
   * Secret that signs the login-session cookie (server/auth). REQUIRED in production (32+ random characters,
   * e.g. `openssl rand -base64 48`); the boot check refuses to start without it. Development and tests fall
   * back to a fixed, public value, which is why it must never be used in production.
   */
  AUTH_SECRET: z.string().min(32).optional(),
  /** Public origin of the app (e.g. https://app.example.com). Used for the auth origin check; inferred from the request when unset. */
  APP_URL: z.string().url().optional(),
  /**
   * Login/registration abuse limits (in-memory, per process; see docs/ARCHITECTURE_DECISIONS.md and
   * server/auth/auth-limits.ts). A classroom shares one address (school Wi-Fi, a mobile network), so the per-IP limits
   * let a whole class sign up and sign in together, while the per-account limit keeps guessing one person's password
   * slow wherever the guesses come from without letting a classmate lock someone out everywhere.
   */
  /** Wrong passwords per account and client IP (sign-in, Change password, Delete my account share it). */
  LIMIT_LOGIN_FAILURES_PER_EMAIL_IP_15MIN: z.coerce.number().int().positive().default(5),
  /** Wrong passwords per account in total, from any IP. */
  LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN: z.coerce.number().int().positive().default(20),
  LIMIT_LOGIN_FAILURES_PER_IP_15MIN: z.coerce.number().int().positive().default(100),
  LIMIT_REGISTRATIONS_PER_IP_HOUR: z.coerce.number().int().positive().default(30),
  LIMIT_REGISTRATIONS_GLOBAL_HOUR: z.coerce.number().int().positive().default(300),

  /**
   * Pilot consent (docs/consent-design.md, "Pilot route"; docs/launch-checklist.md). "true": only accounts whose consent
   * the owner recorded (scripts/set-consent.mjs) may record or be scored, and teacher sharing also needs the
   * teacher-sharing flag; guests never record. "false" (the default, also in tests and always in mock mode): no lock.
   * Set it to "true" in Vercel Production before inviting pilot testers.
   */
  CONSENT_REQUIRED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /**
   * Shared secret for the daily audio-retention job (GET /api/cron/audio-retention). Vercel Cron sends it as
   * "Authorization: Bearer <CRON_SECRET>". Unset: the job refuses every call (also when it is shorter than 16 characters).
   */
  CRON_SECRET: z.string().optional(),

  /** Timeouts for external providers, in milliseconds. */
  TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  EVALUATION_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
});

export type ServerEnv = z.infer<typeof envSchema>;

/**
 * Defaults that depend on the hosting platform, applied only for values that are not set explicitly.
 * On Vercel the public origin is taken from the platform's own variables, so no APP_URL has to be configured.
 * Storage is deliberately NOT defaulted here: a function's filesystem is private to one instance and is lost, so
 * Vercel requires the hosted database (see validateDatabaseConfig).
 */
export function applyHostingDefaults(raw: Record<string, string | undefined>): Record<string, string | undefined> {
  if (!raw.VERCEL) return raw;
  const host = raw.VERCEL_PROJECT_PRODUCTION_URL || raw.VERCEL_URL;
  return { ...raw, ...(raw.APP_URL || !host ? {} : { APP_URL: `https://${host}` }) };
}

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (!cached) {
    // Treat empty strings (common in .env files) as "not set".
    const raw = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== ""),
    );
    cached = envSchema.parse(applyHostingDefaults(raw));
  }
  return cached;
}
