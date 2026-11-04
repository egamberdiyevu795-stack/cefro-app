import { describe, expect, it } from "vitest";
import {
  ANCHOR_0,
  ANCHOR_1,
  ANCHOR_2,
  ANCHOR_3,
  ANCHOR_4,
  ANCHOR_5,
  CARS_PROMPT,
  FIXTURE_N1,
  FIXTURE_R1,
} from "./prompt-overlap.fixtures";
import {
  DEFAULT_PROMPT_OVERLAP_CONFIG,
  codeDependence,
  decideDependence,
  measurePromptOverlap,
  promptOverlapConfigSchema,
  tokenize,
  type PromptDependence,
} from "./prompt-overlap";

/**
 * Expected values from docs/part3-plan.md section 6 ("Measured on the anchors").
 *
 * All values match the plan exactly. For novel_content_words this module is the reference: its stopword list (NLTK
 * English plus function-word contractions) defines the counts, and the plan's table was updated to them.
 */
const ANCHORS: {
  name: string;
  text: string;
  tokens: number;
  copiedRatio: number;
  pointsRead: number;
  novel: number;
  namedRuns: number;
  code: PromptDependence;
}[] = [
  { name: "Anchor 0", text: ANCHOR_0, tokens: 49, copiedRatio: 0.0, pointsRead: 0, novel: 15, namedRuns: 0, code: "heavily_dependent" },
  { name: "Anchor 1", text: ANCHOR_1, tokens: 81, copiedRatio: 0.81, pointsRead: 6, novel: 2, namedRuns: 0, code: "reads_prompts" },
  { name: "Anchor 2", text: ANCHOR_2, tokens: 100, copiedRatio: 0.29, pointsRead: 3, novel: 15, namedRuns: 0, code: "heavily_dependent" },
  { name: "Anchor 3", text: ANCHOR_3, tokens: 156, copiedRatio: 0.0, pointsRead: 0, novel: 62, namedRuns: 0, code: "own_development" },
  { name: "Anchor 4", text: ANCHOR_4, tokens: 171, copiedRatio: 0.0, pointsRead: 0, novel: 63, namedRuns: 0, code: "own_development" },
  { name: "Anchor 5", text: ANCHOR_5, tokens: 223, copiedRatio: 0.0, pointsRead: 0, novel: 85, namedRuns: 1, code: "own_development" },
  { name: "Fixture N1", text: FIXTURE_N1, tokens: 72, copiedRatio: 0.0, pointsRead: 0, novel: 31, namedRuns: 2, code: "own_development" },
  { name: "Fixture R1", text: FIXTURE_R1, tokens: 158, copiedRatio: 0.0, pointsRead: 0, novel: 56, namedRuns: 2, code: "own_development" },
];

describe("tokenize", () => {
  it("lowercases, unifies apostrophes, strips punctuation and splits hyphenated words", () => {
    expect(tokenize("Car... car-free! I’d say “yes”, out-of-town.")).toEqual([
      "car",
      "car",
      "free",
      "i'd",
      "say",
      "yes",
      "out",
      "of",
      "town",
    ]);
  });
});

describe("measurePromptOverlap: cars anchors (plan section 6)", () => {
  it.each(ANCHORS)("$name", ({ text, tokens, copiedRatio, pointsRead, novel, namedRuns, code }) => {
    const overlap = measurePromptOverlap(text, CARS_PROMPT);
    expect(overlap.token_count).toBe(tokens);
    expect(overlap.copied_ratio.toFixed(2)).toBe(copiedRatio.toFixed(2));
    expect(overlap.points_read).toBe(pointsRead);
    expect(overlap.named_runs).toBe(namedRuns);
    expect(overlap.novel_content_words).toBe(novel);
    expect(overlap.code_dependence).toBe(code);
  });

  it("anchor 1 reads every point; its copied spans are the read-out sentences", () => {
    const overlap = measurePromptOverlap(ANCHOR_1, CARS_PROMPT);
    expect(overlap.points_read_ids).toEqual(["F1", "F2", "F3", "A1", "A2", "A3"]);
    expect(overlap.copied_spans[0]).toBe("cities should ban private cars from their centres");
    expect(overlap.copied_spans).toContain("cleaner air and less noise");
    expect(overlap.named_runs).toBe(0);
  });

  it("anchor 2 reads F2, A1 and A2 (copied, nothing of the student's own follows)", () => {
    const overlap = measurePromptOverlap(ANCHOR_2, CARS_PROMPT);
    expect(overlap.points_read_ids).toEqual(["F2", "A1", "A2"]);
    expect(overlap.runs.every((run) => run.kind === "copied")).toBe(true);
  });

  it("anchor 5: the statement echoed in the opening is a named run, not copied", () => {
    const overlap = measurePromptOverlap(ANCHOR_5, CARS_PROMPT);
    expect(overlap.runs).toHaveLength(1);
    expect(overlap.runs[0]).toMatchObject({ kind: "named", text: "cities should ban private cars from their centres" });
    expect(overlap.copied_spans).toEqual([]);
  });

  it("single shared words and 3-word phrases never match", () => {
    const overlap = measurePromptOverlap(ANCHOR_3, CARS_PROMPT);
    expect(overlap.runs).toEqual([]);
  });
});

describe("named, not read (decision 5)", () => {
  it("fixture N1: both point names are named runs, so nothing counts as copied", () => {
    const overlap = measurePromptOverlap(FIXTURE_N1, CARS_PROMPT);
    expect(overlap.runs.map((run) => [run.text, run.kind])).toEqual([
      ["safer streets for pedestrians and cyclists", "named"],
      ["shops and businesses in the centre may lose customers", "named"],
    ]);
    expect(overlap.copied_ratio).toBe(0);
    expect(overlap.points_read).toBe(0);
    expect(overlap.copied_spans).toEqual([]);
  });

  it("fixture N1 without the named/copied split: copied_ratio 0.21, points_read 2 (the false flag the rule removes)", () => {
    const noSplit = { ...DEFAULT_PROMPT_OVERLAP_CONFIG, named_min_novel_words: Number.MAX_SAFE_INTEGER };
    const overlap = measurePromptOverlap(FIXTURE_N1, CARS_PROMPT, noSplit);
    expect(overlap.copied_ratio.toFixed(2)).toBe("0.21");
    expect(overlap.points_read).toBe(2);
    expect(overlap.code_dependence).toBe("heavily_dependent");
  });

  it("fixture R1: both point names before the rebuttals are named runs", () => {
    const overlap = measurePromptOverlap(FIXTURE_R1, CARS_PROMPT);
    expect(overlap.runs.every((run) => run.kind === "named")).toBe(true);
    expect(overlap.named_runs).toBe(2);
    expect(overlap.copied_ratio).toBe(0);
  });

  it("a run is named only with at least 5 distinct novel content words in the next 20 tokens", () => {
    const four = "Cleaner air and less noise. My sister breathes poorly sometimes.";
    const five = "Cleaner air and less noise. My sister breathes poorly sometimes indoors.";
    expect(measurePromptOverlap(four, CARS_PROMPT).runs[0]).toMatchObject({ kind: "copied", novel_words_after: 4 });
    expect(measurePromptOverlap(five, CARS_PROMPT).runs[0]).toMatchObject({ kind: "named", novel_words_after: 5 });
  });

  it("words beyond the 20-token window do not make a run named", () => {
    const filler = Array.from({ length: 20 }, () => "the").join(" ");
    const text = `Cleaner air and less noise ${filler} sister breathes poorly near factories sometimes`;
    expect(measurePromptOverlap(text, CARS_PROMPT).runs[0]?.kind).toBe("copied");
  });

  it("repeating prompt words does not count as the student's own content", () => {
    const text = "Cleaner air and less noise. Cities, cars, public transport, customers, people, noise.";
    expect(measurePromptOverlap(text, CARS_PROMPT).runs[0]?.kind).toBe("copied");
  });
});

describe("thresholds are config values", () => {
  it("the default config is valid and holds the plan's numbers", () => {
    expect(promptOverlapConfigSchema.parse(DEFAULT_PROMPT_OVERLAP_CONFIG)).toEqual({
      min_run_tokens: 4,
      named_window_tokens: 20,
      named_min_novel_words: 5,
      point_read_coverage: 0.8,
      reads_prompts: { copied_ratio: 0.5, points_read: 4 },
      heavily_dependent: { copied_ratio: 0.2, points_read: 2, min_novel_content_words: 25 },
      override: { copied_ratio: 0.5, points_read: 4 },
    });
  });

  it("changing the run length changes what matches", () => {
    const longRuns = { ...DEFAULT_PROMPT_OVERLAP_CONFIG, min_run_tokens: 8 };
    // "cleaner air and less noise" (5 tokens) no longer matches on its own.
    const overlap = measurePromptOverlap("So, cleaner air and less noise is good.", CARS_PROMPT, longRuns);
    expect(overlap.runs).toEqual([]);
  });

  it("codeDependence follows the configured thresholds", () => {
    const base = { copied_ratio: 0, points_read: 0, novel_content_words: 40 };
    expect(codeDependence(base)).toBe("own_development");
    expect(codeDependence({ ...base, novel_content_words: 24 })).toBe("heavily_dependent");
    expect(codeDependence({ ...base, copied_ratio: 0.2 })).toBe("heavily_dependent");
    expect(codeDependence({ ...base, points_read: 2 })).toBe("heavily_dependent");
    expect(codeDependence({ ...base, copied_ratio: 0.5 })).toBe("reads_prompts");
    expect(codeDependence({ ...base, points_read: 4 })).toBe("reads_prompts");
    const strict = { ...DEFAULT_PROMPT_OVERLAP_CONFIG, heavily_dependent: { copied_ratio: 0.2, points_read: 2, min_novel_content_words: 50 } };
    expect(codeDependence(base, strict)).toBe("heavily_dependent");
  });

  it("rejects an invalid config", () => {
    expect(promptOverlapConfigSchema.safeParse({ ...DEFAULT_PROMPT_OVERLAP_CONFIG, point_read_coverage: 1.5 }).success).toBe(false);
  });
});

describe("decideDependence: the model decides, code overrides only the clear case (decision 4)", () => {
  it("anchor 1: override fires (0.81, 6) even if the model said own development", () => {
    const overlap = measurePromptOverlap(ANCHOR_1, CARS_PROMPT);
    expect(decideDependence("own_development", overlap)).toEqual({
      final: "reads_prompts",
      model: "own_development",
      code: "reads_prompts",
      override_applied: true,
      dependence_disagreement: true,
    });
    expect(decideDependence("reads_prompts", overlap)).toMatchObject({ final: "reads_prompts", override_applied: false, dependence_disagreement: false });
  });

  it("anchor 2: no override, no flag when the model says heavily dependent", () => {
    const overlap = measurePromptOverlap(ANCHOR_2, CARS_PROMPT);
    expect(decideDependence("heavily_dependent", overlap)).toEqual({
      final: "heavily_dependent",
      model: "heavily_dependent",
      code: "heavily_dependent",
      override_applied: false,
      dependence_disagreement: false,
    });
  });

  it("anchor 0: code says heavily dependent, model's own development is kept and only flagged", () => {
    const overlap = measurePromptOverlap(ANCHOR_0, CARS_PROMPT);
    expect(decideDependence("own_development", overlap)).toMatchObject({
      final: "own_development",
      override_applied: false,
      dependence_disagreement: true,
    });
  });

  it.each([ANCHOR_3, ANCHOR_4, ANCHOR_5, FIXTURE_N1, FIXTURE_R1])("own-development answers agree with the model", (text) => {
    const decision = decideDependence("own_development", measurePromptOverlap(text, CARS_PROMPT));
    expect(decision).toMatchObject({ final: "own_development", override_applied: false, dependence_disagreement: false });
  });

  it("one condition alone is not the clear case", () => {
    const highRatio = { copied_ratio: 0.6, points_read: 3, code_dependence: "reads_prompts" as const };
    const manyPoints = { copied_ratio: 0.4, points_read: 5, code_dependence: "reads_prompts" as const };
    expect(decideDependence("heavily_dependent", highRatio)).toMatchObject({ final: "heavily_dependent", dependence_disagreement: true });
    expect(decideDependence("heavily_dependent", manyPoints)).toMatchObject({ final: "heavily_dependent", dependence_disagreement: true });
  });
});

describe("edge cases", () => {
  it("an empty transcript has no overlap", () => {
    expect(measurePromptOverlap("", CARS_PROMPT)).toMatchObject({ token_count: 0, copied_ratio: 0, points_read: 0, novel_content_words: 0, runs: [] });
  });

  it("n-grams never cross prompt segments", () => {
    // "customers public transport is": "customers" ends A2 and "public transport is" starts A3; no single segment has it.
    const overlap = measurePromptOverlap("they lose customers public transport is", CARS_PROMPT);
    expect(overlap.runs).toEqual([]);
  });
});
