import {
  FEATURES,
  FIX_PRIORITY,
  isOnTopic,
  levelFromValue,
  levelValue,
  NOT_ASSESSED,
  type Feature,
  type FeatureLevel,
  type PronunciationLevel,
  type QuestionStatus,
} from "./levels";
import type { BandScoringConfig } from "./rubric-config";

/**
 * Deterministic band scoring for Multilevel speaking parts.
 *
 * The model judges each question and each feature against the official descriptors; this module turns those
 * judgements into the band, following the official scale's logic:
 *
 *  1. on_topic_count = questions answered on topic or partially ("minimal", a bare one-sentence answer, does not count).
 *  2. language_level = mean of the assessed feature levels (below_B1 = 0 … above_B2 = 3), rounded to the nearest
 *     level with an exact .5 rounding DOWN.
 *  3. Band 0 when the answer is too short to rate (under min_words), memorised/irrelevant, no question is on topic,
 *     or the language is below B1.
 *  4. topic_cap from the on-topic count (above-target language with full coverage lifts the cap, but only when the
 *     features in above_target_requires are themselves above_B2), language_cap from the language level;
 *     band = min(topic_cap, language_cap).
 *  5. Provisional when pronunciation could not be assessed.
 *
 * All numbers come from the rubric config, so another part only needs another config.
 */

export interface BandScoringInput {
  questions: readonly { id: number; status: QuestionStatus }[];
  features: Record<Exclude<Feature, "pronunciation">, FeatureLevel> & { pronunciation: PronunciationLevel };
  memorizedOrIrrelevant: boolean;
  /** Words in the transcript; when given, answers under the config's min_words get band 0. */
  wordCount?: number;
}

export type ZeroReason = "too_short" | "memorized_or_irrelevant" | "no_question_on_topic" | "below_B1";

export type BiggestFix =
  | { kind: "question_coverage"; question_id: number }
  | { kind: "feature"; feature: Feature }
  | { kind: "own_words" };

export interface BandScore {
  on_topic_count: number;
  language_level: FeatureLevel;
  /** Mean feature value before rounding, kept for transparency. */
  language_mean: number;
  assessed_features: Feature[];
  topic_cap: number;
  language_cap: number;
  band: number;
  label: string;
  band_max: number;
  target_band: number;
  meets_target: boolean;
  /** True when pronunciation was not assessed: the band may change once it is. */
  provisional: boolean;
  zero_reason: ZeroReason | null;
  biggest_fix: BiggestFix;
}

/** Mean of levels rounded to the nearest level; an exact .5 rounds down. Exact integer arithmetic, no float drift. */
export function bestFitLevel(levels: readonly FeatureLevel[]): { level: FeatureLevel; mean: number } {
  if (levels.length === 0) throw new Error("bestFitLevel needs at least one assessed feature");
  const sum = levels.reduce((total, level) => total + levelValue(level), 0);
  const n = levels.length;
  // nearest integer with .5 down  ==  ceil(mean - 0.5)  ==  ceil((2·sum − n) / 2n)
  const rounded = Math.ceil((2 * sum - n) / (2 * n));
  return { level: levelFromValue(rounded), mean: sum / n };
}

export function topicCap(
  onTopicCount: number,
  languageLevel: FeatureLevel,
  config: BandScoringConfig,
  features?: BandScoringInput["features"],
): number {
  const required = config.scoring.above_target_requires ?? [];
  const requirementsMet = required.every((f) => features?.[f] === "above_B2");
  if (languageLevel === "above_B2" && onTopicCount === config.question_count && requirementsMet) {
    return config.scoring.above_target_full_coverage_cap;
  }
  const cap = config.scoring.topic_cap[String(onTopicCount)];
  if (cap === undefined) throw new Error(`No topic cap for ${onTopicCount} on-topic questions`);
  return cap;
}

export function languageCap(languageLevel: FeatureLevel, config: BandScoringConfig): number {
  return config.scoring.language_cap[languageLevel];
}

/** The assessed feature with the lowest level; ties go to the feature earliest in FIX_PRIORITY. */
export function lowestFeature(features: BandScoringInput["features"], exclude: readonly Feature[] = []): Feature | null {
  const assessed = FIX_PRIORITY.filter((f) => features[f] !== NOT_ASSESSED && !exclude.includes(f));
  if (assessed.length === 0) return null;
  let lowest = assessed[0];
  for (const f of assessed) {
    if (levelValue(features[f] as FeatureLevel) < levelValue(features[lowest] as FeatureLevel)) lowest = f;
  }
  return lowest;
}

/** First question (by number) that was not answered on topic; with `includePartial`, a partial answer counts too (after the unanswered ones). */
export function firstUncoveredQuestion(questions: BandScoringInput["questions"], includePartial = false): number | null {
  const sorted = [...questions].sort((a, b) => a.id - b.id);
  const uncovered = sorted.find((q) => !isOnTopic(q.status))?.id ?? null;
  if (uncovered !== null || !includePartial) return uncovered;
  return sorted.find((q) => q.status === "partial")?.id ?? null;
}

export function scoreBand(input: BandScoringInput, config: BandScoringConfig): BandScore {
  const onTopicCount = input.questions.filter((q) => isOnTopic(q.status)).length;
  const assessedFeatures = FEATURES.filter((f) => input.features[f] !== NOT_ASSESSED);
  const { level: languageLevel, mean } = bestFitLevel(assessedFeatures.map((f) => input.features[f] as FeatureLevel));

  const minWords = config.scoring.min_words ?? 0;
  const tooShort = input.wordCount !== undefined && minWords > 0 && input.wordCount < minWords;
  const zeroReason: ZeroReason | null = tooShort
    ? "too_short"
    : input.memorizedOrIrrelevant
      ? "memorized_or_irrelevant"
      : onTopicCount === 0
        ? "no_question_on_topic"
        : languageLevel === "below_B1"
          ? "below_B1"
          : null;

  const tCap = topicCap(onTopicCount, languageLevel, config, input.features);
  const lCap = languageCap(languageLevel, config);
  const band = zeroReason ? 0 : Math.min(tCap, lCap);

  let biggestFix: BiggestFix;
  const uncovered = firstUncoveredQuestion(input.questions, true);
  if (zeroReason === "memorized_or_irrelevant") {
    biggestFix = { kind: "own_words" };
  } else if (isLowestAlone(input.features, "fluency")) {
    // Fluency clearly below every other feature: it is what holds the answer back, whatever the coverage.
    biggestFix = { kind: "feature", feature: "fluency" };
  } else if (zeroReason === "too_short") {
    // Too short to rate: say more, starting with the first question not (fully) answered.
    biggestFix = uncovered !== null ? { kind: "question_coverage", question_id: uncovered } : { kind: "feature", feature: "fluency" };
  } else if (tCap < lCap) {
    // Coverage limits the band more than language does: answering the missing question is the biggest gain.
    biggestFix = { kind: "question_coverage", question_id: firstUncoveredQuestion(input.questions) ?? 1 };
  } else {
    // At least the four transcript features are always assessed, so there is always a lowest one.
    biggestFix = { kind: "feature", feature: lowestFeature(input.features)! };
  }

  return {
    on_topic_count: onTopicCount,
    language_level: languageLevel,
    language_mean: Math.round(mean * 100) / 100,
    assessed_features: assessedFeatures,
    topic_cap: tCap,
    language_cap: lCap,
    band,
    label: bandLabel(band, config),
    band_max: config.band_max,
    target_band: config.meets_target_band,
    meets_target: band >= config.meets_target_band,
    provisional: input.features.pronunciation === NOT_ASSESSED,
    zero_reason: zeroReason,
    biggest_fix: biggestFix,
  };
}

/** True when `feature` is assessed and strictly lower than every other assessed feature. */
export function isLowestAlone(features: BandScoringInput["features"], feature: Feature): boolean {
  const level = features[feature];
  if (level === NOT_ASSESSED) return false;
  const others = FEATURES.filter((f) => f !== feature && features[f] !== NOT_ASSESSED);
  return others.length > 0 && others.every((f) => levelValue(features[f] as FeatureLevel) > levelValue(level as FeatureLevel));
}

export function bandLabel(band: number, config: Pick<BandScoringConfig, "bands">): string {
  const entry = config.bands.find((b) => b.band === band);
  if (!entry) throw new Error(`No label for band ${band}`);
  return entry.label;
}
