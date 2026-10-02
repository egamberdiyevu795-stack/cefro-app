/**
 * CEFR levels used across CEFRO, ordered from lowest to highest.
 *
 * Plus/minus sub-bands are CEFRO's own granularity (not official CEFR
 * descriptors). They let us show progress between attempts that would
 * otherwise sit inside the same official band.
 */
export const CEFR_LEVELS = [
  "A1",
  "A2",
  "A2+",
  "B1-",
  "B1",
  "B1+",
  "B2-",
  "B2",
  "B2+",
  "C1-",
  "C1",
  "C2",
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** The official band a task targets (no sub-bands). */
export type TargetLevel = "A2" | "B1" | "B2" | "C1";

export function cefrRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/** Negative if `a` is lower than `b`, 0 if equal, positive if higher. */
export function compareCefrLevels(a: CefrLevel, b: CefrLevel): number {
  return cefrRank(a) - cefrRank(b);
}

/** True when `level` is at or above the official target band (e.g. "B2-" is below "B2"). */
export function meetsTargetLevel(level: CefrLevel, target: TargetLevel): boolean {
  return cefrRank(level) >= cefrRank(target);
}
