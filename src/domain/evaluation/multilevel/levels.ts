/**
 * Vocabulary shared by every Multilevel (UZBMB CEFR) speaking part.
 *
 * Feature levels are what the evaluator judges against the official descriptors; bands are what the student is
 * scored. A band is never produced by a model: it is computed from these levels by `band-scoring.ts`.
 *
 * Each rubric has its own ladder of four level names (docs/part1-plan.md §3): the scorer works on the index 0–3
 * only, so a level name means nothing without its ladder. Part 2 keeps below_B1 / B1 / B2 / above_B2 (the default
 * ladder), so stored Part 2 results need no migration.
 */

/** Part 2 (Question 7, target B2). Ordered lowest → highest; the index is the value used for averaging. */
export const FEATURE_LEVELS = ["below_B1", "B1", "B2", "above_B2"] as const;
/** Part 1.1 (Questions 1–3, target A2). */
export const Q1_3_LEVELS = ["below_A1", "A1", "A2", "above_A2"] as const;
/** Part 1.2 (Questions 4–6, target B1). */
export const Q4_6_LEVELS = ["below_A2", "A2", "B1", "above_B1"] as const;

/** Every level name any rubric uses. */
export const ALL_FEATURE_LEVELS = ["below_A1", "A1", "below_A2", "A2", "above_A2", "below_B1", "B1", "above_B1", "B2", "above_B2"] as const;
export type FeatureLevel = (typeof ALL_FEATURE_LEVELS)[number];

/** A rubric's four levels, lowest first: [below the scale, lower level, target level, above the target]. */
export type LevelLadder = readonly [FeatureLevel, FeatureLevel, FeatureLevel, FeatureLevel];
export const DEFAULT_LADDER: LevelLadder = FEATURE_LEVELS;

/** Pronunciation can be impossible to judge (no audio, or the audio step failed or is switched off). */
export const NOT_ASSESSED = "not_assessed" as const;
export type PronunciationLevel = FeatureLevel | typeof NOT_ASSESSED;

/** The index of a level on its rubric's ladder (0–3). A level that is not on the ladder is a programming error. */
export function levelValue(level: FeatureLevel, ladder: LevelLadder = DEFAULT_LADDER): number {
  const index = ladder.indexOf(level);
  if (index < 0) throw new Error(`Level "${level}" is not on the ladder ${ladder.join(" / ")}`);
  return index;
}

export function levelFromValue(value: number, ladder: LevelLadder = DEFAULT_LADDER): FeatureLevel {
  return ladder[Math.max(0, Math.min(ladder.length - 1, value))];
}

export const LEVEL_LABELS: Record<FeatureLevel, string> = {
  below_A1: "Below A1",
  A1: "A1",
  below_A2: "Below A2",
  A2: "A2",
  above_A2: "Above A2",
  below_B1: "Below B1",
  B1: "B1",
  above_B1: "Above B1",
  B2: "B2",
  above_B2: "Above B2",
};

/** The ladder a set of levels belongs to: the first known ladder that holds all of them (Part 2's by default). */
export function ladderOf(levels: readonly (PronunciationLevel | undefined)[]): LevelLadder {
  const named = levels.filter((l): l is FeatureLevel => l !== undefined && l !== NOT_ASSESSED);
  for (const ladder of [FEATURE_LEVELS, Q1_3_LEVELS, Q4_6_LEVELS] as const) {
    if (named.every((l) => (ladder as readonly string[]).includes(l))) return ladder;
  }
  return DEFAULT_LADDER;
}

/** Assessment features of the official rating scale. Order here is display order. */
export const FEATURES = ["grammar", "vocabulary", "pronunciation", "fluency", "cohesion"] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
  fluency: "Fluency",
  cohesion: "Cohesion",
};

/**
 * Which feature is named as "the thing to fix" when several share the lowest level: the ones a student can change
 * most directly in the next attempt come first.
 */
export const FIX_PRIORITY: readonly Feature[] = ["grammar", "vocabulary", "cohesion", "fluency", "pronunciation"];

/**
 * How a question of the task was answered. "partial" counts as on topic (with a warning in the UI); "minimal" (a bare
 * one-sentence answer with no reason, detail or example) does NOT count as on topic. Each rubric allows its own subset
 * (`question_statuses`): Part 2 all five, Part 1.1 on_topic / missing / off_topic, Part 1.2 without minimal.
 */
export const QUESTION_STATUSES = ["on_topic", "partial", "minimal", "missing", "off_topic"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export function isOnTopic(status: QuestionStatus): boolean {
  return status === "on_topic" || status === "partial";
}
