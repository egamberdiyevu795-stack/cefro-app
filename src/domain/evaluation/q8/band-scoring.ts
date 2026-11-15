import { FIX_PRIORITY, type Feature } from "@/domain/evaluation/multilevel/levels";
import type { PromptDependence } from "@/domain/evaluation/multilevel/prompt-overlap";
import { POINT_IDS, sideOf, type PointId, type Side } from "@/domain/speaking/argument-task";
import { q8BestFit, q8LevelValue, type Q8Level, type Q8PronunciationLevel } from "./levels";
import type { PointStatus } from "./model-output";
import type { Coverage, Q8ScoringConfig } from "./rubric-config";

/**
 * Deterministic band scoring for Part 3 (docs/part3-plan.md, section 4). The model judges each listed point, the
 * prompt dependence and each language feature; this module turns those judgements into the band:
 *
 *  1. coverage from the LISTED points only (own arguments never count, decision 2): a point is covered when it is
 *     developed or restated, developed only with a reason that supports it (a rebuttal does not, decision 8).
 *  2. language level = mean of the assessed features on the 5-step ladder, nearest step, exact .5 down.
 *  3. Band 0 when the answer is memorised / irrelevant, no listed point is addressed, or the language is below B1.
 *  4. band = min(coverage cap, dependence cap, language cap). An above_C1 language level gets its cap of 6 only when
 *     grammar AND vocabulary are each above_C1 (the band-6 gate, decision 7); otherwise the cap is 5.
 *  5. Provisional when pronunciation was not assessed.
 *
 * All numbers come from the rubric file (multilevel_q8.json).
 */

export type TranscriptFeature = Exclude<Feature, "pronunciation">;

export interface Q8ScoringInput {
  points: readonly { id: PointId; status: PointStatus; rebutted?: boolean }[];
  /** The final dependence level (the model's, or code's in the clear case: `decideDependence`). */
  dependence: PromptDependence;
  features: Record<TranscriptFeature, Q8Level> & { pronunciation: Q8PronunciationLevel };
  memorizedOrIrrelevant: boolean;
}

export type Q8ZeroReason = "memorized_or_irrelevant" | "no_point_addressed" | "below_B1";

export type Q8BiggestFix =
  | { kind: "own_words" }
  | { kind: "prompt_dependence"; level: Exclude<PromptDependence, "own_development"> }
  /** Coverage stops at one side (or at none, with language that is fine): add the missing side, starting with `point_id`. */
  | { kind: "section_coverage"; missing_side: Side | "both"; point_id: PointId }
  /**
   * Both sides covered, not in full: `too_few_points` = fewer than two listed points on `side`; `restated` = `point_id`
   * was named but not supported; `rebutted` = the side's points were only stated to be argued against.
   */
  | { kind: "point_development"; side: Side; reason: "too_few_points" | "restated" | "rebutted"; point_id: PointId | null }
  | { kind: "feature"; feature: Feature };

export interface SideCount {
  covered: number;
  developed: number;
}

export interface Q8BandScore {
  coverage: Coverage;
  sides: Record<Side, SideCount>;
  /** Fewer than two listed points on a side: the feedback says "Choose two points from each list.", whatever the band. */
  needs_two_points_per_side: boolean;
  dependence: PromptDependence;
  language_level: Q8Level;
  language_mean: number;
  assessed_features: Feature[];
  coverage_cap: number;
  dependence_cap: number;
  language_cap: number;
  /** True when above_C1 language was capped at 5 because grammar or vocabulary is not above_C1. */
  band6_gate_blocked: boolean;
  band: number;
  label: string;
  band_max: number;
  target_band: number;
  meets_target: boolean;
  provisional: boolean;
  zero_reason: Q8ZeroReason | null;
  biggest_fix: Q8BiggestFix;
}

const covers = (status: PointStatus) => status === "developed" || status === "restated";

export function countSides(points: Q8ScoringInput["points"]): Record<Side, SideCount> {
  const sides: Record<Side, SideCount> = { for: { covered: 0, developed: 0 }, against: { covered: 0, developed: 0 } };
  for (const point of points) {
    const side = sides[sideOf(point.id)];
    if (covers(point.status)) side.covered++;
    if (point.status === "developed") side.developed++;
  }
  return sides;
}

/** Coverage from the listed points (plan section 3, "Code-side derived values"). */
export function deriveCoverage(sides: Record<Side, SideCount>, pointsPerSide: number): Coverage {
  const { for: f, against: a } = sides;
  if (f.covered === 0 && a.covered === 0) return "none";
  if (f.covered === 0 || a.covered === 0) return "one_side";
  if (f.covered >= pointsPerSide && a.covered >= pointsPerSide && f.developed >= 1 && a.developed >= 1) return "both_sides_full";
  return "both_sides";
}

/** Language cap with the band-6 gate (decision 7). */
export function q8LanguageCap(level: Q8Level, features: Q8ScoringInput["features"], config: Q8ScoringConfig): { cap: number; gateBlocked: boolean } {
  const cap = config.scoring.language_cap[level];
  if (level !== "above_C1") return { cap, gateBlocked: false };
  const met = config.scoring.above_target_requires.every((f) => features[f] === "above_C1");
  return met ? { cap, gateBlocked: false } : { cap: Math.min(cap, config.scoring.above_target_gate_cap), gateBlocked: true };
}

/** The assessed feature with the lowest level; ties go to the feature earliest in FIX_PRIORITY (as in Part 2). */
export function q8LowestFeature(features: Q8ScoringInput["features"], exclude: readonly Feature[] = []): Feature | null {
  const assessed = FIX_PRIORITY.filter((f) => features[f] !== "not_assessed" && !exclude.includes(f));
  if (assessed.length === 0) return null;
  let lowest = assessed[0];
  for (const f of assessed) {
    if (q8LevelValue(features[f] as Q8Level) < q8LevelValue(features[lowest] as Q8Level)) lowest = f;
  }
  return lowest;
}

export function scoreQ8Band(input: Q8ScoringInput, config: Q8ScoringConfig): Q8BandScore {
  const statusOf = new Map(input.points.map((p) => [p.id, p]));
  const sides = countSides(input.points);
  const coverage = deriveCoverage(sides, config.points_per_side);

  const assessed = FIX_PRIORITY.filter((f) => input.features[f] !== "not_assessed");
  const assessedFeatures = (["grammar", "vocabulary", "pronunciation", "fluency", "cohesion"] as const).filter((f) => assessed.includes(f));
  const { level: languageLevel, mean } = q8BestFit(assessedFeatures.map((f) => input.features[f] as Q8Level));

  const zeroReason: Q8ZeroReason | null = input.memorizedOrIrrelevant
    ? "memorized_or_irrelevant"
    : coverage === "none"
      ? "no_point_addressed"
      : languageLevel === "below_B1"
        ? "below_B1"
        : null;

  const coverageCap = config.scoring.coverage_cap[coverage];
  const dependenceCap = config.scoring.dependence_cap[input.dependence];
  const { cap: languageCap, gateBlocked } = q8LanguageCap(languageLevel, input.features, config);
  const band = zeroReason ? 0 : Math.min(coverageCap, dependenceCap, languageCap);
  const lowest = Math.min(coverageCap, dependenceCap, languageCap);

  // The cap that binds lowest; ties in the plan's order (section 4, "Biggest fix").
  let biggestFix: Q8BiggestFix;
  const firstOn = (side: Side, wanted: (status: PointStatus) => boolean): PointId | null =>
    POINT_IDS.filter((id) => sideOf(id) === side).find((id) => wanted(statusOf.get(id)?.status ?? "not_addressed")) ?? null;
  if (zeroReason === "memorized_or_irrelevant") {
    biggestFix = { kind: "own_words" };
  } else if (dependenceCap === lowest && input.dependence !== "own_development") {
    biggestFix = { kind: "prompt_dependence", level: input.dependence };
  } else if ((coverage === "one_side" && coverageCap === lowest) || (coverage === "none" && languageCap > 0)) {
    const missing: Side | "both" = coverage === "none" ? "both" : sides.for.covered === 0 ? "for" : "against";
    const side: Side = missing === "both" ? "for" : missing;
    biggestFix = { kind: "section_coverage", missing_side: missing, point_id: firstOn(side, (s) => s !== "misread") ?? (side === "for" ? "F1" : "A1") };
  } else if (coverage === "both_sides" && coverageCap === lowest) {
    biggestFix = pointDevelopmentFix(input, sides, config.points_per_side);
  } else {
    // At least the four transcript features are always assessed, so there is always a lowest one.
    biggestFix = { kind: "feature", feature: q8LowestFeature(input.features)! };
  }

  return {
    coverage,
    sides,
    needs_two_points_per_side: sides.for.covered < config.points_per_side || sides.against.covered < config.points_per_side,
    dependence: input.dependence,
    language_level: languageLevel,
    language_mean: Math.round(mean * 100) / 100,
    assessed_features: assessedFeatures,
    coverage_cap: coverageCap,
    dependence_cap: dependenceCap,
    language_cap: languageCap,
    band6_gate_blocked: gateBlocked,
    band,
    label: q8BandLabel(band, config),
    band_max: config.band_max,
    target_band: config.meets_target_band,
    meets_target: band >= config.meets_target_band,
    provisional: input.features.pronunciation === "not_assessed",
    zero_reason: zeroReason,
    biggest_fix: biggestFix,
  };
}

/** Coverage is both sides but not full: which side to work on, and how (plan section 4, item 4). */
function pointDevelopmentFix(input: Q8ScoringInput, sides: Record<Side, SideCount>, pointsPerSide: number): Q8BiggestFix {
  const sideOrder: Side[] = ["for", "against"];
  const short = sideOrder.find((side) => sides[side].covered < pointsPerSide);
  if (short) return { kind: "point_development", side: short, reason: "too_few_points", point_id: null };
  const side = sideOrder.find((s) => sides[s].developed === 0) ?? "for";
  const onSide = input.points.filter((p) => sideOf(p.id) === side && p.status === "restated");
  const rebutted = onSide.length > 0 && onSide.every((p) => p.rebutted);
  return { kind: "point_development", side, reason: rebutted ? "rebutted" : "restated", point_id: onSide[0]?.id ?? null };
}

export function q8BandLabel(band: number, config: Pick<Q8ScoringConfig, "bands">): string {
  const entry = config.bands.find((b) => b.band === band);
  if (!entry) throw new Error(`No label for band ${band}`);
  return entry.label;
}
