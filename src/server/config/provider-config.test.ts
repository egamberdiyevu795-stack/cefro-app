import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "./env";

const state = vi.hoisted(() => ({ env: {} as Record<string, unknown>, throwOnParse: false }));
vi.mock("./env", () => ({
  getEnv: () => {
    if (state.throwOnParse) throw new Error("zod: invalid");
    return state.env;
  },
}));
const logs = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("@/server/logging/logger", () => ({ logger: logs }));

import { checkProvidersAtBoot } from "./boot-check";
import { INSECURE_DEV_AUTH_SECRET } from "@/server/auth/secret";
import { describeProviderMode, validateAuthConfig, validateDatabaseConfig, validateProviderConfig } from "./provider-config";

const env = (overrides: Record<string, unknown>) =>
  ({ NODE_ENV: "development", TRANSCRIPTION_PROVIDER: "openai", EVALUATION_PROVIDER: "gemini", SPEECH_GUARD: "off", ...overrides }) as unknown as ServerEnv;

describe("validateProviderConfig", () => {
  it("accepts a complete real configuration (Gemini evaluation + OpenAI transcription)", () => {
    expect(validateProviderConfig(env({ OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" }))).toEqual([]);
    expect(describeProviderMode(env({}))).toEqual({ transcription: "openai", evaluation: "gemini", mode: "real" });
  });

  it("names the missing variable for each real provider", () => {
    expect(validateProviderConfig(env({})).map((p) => p.variable)).toEqual(["OPENAI_API_KEY", "GEMINI_API_KEY"]);
    expect(validateProviderConfig(env({ OPENAI_API_KEY: "k", EVALUATION_PROVIDER: "anthropic" })).map((p) => p.variable)).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("accepts Gemini for both roles with a single key, and names it when missing", () => {
    const both = env({ TRANSCRIPTION_PROVIDER: "gemini", EVALUATION_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(validateProviderConfig(both)).toEqual([]);
    expect(describeProviderMode(both)).toEqual({ transcription: "gemini", evaluation: "gemini", mode: "real" });
    expect(validateProviderConfig(env({ TRANSCRIPTION_PROVIDER: "gemini", EVALUATION_PROVIDER: "gemini" })).map((p) => p.variable)).toEqual(["GEMINI_API_KEY", "GEMINI_API_KEY"]);
  });

  it("requires ffmpeg for the speech activity guard, and says which setting to change", () => {
    const base = { OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" };
    // A tiny executable that exits 0 stands in for an installed ffmpeg without needing one on the machine.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-fake-ffmpeg-"));
    const fake = path.join(dir, "ffmpeg");
    fs.writeFileSync(fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    expect(validateProviderConfig(env({ ...base, SPEECH_GUARD: "on", FFMPEG_PATH: fake }))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(validateProviderConfig(env({ ...base, SPEECH_GUARD: "on", FFMPEG_PATH: "/nonexistent/ffmpeg" })).map((p) => p.variable)).toEqual(["FFMPEG_PATH"]);
    expect(validateProviderConfig(env({ ...base, SPEECH_GUARD: "auto", FFMPEG_PATH: "/nonexistent/ffmpeg" })).map((p) => p.variable)).toEqual(["FFMPEG_PATH"]);
    expect(validateProviderConfig(env({ ...base, SPEECH_GUARD: "off", FFMPEG_PATH: "/nonexistent/ffmpeg" }))).toEqual([]);
    // auto + the development mock transcriber: the guard is off, so ffmpeg is not required
    expect(validateProviderConfig(env({ TRANSCRIPTION_PROVIDER: "mock", EVALUATION_PROVIDER: "mock", SPEECH_GUARD: "auto", FFMPEG_PATH: "/nonexistent/ffmpeg" }))).toEqual([]);
  });

  it("only requires the selected provider's key", () => {
    expect(validateProviderConfig(env({ OPENAI_API_KEY: "k", GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: undefined }))).toEqual([]);
  });

  it("distinguishes development mock mode from real mode", () => {
    const mocks = env({ TRANSCRIPTION_PROVIDER: "mock", EVALUATION_PROVIDER: "mock" });
    expect(validateProviderConfig(mocks)).toEqual([]); // fine in development and tests
    expect(describeProviderMode(mocks).mode).toBe("development_mock");
    expect(describeProviderMode(env({ TRANSCRIPTION_PROVIDER: "mock", GEMINI_API_KEY: "k" })).mode).toBe("development_mock");
  });

  it("refuses mock providers in production", () => {
    const problems = validateProviderConfig(env({ NODE_ENV: "production", TRANSCRIPTION_PROVIDER: "mock", EVALUATION_PROVIDER: "mock" }));
    expect(problems.map((p) => p.variable)).toEqual(["TRANSCRIPTION_PROVIDER", "EVALUATION_PROVIDER"]);
  });

  it("never includes a secret value in what it reports", () => {
    const secret = "sk-super-secret-value";
    const problems = validateProviderConfig(env({ OPENAI_API_KEY: secret, EVALUATION_PROVIDER: "anthropic" }));
    expect(JSON.stringify(problems)).not.toContain(secret);
  });
});

describe("checkProvidersAtBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.throwOnParse = false;
  });

  it("logs success and does not throw when configured", () => {
    state.env = env({ NODE_ENV: "production", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k", AUTH_SECRET: "x".repeat(40), APP_URL: "https://app.example.com" });
    expect(() => checkProvidersAtBoot()).not.toThrow();
    expect(logs.info).toHaveBeenCalledWith("Provider configuration OK", expect.objectContaining({ mode: "real" }));
  });

  it("throws in production (making the server unhealthy), naming only variables", () => {
    state.env = env({ NODE_ENV: "production", OPENAI_API_KEY: "sk-do-not-print" });
    expect(() => checkProvidersAtBoot()).toThrow(/GEMINI_API_KEY/);
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain("sk-do-not-print");
  });

  it("only warns in development and test, so those environments keep working", () => {
    state.env = env({ NODE_ENV: "development" });
    expect(() => checkProvidersAtBoot()).not.toThrow();
    expect(logs.error).toHaveBeenCalledWith("Provider configuration problem", expect.objectContaining({ variable: "OPENAI_API_KEY" }));
    state.env = env({ NODE_ENV: "test" });
    expect(() => checkProvidersAtBoot()).not.toThrow();
  });

  it("handles an invalid environment without crashing outside production", () => {
    state.throwOnParse = true;
    const original = process.env.NODE_ENV;
    expect(() => checkProvidersAtBoot()).not.toThrow(); // vitest runs with NODE_ENV=test
    expect(process.env.NODE_ENV).toBe(original);
  });
});

describe("validateAuthConfig", () => {
  const SECRET = "x".repeat(40);
  it("requires a real AUTH_SECRET in production", () => {
    const APP_URL = "https://app.example.com";
    expect(validateAuthConfig(env({ NODE_ENV: "production" })).map((p) => p.variable)).toEqual(["AUTH_SECRET", "APP_URL"]);
    expect(validateAuthConfig(env({ NODE_ENV: "production", AUTH_SECRET: INSECURE_DEV_AUTH_SECRET, APP_URL })).map((p) => p.variable)).toEqual(["AUTH_SECRET"]);
    expect(validateAuthConfig(env({ NODE_ENV: "production", AUTH_SECRET: SECRET, APP_URL: "http://app.example.com" })).map((p) => p.variable)).toEqual(["APP_URL"]);
    expect(validateAuthConfig(env({ NODE_ENV: "production", AUTH_SECRET: SECRET, APP_URL }))).toEqual([]);
  });

  it("does not require it in development and tests (a public development value is used there)", () => {
    expect(validateAuthConfig(env({ NODE_ENV: "development" }))).toEqual([]);
    expect(validateAuthConfig(env({ NODE_ENV: "test" }))).toEqual([]);
  });

  it("never reports the secret's value", () => {
    expect(JSON.stringify(validateAuthConfig(env({ NODE_ENV: "production", AUTH_SECRET: INSECURE_DEV_AUTH_SECRET })))).not.toContain(INSECURE_DEV_AUTH_SECRET);
  });

  it("makes the production boot check fail without it", () => {
    vi.clearAllMocks();
    state.throwOnParse = false;
    state.env = env({ NODE_ENV: "production", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" });
    expect(() => checkProvidersAtBoot()).toThrow(/AUTH_SECRET/);
    state.env = env({ NODE_ENV: "production", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k", AUTH_SECRET: SECRET, APP_URL: "https://app.example.com" });
    expect(() => checkProvidersAtBoot()).not.toThrow();
  });
});


describe("validateDatabaseConfig", () => {
  const TURSO = { TURSO_DATABASE_URL: "libsql://db-org.turso.io", TURSO_AUTH_TOKEN: "token-token", AUDIO_STORAGE_PROVIDER: "auto" };
  const local = { AUDIO_STORAGE_PROVIDER: "auto" };
  const vars = (e: Record<string, unknown>) => validateDatabaseConfig(env(e)).map((p) => p.variable);

  afterEach(() => vi.unstubAllEnvs());

  it("accepts local development with no Turso variables, and a complete Turso pair", () => {
    expect(vars(local)).toEqual([]);
    expect(vars(TURSO)).toEqual([]);
    expect(vars({ ...TURSO, TURSO_DATABASE_URL: "https://db-org.turso.io" })).toEqual([]);
  });

  it("names the missing half when only one of the two is set", () => {
    expect(vars({ ...local, TURSO_DATABASE_URL: TURSO.TURSO_DATABASE_URL })).toEqual(["TURSO_AUTH_TOKEN"]);
    expect(vars({ ...local, TURSO_AUTH_TOKEN: "token-token" })).toEqual(["TURSO_DATABASE_URL"]);
  });

  it("rejects an address that is not libsql:// or https://", () => {
    expect(vars({ ...TURSO, TURSO_DATABASE_URL: "http://db-org.turso.io" })).toEqual(["TURSO_DATABASE_URL"]);
    expect(vars({ ...TURSO, TURSO_DATABASE_URL: "file:./x.db" })).toEqual(["TURSO_DATABASE_URL"]);
  });

  it("never echoes the token in a message", () => {
    const messages = validateDatabaseConfig(env({ ...TURSO, TURSO_DATABASE_URL: "http://x" })).map((p) => p.message).join(" ");
    expect(messages).not.toContain("token-token");
  });

  it("flags Turso credentials in a Vercel Preview unless Preview has its own database", () => {
    expect(vars({ ...TURSO, VERCEL_ENV: "preview" })).toContain("TURSO_DATABASE_URL");
    expect(validateDatabaseConfig(env({ ...TURSO, VERCEL_ENV: "preview" })).map((p) => p.message).join(" ")).toMatch(/Preview/);
    expect(vars({ ...TURSO, VERCEL_ENV: "preview", CEFRO_ALLOW_PREVIEW_TURSO: "true" })).toEqual([]);
    expect(vars({ ...TURSO, VERCEL_ENV: "production" })).toEqual([]);
  });

  it("requires the hosted database on Vercel, and refuses local recordings there", () => {
    vi.stubEnv("VERCEL", "1");
    expect(vars(local)).toContain("TURSO_DATABASE_URL");
    expect(vars(TURSO)).toEqual([]);
    expect(vars({ ...TURSO, AUDIO_STORAGE_PROVIDER: "local" })).toEqual(["AUDIO_STORAGE_PROVIDER"]);
    expect(vars({ ...local, AUDIO_STORAGE_PROVIDER: "database" })).toContain("AUDIO_STORAGE_PROVIDER");
  });
});
