import { describe, expect, it } from "vitest";
import { bestFitLevel, scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES, type FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { multilevelRubricConfigSchema } from "@/domain/evaluation/multilevel/rubric-config";
import rawQ7 from "@/server/evaluation/rubrics/multilevel_q7.json";
import { BIGGEST_FIX, EXAM_PARTS, EXAM_PARTS_FIRST_VISIT, PRACTISE_NEXT, PROGRESS, RADAR_AXES, SKILL_LEVELS } from "./mock-data";

const q7 = multilevelRubricConfigSchema.parse(rawQ7);

describe("dashboard mock data matches the scoring rules", () => {
  // The latest Part 2 attempt answered all three questions on topic.
  const score = scoreBand(
    { questions: [1, 2, 3].map((id) => ({ id, status: "on_topic" as const })), features: SKILL_LEVELS, memorizedOrIrrelevant: false },
    q7,
  );

  it("Part 2 tile shows the band and label the Q7 rubric gives for these skills", () => {
    const part2 = EXAM_PARTS.find((p) => p.part === "Part 2");
    expect(part2?.band).toBe(score.band);
    expect(part2?.bandLabel).toBe(q7.bands.find((b) => b.band === score.band)?.label);
  });

  it("overall level is the best-fit level of the assessed skills, and is below the target", () => {
    const assessed = FEATURES.filter((f) => SKILL_LEVELS[f] !== "not_assessed").map((f) => SKILL_LEVELS[f] as FeatureLevel);
    expect(bestFitLevel(assessed).level).toBe(PROGRESS.level);
    expect(score.meets_target).toBe(false);
    expect(PROGRESS.target).toBe(q7.target_level);
  });

  it("goal counts assessed skills at B2 or above, leaving out pronunciation (not assessed)", () => {
    expect(PROGRESS.goal).toEqual({ atTarget: 2, assessed: 4, label: "2 of 4 skills at B2" });
  });

  it("pronunciation is shown as not assessed and the score is provisional", () => {
    expect(RADAR_AXES.find((a) => a.label === "Pronunciation")?.value).toBeNull();
    expect(score.provisional).toBe(true);
  });

  it("biggest fix is the feature the scorer names", () => {
    expect(score.biggest_fix).toEqual({ kind: "feature", feature: BIGGEST_FIX.feature.toLowerCase() });
  });

  it("no band appears without a label, and Part 3 (no band table yet) has neither", () => {
    for (const p of EXAM_PARTS) expect(p.band === null).toBe(p.bandLabel === null);
    expect(EXAM_PARTS.find((p) => p.part === "Part 3")?.band).toBeNull();
  });

  it("first visit lists every part, none tried", () => {
    expect(EXAM_PARTS_FIRST_VISIT.map((p) => p.part)).toEqual(EXAM_PARTS.map((p) => p.part));
    expect(EXAM_PARTS_FIRST_VISIT.every((p) => p.band === null && p.bandLabel === null)).toBe(true);
  });

  it("first visit recommends exactly one part (Part 2), and only first visit recommends", () => {
    expect(EXAM_PARTS_FIRST_VISIT.filter((p) => p.recommendation).map((p) => p.part)).toEqual(["Part 2"]);
    expect(EXAM_PARTS.some((p) => p.recommendation)).toBe(false);
  });

  it("Practise next opens its own mock task route and adds up its minutes", () => {
    expect(PRACTISE_NEXT.href).toBe(`/dashboard/task/${PRACTISE_NEXT.id}`);
    expect(PRACTISE_NEXT.preparationMinutes + PRACTISE_NEXT.speakingMinutes).toBe(PRACTISE_NEXT.minutes);
  });
});
