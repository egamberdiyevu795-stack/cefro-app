import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoEvaluation } from "@/server/demo/demo-data";
import { MOCK_MINIMAL_MAX_WORDS, mockIsMinimal, mockIsPictureOnly } from "./mock-answer-rules";

/*
 * The two mock-only rules ("picture only = off topic", "one sentence of up to 6 words = too short to count") are used
 * by the mock evaluator and nothing else: real scoring never imports them, and the mock evaluator itself is refused in
 * production.
 */

const SRC = path.join(process.cwd(), "src");
const rel = (file: string) => path.relative(process.cwd(), file);
/** Every non-test source file under a folder. */
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
const importersOf = (module: string) =>
  walk(SRC)
    .filter((file) => new RegExp(`from ["'][^"']*/${module}["']`).test(fs.readFileSync(file, "utf8")))
    .map(rel)
    .sort();

afterEach(() => vi.unstubAllEnvs());

describe("mock-only answer rules", () => {
  it("only the mock evaluator imports them", () => {
    expect(importersOf("mock-answer-rules")).toEqual(["src/server/evaluation/mock-evaluation-model.ts"]);
  });

  it("the mock evaluator is imported only by the provider factory and the demo data, never by real scoring", () => {
    expect(importersOf("mock-evaluation-model")).toEqual(["src/server/demo/demo-data.ts", "src/server/evaluation/index.ts"]);
  });

  it("no real scoring file contains the rules or their names (prompt, quality gate, band scoring, real providers)", () => {
    const scoring = [...walk(path.join(SRC, "domain/evaluation")), ...walk(path.join(SRC, "server/evaluation"))].filter(
      (file) => !/\/mock-[^/]+$/.test(file),
    );
    expect(scoring.length).toBeGreaterThan(10);
    for (const file of scoring) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, rel(file)).not.toMatch(/mockIsPictureOnly|mockIsMinimal|MOCK_PICTURE_WORDS|MOCK_MINIMAL_MAX_WORDS|mock-answer-rules/);
      // The provider factory may import the mock evaluator (refused in production below); nothing else may.
      if (!file.endsWith("server/evaluation/index.ts")) expect(text, rel(file)).not.toMatch(/mock-evaluation-model/);
    }
  });

  it("the mock evaluator, and so these rules, is refused in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EVALUATION_PROVIDER", "mock");
    vi.resetModules();
    const { getEvaluationModel } = await import("./index");
    expect(() => getEvaluationModel()).toThrow("Mock evaluator is disabled in production");
  });

  it("what the rules do, and that the mock evaluator applies them", async () => {
    expect(mockIsPictureOnly(["In the picture I can see a man.", "I can see trees in the picture."])).toBe(true);
    expect(mockIsPictureOnly(["In the picture I can see a man.", "My grandfather gave me advice."])).toBe(false);
    expect(MOCK_MINIMAL_MAX_WORDS).toBe(6);
    expect(mockIsMinimal(["Older people are not always right."])).toBe(true);
    expect(mockIsMinimal(["Older people are not always right about everything."])).toBe(false);
    expect(mockIsMinimal(["Older people know a lot.", "They are not always right."])).toBe(false);

    const picture = (await demoEvaluation("picture.b2-part2-advice-from-someone"))!.result;
    expect(picture.assessment.questions.map((q) => q.status)).toEqual(["off_topic", "off_topic", "off_topic"]);
    const bare = (await demoEvaluation("bare.b2-part2-advice-from-someone"))!.result;
    expect(bare.assessment.questions.map((q) => q.status)).toEqual(["on_topic", "on_topic", "minimal"]);
  });
});
