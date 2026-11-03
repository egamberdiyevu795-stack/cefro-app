/**
 * Vocabulary shared by every Multilevel (UZBMB CEFR) speaking part.
 *
 * Feature levels are what the evaluator judges against the official descriptors; bands are what the student is
 * scored. A band is never produced by a model: it is computed from these levels by `band-scoring.ts`.
 */

/** Ordered lowest → highest. The numeric value used for averaging is the index (below_B1 = 0 … above_B2 = 3). */
export const FEATURE_LEVELS = ["below_B1", "B1", "B2", "above_B2"] as const;
export type FeatureLevel = (typeof FEATURE_LEVELS)[number];

/** Pronunciation can be impossible to judge (no audio, or the audio step failed or is switched off). */
export const NOT_ASSESSED = "not_assessed" as const;
export type PronunciationLevel = FeatureLevel | typeof NOT_ASSESSED;

export function levelValue(level: FeatureLevel): number {
  return FEATURE_LEVELS.indexOf(level);
}

export function levelFromValue(value: number): FeatureLevel {
  return FEATURE_LEVELS[Math.max(0, Math.min(FEATURE_LEVELS.length - 1, value))];
}

export const LEVEL_LABELS: Record<FeatureLevel, string> = {
  below_B1: "Below B1",
  B1: "B1",
  B2: "B2",
  above_B2: "Above B2",
};

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

/** How a question of the task was answered. "partial" counts as on topic (with a warning in the UI). */
export const QUESTION_STATUSES = ["on_topic", "partial", "missing", "off_topic"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export function isOnTopic(status: QuestionStatus): boolean {
  return status === "on_topic" || status === "partial";
}
