import { describe, expect, it } from "vitest";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { makeModelOutput, makeMultilevelResult } from "../../../test/fixtures";
import { compareAttempts } from "./comparison";

/** Fixture output with some feature levels / question statuses changed (band is recomputed). */
function attempt(levels: Partial<Record<"grammar" | "vocabulary" | "fluency" | "cohesion", FeatureLevel>> = {}, answered = 2, reviewed = false): MultilevelResult {
  const output = makeModelOutput();
  for (const [f, level] of Object.entries(levels)) output.features[f as keyof typeof levels].level = level;
  output.questions = output.questions.map((q) => ({ ...q, status: q.id <= answered ? "on_topic" : "missing" }));
  if (reviewed) {
    output.retry_review = {
      objectives: [
        { objective: "Answer question 3", outcome: "achieved", evidence: "You said schools should limit phones." },
        { objective: "Use 'however'", outcome: "not_achieved", evidence: "Not used." },
      ],
      summary: "Better coverage.",
    };
  }
  return makeMultilevelResult(output);
}
const compare = (before: MultilevelResult, after: MultilevelResult, methodology?: [string, string]) =>
  compareAttempts({ evaluation: before, metrics: null, methodology: methodology?.[0] }, { evaluation: after, metrics: null, methodology: methodology?.[1] });

describe("compareAttempts", () => {
  it("compares bands and feature levels, including declines", () => {
    // before: B1 language, 2 on topic → band 2. after: B2 language, 3 on topic → band 4.
    const result = compare(attempt(), attempt({ grammar: "B2", vocabulary: "B2", cohesion: "B2" }, 3));
    expect(result.band).toMatchObject({ before: 2, after: 4, bandMax: 5, beforeLabel: "Higher B1", afterLabel: "Higher B2", direction: "improved", magnitude: "clear" });
    expect(result.questions).toEqual({ before: 2, after: 3, total: 3 });
    expect(result.features.find((f) => f.feature === "grammar")).toMatchObject({ before: "B1", after: "B2", direction: "improved" });
    expect(result.features.find((f) => f.feature === "pronunciation")?.direction).toBe("not_comparable");
    expect(result.verdict).toBe("clear_improvement");
  });

  it("does not present a one-band change as clear progress", () => {
    // 2 on topic → 3 on topic with B1 language: band stays 2 (language caps it). B1 → B2 grammar alone doesn't move the mean.
    expect(compare(attempt(), attempt({}, 1)).verdict).toBe("slight_decline");
    expect(compare(attempt({}, 1), attempt()).verdict).toBe("slight_improvement");
  });

  it("reports 'about the same', and 'mixed' when features move both ways at an equal band", () => {
    expect(compare(attempt(), attempt()).verdict).toBe("about_the_same");
    expect(compare(attempt(), attempt({ grammar: "B2", fluency: "B1" })).verdict).toBe("mixed");
  });

  it("reports a clear decline honestly", () => {
    expect(compare(attempt({ grammar: "B2", vocabulary: "B2", cohesion: "B2" }, 3), attempt()).verdict).toBe("clear_decline");
  });

  it("summarises whether the retry focus was achieved and what to practise next", () => {
    const after = attempt({}, 3, true);
    const result = compare(attempt(), after);
    expect(result.focus).toEqual({ achieved: 1, partlyAchieved: 0, notAchieved: 1, total: 2 });
    expect(result.practiceNext).toEqual(after.retry_focus);
  });

  it("flags attempts scored with different methodology versions", () => {
    expect(compare(attempt(), attempt(), ["a", "b"]).methodologyChanged).toBe(true);
    expect(compare(attempt(), attempt(), ["a", "a"]).methodologyChanged).toBe(false);
  });
});
