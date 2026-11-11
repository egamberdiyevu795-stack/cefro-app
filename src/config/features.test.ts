import { afterEach, describe, expect, it, vi } from "vitest";

/** `PART_LIVE["3"]` is false everywhere except a test server that sets the test-only switch (never production, never Vercel). */
const load = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return (await import("./features")).PART_LIVE;
};
afterEach(() => vi.unstubAllEnvs());

describe("PART_LIVE['3']", () => {
  it("is false by default: Part 3 is not live", async () => {
    expect((await load({ CEFRO_TEST_PART3_LIVE: undefined }))["3"]).toBe(false);
  });
  it("only the test switch outside production and Vercel turns it on", async () => {
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: undefined }))["3"]).toBe(true);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "production", VERCEL: undefined }))["3"]).toBe(false);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: "1" }))["3"]).toBe(false);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "true", NODE_ENV: "development", VERCEL: undefined }))["3"]).toBe(false);
  });
  it("leaves the other parts alone: Part 2 live, Part 1 not", async () => {
    const live = await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: undefined });
    expect([live["1.1"], live["1.2"], live["2"]]).toEqual([false, false, true]);
  });
});
