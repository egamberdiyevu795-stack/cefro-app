import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { describeProviderMode, validateAuthConfig, validateProviderConfig } from "./provider-config";

const env = (overrides: Record<string, unknown>) =>
  ({ NODE_ENV: "development", TRANSCRIPTION_PROVIDER: "openai", EVALUATION_PROVIDER: "gemini", ...overrides }) as unknown as ServerEnv;

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

