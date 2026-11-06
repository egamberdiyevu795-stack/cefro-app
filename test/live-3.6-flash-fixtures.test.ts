import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import { multilevelResultSchema } from "@/domain/evaluation/multilevel/result";
import { tokenizeWords } from "@/domain/speaking/metrics";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { PART2_BAND_ANCHORS } from "./evaluation-samples/part2-band-anchors";
import { LIVE_36_FLASH_FIXTURES } from "./fixtures/live-3.6-flash";

const files = Object.values(LIVE_36_FLASH_FIXTURES);
const rubric = getSpeakingRubric(getSpeakingTask("b2-part2-advice-from-someone")!);

describe("live fixtures from gemini-3.6-flash (not the production model)", () => {
  it("hold the 19 finished scorings, made-up anchors only, all marked as not production", () => {
    expect(files.flatMap((f) => f.runs)).toHaveLength(19);
    for (const f of files) {
      expect(f._fixture).toMatchObject({ model: "gemini-3.6-flash", production: false });
      expect(PART2_BAND_ANCHORS.some((a) => a.id === f._fixture.anchor)).toBe(true);
      for (const r of f.runs) expect(r.evaluation).toMatchObject({ provider: "gemini", model: "gemini-3.6-flash", isDevelopmentProvider: false });
    }
  });

  it("every result has the evaluator's result shape and its band follows from the saved judgements", () => {
    for (const f of files) {
      const anchor = PART2_BAND_ANCHORS.find((a) => a.id === f._fixture.anchor)!;
      f.runs.forEach((r, i) => {
        const result = multilevelResultSchema.parse(r.evaluation.result);
        const rescored = scoreBand(
          {
            questions: result.assessment.questions,
            features: Object.fromEntries(FEATURES.map((feature) => [feature, result.assessment.features[feature].level])) as Parameters<typeof scoreBand>[0]["features"],
            memorizedOrIrrelevant: result.assessment.memorized_or_irrelevant,
            wordCount: tokenizeWords(anchor.transcript).length,
          },
          rubric.config,
        );
        expect(rescored, `${anchor.id} run ${i + 1}`).toEqual(result.scoring);
        expect(f._fixture.bands[i]).toBe(result.scoring.band);
        expect(result.audio.status).toBe("not_assessed"); // transcript-only run
      });
    }
  });
});
