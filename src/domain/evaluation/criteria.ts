/** Assessment criteria for speaking. Order here is display order. */
export const SPEAKING_CRITERIA = [
  "fluency_coherence",
  "grammar",
  "vocabulary",
  "pronunciation",
  "task_achievement",
] as const;

export type SpeakingCriterion = (typeof SPEAKING_CRITERIA)[number];

export const CRITERION_LABELS: Record<SpeakingCriterion, string> = {
  fluency_coherence: "Fluency & coherence",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
  task_achievement: "Task achievement",
};

/** Criterion scores are integers on a 0–10 scale (see the rubric for band mapping). */
export const CRITERION_SCORE_MAX = 10;
