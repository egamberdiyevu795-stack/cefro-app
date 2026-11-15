import type { ExamPartId } from "./exam-part";

/*
 * THE INTERIM LEVEL RULE, NOW A FALLBACK ONLY (docs/official-scale.md, section 5 and the 2026-11-13 update).
 *
 * A complete mock no longer uses this: `estimateMockSpeaking` (mock-score.ts) sums the four part bands, converts with UZBMB's
 * official table (speaking-score-table.ts) and levels by UZBMB's bands on the 0-75 score. This rule stays only where no score can be
 * computed (Part 1.1 has no band, or the sum is not a valid raw total): it gives a LEVEL, never a /75 number. It is ours, not UZBMB's.
 *
 * Pure: no database, no clock, no model. Browser-safe.
 */

/** What the estimate can say. "Below B1" is a real result; there is no Passed / Failed and no certificate level. */
export type EstimatedLevel = "Below B1" | "B1" | "B2" | "C1";

/** A part's band as the rubric gives it (Part 1.1 and 1.2: 0–5, Part 2: 0–5, Part 3: 0–6), or null when it has no AI band. */
export type PartBands = Partial<Record<ExamPartId, number | null>>;

/** The parts the rule reads, in exam order. Part 1.1 (aimed at A2) is shown in its row but does not change the estimate. */
export const RULE_PARTS: readonly ExamPartId[] = ["1.2", "2", "3"];

export type LevelEstimate =
  | { kind: "ready"; level: EstimatedLevel }
  /** At least one part the rule needs has no AI band yet: no level at all, never a guess. `missing` is in exam order. */
  | { kind: "not_ready"; missing: ExamPartId[] };

/** The line that goes under every estimate, exactly as docs/official-scale.md section 5 words it. */
export const SPEAKING_ONLY_LINE = "Speaking only. An estimate from this mock, not an official UZBMB score.";

/** What the headline says while the estimate cannot be given. */
export const ESTIMATE_NOT_READY = "Estimate not ready yet";

/**
 * The highest level that its own part supports:
 *
 *   C1        Part 3 band ≥ 5 (C1 or above) and Part 2 band ≥ 3 (Lower B2 or above)
 *   B2        Part 2 band ≥ 3, or Part 3 band ≥ 3 (Lower B2 or above)
 *   B1        Part 2 band ≥ 1 (Lower B1 or above), or Part 1.2 band ≥ 3 (Lower B1 or above)
 *   Below B1  none of the above
 *
 * Part 3 band ≥ 3 (not only 3–4, as the table in the doc reads) supports B2: a student at C1 on Part 3 supports B2 too, and a
 * literal "3–4" would give them a lower level than a weaker student. Parts 1.2, 2 and 3 must all have a band; if one has
 * none, the result is `not_ready` and names the missing parts. A part's band of 0 is a band (the rubric's "Below …"), not a
 * missing one; callers pass `null` for a part that is not scored (too short to rate, failed, still scoring, not done).
 */
export function estimateSpeakingLevel(bands: PartBands): LevelEstimate {
  const missing = RULE_PARTS.filter((part) => typeof bands[part] !== "number");
  if (missing.length > 0) return { kind: "not_ready", missing: [...missing] };
  const p12 = bands["1.2"] as number;
  const p2 = bands["2"] as number;
  const p3 = bands["3"] as number;
  if (p3 >= 5 && p2 >= 3) return { kind: "ready", level: "C1" };
  if (p2 >= 3 || p3 >= 3) return { kind: "ready", level: "B2" };
  if (p2 >= 1 || p12 >= 3) return { kind: "ready", level: "B1" };
  return { kind: "ready", level: "Below B1" };
}
