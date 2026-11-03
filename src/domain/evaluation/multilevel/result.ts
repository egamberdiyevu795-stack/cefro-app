import { z } from "zod";
import { firstUncoveredQuestion, lowestFeature, type BandScore, type BiggestFix } from "./band-scoring";
import { FEATURES, FEATURE_LABELS, FEATURE_LEVELS, type Feature } from "./levels";
import { multilevelModelOutputSchema, type MultilevelModelOutput } from "./model-output";

/**
 * A stored Multilevel evaluation (evaluation schema version 3): the model's judgements (after the quality gate and
 * the audio step), the deterministic band, and the retry focus derived from both.
 */

const featureEnum = z.enum(FEATURES);

export const bandScoreSchema = z.object({
  on_topic_count: z.number().int().min(0),
  language_level: z.enum(FEATURE_LEVELS),
  language_mean: z.number(),
  assessed_features: z.array(featureEnum),
  topic_cap: z.number().int().min(0),
  language_cap: z.number().int().min(0),
  band: z.number().int().min(0),
  label: z.string().min(1),
  band_max: z.number().int().min(1),
  target_band: z.number().int().min(0),
  meets_target: z.boolean(),
  provisional: z.boolean(),
  zero_reason: z.enum(["memorized_or_irrelevant", "no_question_on_topic", "below_B1"]).nullable(),
  biggest_fix: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("question_coverage"), question_id: z.number().int().min(1) }),
    z.object({ kind: z.literal("feature"), feature: featureEnum }),
    z.object({ kind: z.literal("own_words") }),
  ]),
}) satisfies z.ZodType<BandScore>;

export const retryFocusTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question"), question_id: z.number().int().min(1) }),
  z.object({ kind: z.literal("feature"), feature: featureEnum }),
  z.object({ kind: z.literal("own_words") }),
]);

export const multilevelRetryFocusSchema = z.object({
  objective: z.string().min(1),
  success_check: z.string().min(1),
  target: retryFocusTargetSchema,
});

export const FEATURE_SOURCES = ["transcript", "audio", "transcript+audio", "none"] as const;

export const multilevelResultSchema = z.object({
  kind: z.literal("multilevel"),
  rubric_id: z.string().min(1),
  /** Exam part and official question number, so the UI can say "Part 2" without knowing the rubric. */
  part: z.number().int().min(1),
  official_question: z.number().int().min(1),
  assessment: multilevelModelOutputSchema,
  /** What each feature level was judged from. */
  feature_sources: z.record(featureEnum, z.enum(FEATURE_SOURCES)),
  audio: z.object({
    status: z.enum(["assessed", "not_assessed"]),
    /** Why audio was not used: switched off, no recording, the audio call failed, or the recording was too unclear. */
    reason: z.enum(["disabled", "no_audio", "failed", "unclear"]).nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
  }),
  scoring: bandScoreSchema,
  retry_focus: z.array(multilevelRetryFocusSchema).max(2),
});

export type MultilevelResult = z.infer<typeof multilevelResultSchema>;
export type MultilevelRetryFocus = z.infer<typeof multilevelRetryFocusSchema>;
export type FeatureSource = (typeof FEATURE_SOURCES)[number];

/** Retry focus text for answering (or fully answering) a question. Numbering is 1-based, as everywhere. */
export function questionFocus(questionId: number, questionText: string, partial: boolean): MultilevelRetryFocus {
  return partial
    ? {
        objective: `Answer question ${questionId} fully: "${questionText}"`,
        success_check: `You answer question ${questionId} directly in your first sentence, then add a reason or an example.`,
        target: { kind: "question", question_id: questionId },
      }
    : {
        objective: `Answer question ${questionId}: "${questionText}"`,
        success_check: `You say at least two sentences that answer question ${questionId}, with one reason or example.`,
        target: { kind: "question", question_id: questionId },
      };
}

const OWN_WORDS_FOCUS: MultilevelRetryFocus = {
  objective: "Answer the questions you are asked, in your own words. Do not use a prepared text.",
  success_check: "Each part of your answer starts by answering one of the questions directly.",
  target: { kind: "own_words" },
};

function featureFocus(assessment: MultilevelModelOutput, feature: Feature): MultilevelRetryFocus {
  const f = assessment.features[feature];
  return {
    objective: f.how_to_improve.trim() || `Work on ${FEATURE_LABELS[feature].toLowerCase()}: ${f.note}`,
    success_check: f.how_to_check.trim() || "Listen back to your answer and check this point.",
    target: { kind: "feature", feature },
  };
}

/**
 * At most two focus points, chosen by the same logic as "the biggest thing to fix": the biggest fix first, then the
 * other kind of gain (a feature after a coverage fix, a question after a feature fix), else the next-lowest feature.
 */
export function deriveRetryFocus(
  assessment: MultilevelModelOutput,
  score: Pick<BandScore, "biggest_fix">,
  questionTexts: readonly string[],
): MultilevelRetryFocus[] {
  const levels = Object.fromEntries(FEATURES.map((f) => [f, assessment.features[f].level])) as Parameters<typeof lowestFeature>[0];
  const statusOf = (id: number) => assessment.questions.find((q) => q.id === id)?.status;
  const forQuestion = (id: number) => questionFocus(id, questionTexts[id - 1] ?? `question ${id}`, statusOf(id) === "partial");

  const focus: MultilevelRetryFocus[] = [];
  const fix: BiggestFix = score.biggest_fix;
  if (fix.kind === "question_coverage") focus.push(forQuestion(fix.question_id));
  else if (fix.kind === "own_words") focus.push(OWN_WORDS_FOCUS);
  else focus.push(featureFocus(assessment, fix.feature));

  if (fix.kind === "feature") {
    const question = firstUncoveredQuestion(assessment.questions, true);
    const next = question !== null ? null : lowestFeature(levels, [fix.feature]);
    if (question !== null) focus.push(forQuestion(question));
    else if (next) focus.push(featureFocus(assessment, next));
  } else {
    const feature = lowestFeature(levels);
    if (feature) focus.push(featureFocus(assessment, feature));
  }
  return focus.slice(0, 2);
}
