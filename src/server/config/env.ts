import "server-only";
import { z } from "zod";

/**
 * Server configuration, read from environment variables and validated once.
 * Never import this module from client components (enforced by `server-only`).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_PATH: z.string().default("./data/cefro.db"),

  AUDIO_STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  AUDIO_STORAGE_DIR: z.string().default("./data/audio"),

  TRANSCRIPTION_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("openai"),
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
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),

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
  /** Thinking models spend output tokens on reasoning, so keep this generous. */
  GEMINI_EVALUATION_MAX_TOKENS: z.coerce.number().int().min(4000).max(65_000).default(24_000),
  /** Unset = model default. Only set this for models that support thinking levels. */
  GEMINI_THINKING_LEVEL: z.enum(["minimal", "low", "medium", "high"]).optional(),
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
  /** Login/registration abuse limits (in-memory, per process; see docs/ARCHITECTURE_DECISIONS.md). */
  LIMIT_LOGIN_FAILURES_PER_EMAIL_15MIN: z.coerce.number().int().positive().default(8),
  LIMIT_LOGIN_FAILURES_PER_IP_15MIN: z.coerce.number().int().positive().default(30),
  LIMIT_REGISTRATIONS_PER_IP_HOUR: z.coerce.number().int().positive().default(10),
  LIMIT_REGISTRATIONS_GLOBAL_HOUR: z.coerce.number().int().positive().default(100),

  /** Timeouts for external providers, in milliseconds. */
  TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  EVALUATION_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (!cached) {
    // Treat empty strings (common in .env files) as "not set".
    const raw = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== ""),
    );
    cached = envSchema.parse(raw);
  }
  return cached;
}
