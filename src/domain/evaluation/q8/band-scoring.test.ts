import { describe, expect, it } from "vitest";
import { POINT_IDS, type PointId } from "@/domain/speaking/argument-task";
import rawQ8 from "@/server/evaluation/rubrics/multilevel_q8.json";
import rawQ7 from "@/server/evaluation/rubrics/multilevel_q7.json";
import { deriveCoverage, countSides, scoreQ8Band, type Q8ScoringInput } from "./band-scoring";
import { q8BestFit, type Q8Level } from "./levels";
import type { PointStatus } from "./model-output";
import { deriveQ8RetryFocus, goalPoint, CHOOSE_TWO, REBUTTAL_HEADLINE, OWN_WORDS_HEADLINE, EXPLAIN_HEADLINE } from "./result";
import { q8RubricConfigSchema } from "./rubric-config";

const config = q8RubricConfigSchema.parse(rawQ8);

function input(points: Partial<Record<PointId, PointStatus>>, levels: Partial<Q8ScoringInput["features"]> & { all?: Q8Level } = {}, extra: Partial<Q8ScoringInput> = {}): Q8ScoringInput {
  const all = levels.all ?? "B2";
  return {
    points: POINT_IDS.map((id) => ({ id, status: points[id] ?? "not_addressed", rebutted: false })),
    dependence: "own_development",
    features: { grammar: all, vocabulary: all, fluency: all, cohesion: all, pronunciation: "not_assessed", ...levels },
    memorizedOrIrrelevant: false,
    ...extra,
  };
}
const FULL = { F1: "developed", F2: "developed", A1: "developed", A2: "developed" } as const;

describe("the Part 3 rubric file", () => {
  it("is valid: bands 0–6 with the official labels, target band 5 (C1)", () => {
    expect(config.band_max).toBe(6);
    expect(config.meets_target_band).toBe(5);
    expect(config.bands.map((b) => `${b.band} ${b.label}`)).toEqual(["6 Above C1", "5 C1", "4 Higher B2", "3 Lower B2", "2 Higher B1", "1 Lower B1", "0 Below B1"]);
  });

  it("C1 descriptors are the official Question 8 band 5 text; B2, B1 and below-B1 are Question 7's, verbatim", () => {
    expect(config.descriptors.C1.grammar).toBe("A range of complex grammar constructions are used accurately. Some minor errors occur but do not impede understanding.");
    expect(config.descriptors.C1.pronunciation).toBe("Pronunciation is intelligible.");
    for (const level of ["B2", "B1", "below_B1"] as const) expect(config.descriptors[level]).toEqual(rawQ7.descriptors[level]);
  });

  it("caps are the plan's tables (section 4) and the band-6 gate needs grammar AND vocabulary", () => {
    expect(config.scoring.coverage_cap).toEqual({ none: 0, one_side: 3, both_sides: 4, both_sides_full: 6 });
    expect(config.scoring.dependence_cap).toEqual({ reads_prompts: 1, heavily_dependent: 2, own_development: 6 });
    expect(config.scoring.language_cap).toEqual({ below_B1: 0, B1: 2, B2: 4, C1: 5, above_C1: 6 });
    expect(config.scoring.above_target_requires).toEqual(["grammar", "vocabulary"]);
  });

  it("rejects a cap above band_max", () => {
    const broken = structuredClone(rawQ8);
    broken.scoring.coverage_cap.both_sides_full = 7;
    expect(q8RubricConfigSchema.safeParse(broken).success).toBe(false);
  });
});

describe("language level on the C1 ladder", () => {
  it("mean of the levels, an exact .5 rounds down", () => {
    expect(q8BestFit(["C1", "C1", "B2", "B2"]).level).toBe("B2");
    expect(q8BestFit(["C1", "C1", "C1", "B2"]).level).toBe("C1");
    expect(q8BestFit(["above_C1", "above_C1", "C1", "C1"]).level).toBe("C1");
    expect(q8BestFit(["above_C1", "above_C1", "above_C1", "C1"]).level).toBe("above_C1");
  });
});

describe("coverage (listed points only)", () => {
  const cov = (points: Partial<Record<PointId, PointStatus>>) => deriveCoverage(countSides(input(points).points), 2);
  it("none / one side / both sides / both sides in full", () => {
    expect(cov({})).toBe("none");
    expect(cov({ F1: "developed", F2: "developed", F3: "developed" })).toBe("one_side");
    expect(cov({ F1: "developed", A1: "developed" })).toBe("both_sides");
    expect(cov({ F1: "restated", F2: "restated", A1: "developed", A2: "developed" })).toBe("both_sides");
    expect(cov(FULL)).toBe("both_sides_full");
    expect(cov({ F1: "developed", F2: "restated", A1: "restated", A2: "developed" })).toBe("both_sides_full");
  });
  it("misread counts as not covered", () => {
    expect(cov({ F1: "developed", F2: "developed", A1: "misread", A2: "misread" })).toBe("one_side");
  });
});

describe("band (plan section 8, planned test cases)", () => {
  it("band-6 gate: mean above C1 but vocabulary at C1 → band 5", () => {
    const s = scoreQ8Band(input(FULL, { grammar: "above_C1", vocabulary: "C1", fluency: "above_C1", cohesion: "above_C1" }), config);
    expect(s.language_level).toBe("above_C1");
    expect(s.band6_gate_blocked).toBe(true);
    expect(s.band).toBe(5);
  });

  it("band-6 gate with pronunciation at C1: grammar, vocabulary, fluency, cohesion above C1 → band 6 (pronunciation never blocks)", () => {
    const s = scoreQ8Band(input(FULL, { all: "above_C1", pronunciation: "C1" }), config);
    expect(s.band).toBe(6);
    expect(s.label).toBe("Above C1");
    expect(s.provisional).toBe(false);
  });

  it("reading the list stops at 1 and leaning on it at 2, whatever the language", () => {
    expect(scoreQ8Band(input(FULL, { all: "C1" }, { dependence: "reads_prompts" }), config).band).toBe(1);
    expect(scoreQ8Band(input(FULL, { all: "C1" }, { dependence: "heavily_dependent" }), config).band).toBe(2);
  });

  it("one-sided answers stop at 3; a C1 speaker with one point per side stops at 4 and is told to choose two", () => {
    expect(scoreQ8Band(input({ F1: "developed", F2: "developed" }, { all: "C1" }), config).band).toBe(3);
    const s = scoreQ8Band(input({ F1: "developed", A1: "developed" }, { all: "C1" }), config);
    expect(s.band).toBe(4);
    expect(s.needs_two_points_per_side).toBe(true);
    expect(s.biggest_fix).toEqual({ kind: "point_development", side: "for", reason: "too_few_points", point_id: null });
  });

  it("own arguments never count: zero rules in order (memorised, no listed point, below B1)", () => {
    expect(scoreQ8Band(input(FULL, { all: "C1" }, { memorizedOrIrrelevant: true }), config)).toMatchObject({ band: 0, zero_reason: "memorized_or_irrelevant", biggest_fix: { kind: "own_words" } });
    expect(scoreQ8Band(input({}, { all: "C1" }), config)).toMatchObject({ band: 0, zero_reason: "no_point_addressed", biggest_fix: { kind: "section_coverage", missing_side: "both" } });
    expect(scoreQ8Band(input(FULL, { all: "below_B1" }), config)).toMatchObject({ band: 0, zero_reason: "below_B1", biggest_fix: { kind: "feature" } });
  });

  it("not assessed pronunciation makes the band provisional", () => {
    expect(scoreQ8Band(input(FULL), config).provisional).toBe(true);
  });

  it("a restated point (not rebutted) is named as the one to develop", () => {
    const s = scoreQ8Band(input({ F1: "developed", F2: "developed", A1: "restated", A2: "restated" }, { all: "C1" }), config);
    expect(s.biggest_fix).toEqual({ kind: "point_development", side: "against", reason: "restated", point_id: "A1" });
  });
});

describe("retry goals", () => {
  const assessment = (how: string) => {
    const f = { level: "B2" as const, evidence: [], note: "n", how_to_improve: how, how_to_check: "check" };
    return { features: { grammar: f, vocabulary: f, fluency: f, cohesion: f, pronunciation: { ...f, level: "not_assessed" as const } } } as never;
  };
  const task = { points: [
    { id: "F1", side: "for", text: "Point one" }, { id: "F2", side: "for", text: "Point two" }, { id: "F3", side: "for", text: "Point three" },
    { id: "A1", side: "against", text: "Point four" }, { id: "A2", side: "against", text: "Point five" }, { id: "A3", side: "against", text: "Point six" },
  ] } as never;

  it("each fix has its own goal; point goals name the point so a retry can check it", () => {
    const goal = (fix: Parameters<typeof deriveQ8RetryFocus>[1]["biggest_fix"]) => deriveQ8RetryFocus(assessment("Use one structure."), { biggest_fix: fix }, task)[0];
    expect(goal({ kind: "prompt_dependence", level: "reads_prompts" }).objective).toContain(OWN_WORDS_HEADLINE);
    expect(goal({ kind: "prompt_dependence", level: "heavily_dependent" }).objective).toBe(EXPLAIN_HEADLINE);
    expect(goal({ kind: "section_coverage", missing_side: "against", point_id: "A1" }).objective).toContain(CHOOSE_TWO);
    const rebut = goal({ kind: "point_development", side: "for", reason: "rebutted", point_id: "F1" });
    expect(rebut.objective).toContain(REBUTTAL_HEADLINE);
    expect(goalPoint(rebut.objective)).toBe("F1");
    expect(goal({ kind: "feature", feature: "grammar" }).objective).toBe("Use one structure.");
  });

  it("at most two goals, the second a language feature", () => {
    const focus = deriveQ8RetryFocus(assessment("Use one structure."), { biggest_fix: { kind: "point_development", side: "for", reason: "restated", point_id: "F2" } }, task);
    expect(focus).toHaveLength(2);
    expect(focus[1].target.kind).toBe("feature");
  });
});
