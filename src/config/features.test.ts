import { afterEach, describe, expect, it, vi } from "vitest";

/** With `PART_3_LIVE=false`, Part 3 is closed everywhere except a test server that sets the test-only switch (never production, never Vercel). */
const load = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  vi.stubEnv("PART_3_LIVE", "false");
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return (await import("./features")).PART_LIVE;
};
afterEach(() => vi.unstubAllEnvs());

describe("PART_LIVE['3']", () => {
  it("PART_3_LIVE=false closes Part 3", async () => {
    expect((await load({ CEFRO_TEST_PART3_LIVE: undefined }))["3"]).toBe(false);
  });
  it("only the test switch outside production and Vercel turns it on", async () => {
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: undefined }))["3"]).toBe(true);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "production", VERCEL: undefined }))["3"]).toBe(false);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: "1" }))["3"]).toBe(false);
    expect((await load({ CEFRO_TEST_PART3_LIVE: "true", NODE_ENV: "development", VERCEL: undefined }))["3"]).toBe(false);
  });
  it("leaves the other parts alone: Part 2 live, Part 1 not", async () => {
    const live = await load({ CEFRO_TEST_PART3_LIVE: "1", NODE_ENV: "development", VERCEL: undefined, PART_1_1_LIVE: "false" });
    expect([live["1.1"], live["1.2"], live["2"]]).toEqual([false, false, true]);
  });
});

/**
 * The owner's switches (docs/pilot-runbook.md): PART_1_1_LIVE, PART_1_2_LIVE, PART_2_LIVE, PART_3_LIVE, FULL_MOCK_LIVE and
 * TEACHER_LIVE, read from the environment so Vercel Production can turn them on without a new commit. Unlike the CEFRO_TEST_*
 * switches they work in a production build on Vercel. Defaults (owner decisions 2026-11-15 and 2026-11-24, no manual Vercel
 * step): every part ON, so the full mock is open too; the Teacher view OFF.
 */
const SWITCHES = ["PART_1_1_LIVE", "PART_1_2_LIVE", "PART_2_LIVE", "PART_3_LIVE", "FULL_MOCK_LIVE", "TEACHER_LIVE"] as const;
const PRODUCTION = { NODE_ENV: "production", VERCEL: "1" } as const;
const loadAll = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  for (const key of [...SWITCHES, "CEFRO_TEST_PART3_LIVE", "CEFRO_TEST_FULL_MOCK_LIVE", "CEFRO_TEST_TEACHER_LIVE"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value ?? "");
  const features = await import("./features");
  return { features, parts: features.PART_LIVE, mock: features.fullMockLive(), teacher: features.TEACHER_LIVE };
};

describe("owner switches in Production", () => {
  it("nothing set: every part is live, so the full mock is open, and so is the Teacher view", async () => {
    const { parts, mock, teacher } = await loadAll(PRODUCTION);
    expect(parts).toEqual({ "1.1": true, "1.2": true, "2": true, "3": true });
    expect(mock).toBe(true);
    expect(teacher).toBe(true);
  });

  it.each([
    ["PART_1_1_LIVE", "1.1"],
    ["PART_1_2_LIVE", "1.2"],
    ["PART_3_LIVE", "3"],
  ] as const)("%s=true turns on exactly that part, in a production build on Vercel", async (name, part) => {
    const { parts } = await loadAll({ ...PRODUCTION, PART_1_1_LIVE: "false", PART_1_2_LIVE: "false", PART_3_LIVE: "false", [name]: "true" });
    expect(parts[part]).toBe(true);
    expect(Object.entries(parts).filter(([, on]) => on).map(([id]) => id).sort()).toEqual([part, "2"].sort());
  });

  it.each([
    ["PART_1_1_LIVE", "1.1"],
    ["PART_3_LIVE", "3"],
  ] as const)("%s=false closes that part again; unset keeps it live", async (name, part) => {
    expect((await loadAll({ ...PRODUCTION, [name]: "false" })).parts[part]).toBe(false);
    expect((await loadAll(PRODUCTION)).parts[part]).toBe(true);
  });

  it("PART_2_LIVE=false turns Part 2 off; PART_2_LIVE=true or unset keeps it on", async () => {
    expect((await loadAll({ ...PRODUCTION, PART_2_LIVE: "false" })).parts["2"]).toBe(false);
    expect((await loadAll({ ...PRODUCTION, PART_2_LIVE: "true" })).parts["2"]).toBe(true);
    expect((await loadAll(PRODUCTION)).parts["2"]).toBe(true);
  });

  it("TEACHER_LIVE=false turns the Teacher view off; true or unset keeps it on", async () => {
    expect((await loadAll({ ...PRODUCTION, TEACHER_LIVE: "false" })).teacher).toBe(false);
    expect((await loadAll({ ...PRODUCTION, TEACHER_LIVE: "true" })).teacher).toBe(true);
    expect((await loadAll(PRODUCTION)).teacher).toBe(true);
  });

  it("FULL_MOCK_LIVE=true opens the full mock while the single parts stay off; false or unset does not", async () => {
    const on = await loadAll({ ...PRODUCTION, PART_1_1_LIVE: "false", PART_1_2_LIVE: "false", PART_3_LIVE: "false", FULL_MOCK_LIVE: "true" });
    expect(on.mock).toBe(true);
    expect(on.parts).toEqual({ "1.1": false, "1.2": false, "2": true, "3": false });
    expect((await loadAll({ ...PRODUCTION, PART_1_2_LIVE: "false", FULL_MOCK_LIVE: "false" })).mock).toBe(false);
    expect((await loadAll({ ...PRODUCTION, PART_1_2_LIVE: "false" })).mock).toBe(false);
  });

  it("all four parts live still open the full mock without its own switch", async () => {
    const all = { PART_1_1_LIVE: "true", PART_1_2_LIVE: "true", PART_3_LIVE: "true" };
    expect((await loadAll({ ...PRODUCTION, ...all })).mock).toBe(true);
    expect((await loadAll({ ...PRODUCTION, ...all, PART_3_LIVE: "false" })).mock).toBe(false);
  });

  it("the switches are independent of each other", async () => {
    const { parts, mock, teacher } = await loadAll({ ...PRODUCTION, TEACHER_LIVE: "true", PART_1_1_LIVE: "false" });
    expect([parts["1.1"], parts["1.2"], parts["3"], mock, teacher]).toEqual([false, true, true, false, true]);
  });

  it("only true / 1 / false / 0 count, in any letter case; a typo or empty value keeps the default", async () => {
    for (const off of ["false", "FALSE", " False ", "0"]) expect((await loadAll({ ...PRODUCTION, TEACHER_LIVE: off })).teacher).toBe(false);
    for (const on of ["true", "TRUE", " True ", "1", "", "yes", "on", "tru", "enabled", "2"]) {
      expect((await loadAll({ ...PRODUCTION, TEACHER_LIVE: on })).teacher).toBe(true); // a typo keeps the default, which is on
    }
    for (const off of ["false", "FALSE", " False ", "0"]) expect((await loadAll({ ...PRODUCTION, PART_3_LIVE: off })).parts["3"]).toBe(false);
    for (const typo of ["", "yes", "off", "tru"]) expect((await loadAll({ ...PRODUCTION, PART_3_LIVE: typo })).parts["3"]).toBe(true);
    expect((await loadAll({ ...PRODUCTION, PART_2_LIVE: "yes" })).parts["2"]).toBe(true);
    expect((await loadAll({ ...PRODUCTION, PART_2_LIVE: "0" })).parts["2"]).toBe(false);
  });

  it("the CEFRO_TEST_* switches stay refused in production and on Vercel", async () => {
    const { parts, mock, teacher } = await loadAll({
      ...PRODUCTION,
      PART_3_LIVE: "false",
      TEACHER_LIVE: "false",
      CEFRO_TEST_PART3_LIVE: "1",
      CEFRO_TEST_FULL_MOCK_LIVE: "1",
      CEFRO_TEST_TEACHER_LIVE: "1",
    });
    expect([parts["3"], mock, teacher]).toEqual([false, false, false]);
  });
});

describe("envSwitch", () => {
  it("returns the fallback for undefined and unrecognised values", async () => {
    const { envSwitch } = await import("./features");
    expect(envSwitch(undefined, true)).toBe(true);
    expect(envSwitch(undefined, false)).toBe(false);
    expect(envSwitch("maybe", true)).toBe(true);
    expect(envSwitch("false", true)).toBe(false);
    expect(envSwitch("true", false)).toBe(true);
  });
});
