import type { Feature } from "@/domain/evaluation/multilevel/levels";

/**
 * Part 3's own level ladder (docs/part3-plan.md, decision 1): each rubric declares its ladder. Part 2 keeps
 * below_B1 … above_B2 and its stored results are untouched; Part 3 judges on below_B1, B1, B2, C1, above_C1.
 */
export const Q8_LEVELS = ["below_B1", "B1", "B2", "C1", "above_C1"] as const;
export type Q8Level = (typeof Q8_LEVELS)[number];

/** Pronunciation is judged up to C1 only, never above_C1 (decision 7), or not at all. */
export const Q8_PRONUNCIATION_LEVELS = ["below_B1", "B1", "B2", "C1", "not_assessed"] as const;
export type Q8PronunciationLevel = (typeof Q8_PRONUNCIATION_LEVELS)[number];

export const Q8_LEVEL_LABELS: Record<Q8Level, string> = {
  below_B1: "Below B1",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  above_C1: "Above C1",
};

export function q8LevelValue(level: Q8Level): number {
  return Q8_LEVELS.indexOf(level);
}

export function q8LevelFromValue(value: number): Q8Level {
  return Q8_LEVELS[Math.max(0, Math.min(Q8_LEVELS.length - 1, value))];
}

/**
 * Mean of levels on the ladder, nearest step, an exact .5 rounds DOWN: the same arithmetic as Part 2's
 * `bestFitLevel`, on this ladder.
 */
export function q8BestFit(levels: readonly Q8Level[]): { level: Q8Level; mean: number } {
  if (levels.length === 0) throw new Error("q8BestFit needs at least one assessed feature");
  const sum = levels.reduce((total, level) => total + q8LevelValue(level), 0);
  const n = levels.length;
  const rounded = Math.ceil((2 * sum - n) / (2 * n));
  return { level: q8LevelFromValue(rounded), mean: sum / n };
}

/** The four features always judged from the transcript. */
export const Q8_TRANSCRIPT_FEATURES = ["grammar", "vocabulary", "fluency", "cohesion"] as const satisfies readonly Feature[];
