import { SPEAKING_SCORE_TABLE } from "./speaking-score-table";

/*
 * Raw multilevel speaking total (0-21, half-point steps) -> official UZBMB 0-75 speaking score, and the official level bands
 * on that score. The values live only in `speaking-score-table.ts` (with their source). Pure: no clock, no database.
 */

const SCORE_BY_RAW: ReadonlyMap<number, number> = new Map(SPEAKING_SCORE_TABLE);

/**
 * The official 0-75 score for a raw total. Accepts 0 to 21 in 0.5 steps and nothing else: a value off the grid, out of range,
 * or not a finite number returns null. Never rounds and never interpolates.
 */
export function rawToSpeaking75(raw: number): number | null {
  if (typeof raw !== "number") return null;
  return SCORE_BY_RAW.get(raw) ?? null;
}

/** The levels the official bands on the 0-75 score give. "Below B1" is a real result. */
export type ScoreLevel = "Below B1" | "B1" | "B2" | "C1";

/** UZBMB's bands (docs/official-scale.md, section 1.4): C1 65-75, B2 51-64, B1 38-50, below B1 0-37. */
export function levelOfSpeaking75(score: number): ScoreLevel {
  if (score >= 65) return "C1";
  if (score >= 51) return "B2";
  if (score >= 38) return "B1";
  return "Below B1";
}
