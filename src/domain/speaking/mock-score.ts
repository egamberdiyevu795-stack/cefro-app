import { EXAM_PART_IDS } from "./exam-part";
import { estimateSpeakingLevel, type EstimatedLevel, type PartBands } from "./mock-level";
import { levelOfSpeaking75, rawToSpeaking75 } from "./speaking-score";

/*
 * The estimate a full mock shows: "Speaking: NN / 75" and the level the official bands give for that score.
 *
 * When all four parts have a band, the raw total is their sum (our bands ARE UZBMB's four marks, docs/official-scale.md 1.4), the
 * score comes from UZBMB's table and the level from UZBMB's bands: `score` is a number.
 *
 * FALLBACK ONLY: where a score cannot be computed (a part has no band, or the sum is not a valid raw total), this uses the interim
 * rule `estimateSpeakingLevel` (ours, not UZBMB's) for the level and `score` is null: no /75 number is ever shown without the table.
 * Single parts never call this.
 */
export type MockEstimate =
  | { kind: "ready"; level: EstimatedLevel; /** Official 0-75 score, or null when only the interim rule could give the level. */ score: number | null }
  | { kind: "not_ready"; missing: (typeof EXAM_PART_IDS)[number][] };

export function estimateMockSpeaking(bands: PartBands): MockEstimate {
  const all = EXAM_PART_IDS.map((part) => bands[part]);
  if (all.every((b): b is number => typeof b === "number")) {
    const score = rawToSpeaking75(all.reduce((sum, b) => sum + b, 0));
    if (score !== null) return { kind: "ready", level: levelOfSpeaking75(score), score };
  }
  const interim = estimateSpeakingLevel(bands);
  return interim.kind === "ready" ? { kind: "ready", level: interim.level, score: null } : interim;
}
