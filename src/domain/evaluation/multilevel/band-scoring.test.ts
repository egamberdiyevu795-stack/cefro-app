import { describe, expect, it } from "vitest";
import rawQ7 from "@/server/evaluation/rubrics/multilevel_q7.json";
import { bestFitLevel, scoreBand, type BandScoringInput } from "./band-scoring";
import type { FeatureLevel, PronunciationLevel, QuestionStatus } from "./levels";
import { multilevelRubricConfigSchema } from "./rubric-config";

const config = multilevelRubricConfigSchema.parse(rawQ7);

function input(
  level: FeatureLevel,
  onTopic: number,
  options: { pronunciation?: PronunciationLevel; memorized?: boolean; statuses?: QuestionStatus[] } = {},
): BandScoringInput {
  const statuses: QuestionStatus[] =
    options.statuses ?? [1, 2, 3].map((id) => (id <= onTopic ? "on_topic" : "missing"));
  return {
    questions: statuses.map((status, i) => ({ id: i + 1, status })),
    features: { grammar: level, vocabulary: level, fluency: level, cohesion: level, pronunciation: options.pronunciation ?? level },
    memorizedOrIrrelevant: options.memorized ?? false,
  };
}

describe("multilevel_q7.json", () => {
  it("is a valid rubric config with the official band labels", () => {
    expect(config.version).toBe("multilevel-q7/2.0.0");
    expect(config.meets_target_band).toBe(3);
    expect(Object.fromEntries(config.bands.map((b) => [b.band, b.label]))).toEqual({
      5: "Above B2",
      4: "Higher B2",
      3: "Lower B2",
      2: "Higher B1",
      1: "Lower B1",
      0: "Below B1",
    });
  });
});

describe("scoreBand: band = min(topic cap, language cap)", () => {
  it.each([
    ["B1", 2, 2],
    ["B1", 1, 1],
    ["B2", 3, 4],
    ["B2", 2, 3],
    ["above_B2", 3, 5],
    ["B2", 1, 1],
    ["B1", 3, 2],
  ] as const)("(%s, %i on topic) → band %i", (level, onTopic, band) => {
    expect(scoreBand(input(level, onTopic), config).band).toBe(band);
  });

  it("memorized or irrelevant → band 0 regardless of language", () => {
    const score = scoreBand(input("above_B2", 3, { memorized: true }), config);
    expect(score).toMatchObject({ band: 0, zero_reason: "memorized_or_irrelevant", label: "Below B1", biggest_fix: { kind: "own_words" } });
  });

  it("no question on topic → band 0", () => {
    expect(scoreBand(input("B2", 0), config)).toMatchObject({ band: 0, zero_reason: "no_question_on_topic" });
  });

  it("below-B1 language → band 0", () => {
    expect(scoreBand(input("below_B1", 3), config)).toMatchObject({ band: 0, zero_reason: "below_B1" });
  });

  it("above B2 with only two questions on topic is capped by coverage", () => {
    expect(scoreBand(input("above_B2", 2), config)).toMatchObject({ band: 3, topic_cap: 3, language_cap: 5 });
  });

  it("partial counts as on topic", () => {
    const score = scoreBand(input("B2", 0, { statuses: ["on_topic", "partial", "off_topic"] }), config);
    expect(score).toMatchObject({ on_topic_count: 2, band: 3 });
  });

  it("labels, target and provisional flag", () => {
    const meets = scoreBand(input("B2", 2), config);
    expect(meets).toMatchObject({ label: "Lower B2", meets_target: true, target_band: 3, band_max: 5, provisional: false });
    const below = scoreBand(input("B1", 3, { pronunciation: "not_assessed" }), config);
    expect(below).toMatchObject({ band: 2, label: "Higher B1", meets_target: false, provisional: true });
    expect(below.assessed_features).not.toContain("pronunciation");
  });
});

describe("bestFitLevel: mean of assessed features, .5 rounds down", () => {
  const L: FeatureLevel[] = ["below_B1", "B1", "B2", "above_B2"];
  it.each([
    [[0, 0, 2, 2], "B1"],
    [[1, 1, 2, 2], "B1"],
    [[0, 1, 1, 1], "B1"],
    [[2, 2, 2, 3], "B2"],
    [[0, 0, 0, 1], "below_B1"],
    [[2, 2, 3, 3], "B2"],
    [[3, 3, 3, 2, 3], "above_B2"],
    [[2], "B2"],
  ])("%j → %s", (values, expected) => {
    expect(bestFitLevel(values.map((v) => L[v])).level).toBe(expected);
  });

  it("a tie never produces band 0 by itself", () => {
    const score = scoreBand(
      {
        questions: [1, 2, 3].map((id) => ({ id, status: "on_topic" as const })),
        features: { grammar: "below_B1", vocabulary: "below_B1", fluency: "B2", cohesion: "B2", pronunciation: "not_assessed" },
        memorizedOrIrrelevant: false,
      },
      config,
    );
    expect(score).toMatchObject({ language_level: "B1", band: 2, zero_reason: null });
  });

  it("ignores pronunciation when it is not assessed", () => {
    const score = scoreBand(input("B2", 3, { pronunciation: "not_assessed" }), config);
    expect(score.language_level).toBe("B2");
    expect(score.assessed_features).toEqual(["grammar", "vocabulary", "fluency", "cohesion"]);
  });
});

describe("biggest_fix", () => {
  it("is question coverage, naming the first missing question, when coverage caps the band", () => {
    const score = scoreBand(input("B2", 0, { statuses: ["on_topic", "on_topic", "missing"] }), config);
    expect(score).toMatchObject({ topic_cap: 3, language_cap: 4, biggest_fix: { kind: "question_coverage", question_id: 3 } });
    const second = scoreBand(input("B2", 0, { statuses: ["on_topic", "off_topic", "on_topic"] }), config);
    expect(second.biggest_fix).toEqual({ kind: "question_coverage", question_id: 2 });
  });

  it("is the lowest feature when language caps the band (ties by fix priority)", () => {
    const score = scoreBand(
      {
        questions: [1, 2, 3].map((id) => ({ id, status: "on_topic" as const })),
        features: { grammar: "B2", vocabulary: "B2", fluency: "B1", cohesion: "B1", pronunciation: "B2" },
        memorizedOrIrrelevant: false,
      },
      config,
    );
    expect(score.biggest_fix).toEqual({ kind: "feature", feature: "cohesion" });
  });

  it("is a feature when the caps are equal", () => {
    // B1 language (cap 2) with 2 on topic (cap 3): language limits.
    expect(scoreBand(input("B1", 2), config).biggest_fix).toEqual({ kind: "feature", feature: "grammar" });
  });

  it("never names an unassessed pronunciation", () => {
    const score = scoreBand(
      {
        questions: [1, 2, 3].map((id) => ({ id, status: "on_topic" as const })),
        features: { grammar: "B2", vocabulary: "B2", fluency: "B2", cohesion: "B2", pronunciation: "not_assessed" },
        memorizedOrIrrelevant: false,
      },
      config,
    );
    expect(score.biggest_fix).toEqual({ kind: "feature", feature: "grammar" });
  });
});
