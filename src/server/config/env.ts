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

  TRANSCRIPTION_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
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

  GEMINI_API_KEY: z.string().optional(),
  /**
   * Gemini model for evaluation. Pinned to the model ID the API itself reported answering
   * a "gemini-flash-latest" request, and verified by a successful run requesting this exact ID
   * (docs/AI_EVALUATION_QUALITY.md). The "-latest" alias moves silently; change this
   * deliberately and re-run the live validation.
   */
  GEMINI_EVALUATION_MODEL: z.string().min(1).default("gemini-3.8-flash"),
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
