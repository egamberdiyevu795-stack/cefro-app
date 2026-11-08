import { z } from "zod";
import { FEATURES, FEATURE_LABELS, type Feature } from "@/domain/evaluation/multilevel/levels";
import { PROMPT_DEPENDENCE_LEVELS } from "@/domain/evaluation/multilevel/prompt-overlap";
import { FEATURE_SOURCES } from "@/domain/evaluation/multilevel/result";
import { POINT_IDS, SIDE_LABELS, pointById, type BalancedArgumentTask, type PointId, type Side } from "@/domain/speaking/argument-task";
import { q8LowestFeature, type Q8BandScore, type Q8BiggestFix, type Q8ScoringInput } from "./band-scoring";
import { Q8_LEVELS } from "./levels";
import { q8ModelOutputSchema, type Q8ModelOutput } from "./model-output";
import { COVERAGE_LEVELS } from "./rubric-config";

/**
 * A stored Part 3 evaluation: the model's judgements (after the quality gate), the measured prompt overlap with the
 * dependence decision, the deterministic band, and the retry goals. Its own `kind`, so nothing that reads Part 2
 * results (`kind: "multilevel"`) can mistake one for the other.
 */

const featureEnum = z.enum(FEATURES);
const sideEnum = z.enum(["for", "against"]);
const pointEnum = z.enum(POINT_IDS);
const dependenceEnum = z.enum(PROMPT_DEPENDENCE_LEVELS);

export const q8BandScoreSchema = z.object({
  coverage: z.enum(COVERAGE_LEVELS),
  sides: z.object({
    for: z.object({ covered: z.number().int().min(0), developed: z.number().int().min(0) }),
    against: z.object({ covered: z.number().int().min(0), developed: z.number().int().min(0) }),
  }),
  needs_two_points_per_side: z.boolean(),
  dependence: dependenceEnum,
  language_level: z.enum(Q8_LEVELS),
  language_mean: z.number(),
  assessed_features: z.array(featureEnum),
  coverage_cap: z.number().int().min(0),
  dependence_cap: z.number().int().min(0),
  language_cap: z.number().int().min(0),
  band6_gate_blocked: z.boolean(),
  band: z.number().int().min(0),
  label: z.string().min(1),
  band_max: z.number().int().min(1),
  target_band: z.number().int().min(0),
  meets_target: z.boolean(),
  provisional: z.boolean(),
  zero_reason: z.enum(["memorized_or_irrelevant", "no_point_addressed", "below_B1"]).nullable(),
  biggest_fix: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("own_words") }),
    z.object({ kind: z.literal("prompt_dependence"), level: z.enum(["heavily_dependent", "reads_prompts"]) }),
    z.object({ kind: z.literal("section_coverage"), missing_side: z.enum(["for", "against", "both"]), point_id: pointEnum }),
    z.object({
      kind: z.literal("point_development"),
      side: sideEnum,
      reason: z.enum(["too_few_points", "restated", "rebutted"]),
      point_id: pointEnum.nullable(),
    }),
    z.object({ kind: z.literal("feature"), feature: featureEnum }),
  ]),
}) satisfies z.ZodType<Q8BandScore>;

export const q8RetryFocusSchema = z.object({
  objective: z.string().min(1),
  success_check: z.string().min(1),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("own_words") }),
    z.object({ kind: z.literal("prompt_dependence") }),
    z.object({ kind: z.literal("coverage"), side: z.enum(["for", "against", "both"]) }),
    z.object({ kind: z.literal("point"), point_id: pointEnum }),
    z.object({ kind: z.literal("feature"), feature: featureEnum }),
  ]),
});

/** The measured overlap (prompt-overlap.ts) and how it combined with the model's judgement (decision 4). */
export const q8OverlapSchema = z.object({
  token_count: z.number().int().min(0),
  copied_ratio: z.number().min(0).max(1),
  points_read: z.number().int().min(0),
  points_read_ids: z.array(z.string()),
  novel_content_words: z.number().int().min(0),
  named_runs: z.number().int().min(0),
  /** Normalised text of each copied run (lowercase, no punctuation), in transcript order. */
  copied_spans: z.array(z.string()),
  model_dependence: dependenceEnum,
  code_dependence: dependenceEnum,
  final_dependence: dependenceEnum,
  override_applied: z.boolean(),
  /** Code and model disagree: logged for the threshold review (decision 6), never applied on its own. */
  dependence_disagreement: z.boolean(),
});

export const q8ResultSchema = z.object({
  kind: z.literal("multilevel_q8"),
  rubric_id: z.literal("multilevel-q8"),
  part: z.literal(3),
  official_question: z.literal(8),
  /** The points the student chose on the preparation screen (for feedback only: the evaluator judges what was said). */
  chosen_points: z.array(pointEnum).max(6),
  assessment: q8ModelOutputSchema,
  overlap: q8OverlapSchema,
  feature_sources: z.record(featureEnum, z.enum(FEATURE_SOURCES)),
  audio: z.object({
    status: z.enum(["assessed", "not_assessed"]),
    reason: z.enum(["disabled", "no_audio", "failed", "unclear"]).nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
  }),
  scoring: q8BandScoreSchema,
  retry_focus: z.array(q8RetryFocusSchema).max(2),
});

export type Q8Result = z.infer<typeof q8ResultSchema>;
export type Q8RetryFocus = z.infer<typeof q8RetryFocusSchema>;
export type Q8Overlap = z.infer<typeof q8OverlapSchema>;

/* ------------------------------------------------------------------------------------------------- retry goals */

/** The two headlines of the plan (section 4, item 2). */
export const OWN_WORDS_HEADLINE = "Say the ideas in your own words.";
export const EXPLAIN_HEADLINE = "Explain each point in your own words with a reason or an example.";
export const CHOOSE_TWO = "Choose two points from each list.";
export const REBUTTAL_HEADLINE = "Before you argue against a point, give one real reason that supports it.";

type TaskPoints = Pick<BalancedArgumentTask, "points">;

const quotePoint = (task: TaskPoints, id: PointId) => `${id} ("${pointById(task, id).text}")`;

/** The goal for a biggest fix. Point goals name the point by id, so a retry review can check that very point. */
export function q8FocusFor(fix: Q8BiggestFix, assessment: Q8ModelOutput, task: TaskPoints): Q8RetryFocus {
  switch (fix.kind) {
    case "own_words":
      return {
        objective: "Argue this statement in your own words. Do not use a prepared text.",
        success_check: "Every part of your answer is about the statement and the points you chose.",
        target: { kind: "own_words" },
      };
    case "prompt_dependence":
      return fix.level === "reads_prompts"
        ? {
            objective: `${OWN_WORDS_HEADLINE} Name a point in a few words, then explain it with your own reason or example.`,
            success_check: "After each point you name, you say at least one sentence of your own about it.",
            target: { kind: "prompt_dependence" },
          }
        : {
            objective: EXPLAIN_HEADLINE,
            success_check: "Each point you use has a 'because' or 'for example' of your own after it.",
            target: { kind: "prompt_dependence" },
          };
    case "section_coverage": {
      const side = fix.missing_side === "both" ? "both lists" : `the ${SIDE_LABELS[fix.missing_side].toUpperCase()} list`;
      return {
        objective: `${CHOOSE_TWO} Add two points from ${side}, for example ${quotePoint(task, fix.point_id)}.`,
        success_check: "You talk about two FOR points and two AGAINST points.",
        target: { kind: "coverage", side: fix.missing_side },
      };
    }
    case "point_development":
      if (fix.reason === "too_few_points" || fix.point_id === null) {
        return {
          objective: `${CHOOSE_TWO} Add a second point from the ${SIDE_LABELS[fix.side].toUpperCase()} list.`,
          success_check: "You talk about two FOR points and two AGAINST points.",
          target: { kind: "coverage", side: fix.side },
        };
      }
      return fix.reason === "rebutted"
        ? {
            objective: `${REBUTTAL_HEADLINE} Support ${quotePoint(task, fix.point_id)} first.`,
            success_check: `Before your "but", you give one reason or example for ${fix.point_id}.`,
            target: { kind: "point", point_id: fix.point_id },
          }
        : {
            objective: `Give a reason or an example for ${quotePoint(task, fix.point_id)}.`,
            success_check: `After you name ${fix.point_id}, you add a sentence of your own that explains it.`,
            target: { kind: "point", point_id: fix.point_id },
          };
    case "feature":
      return featureFocus(assessment, fix.feature);
  }
}

function featureFocus(assessment: Q8ModelOutput, feature: Feature): Q8RetryFocus {
  const f = assessment.features[feature];
  return {
    objective: f.how_to_improve.trim() || `Work on ${FEATURE_LABELS[feature].toLowerCase()}: ${f.note}`,
    success_check: f.how_to_check.trim() || "Listen back to your answer and check this point.",
    target: { kind: "feature", feature },
  };
}

/** At most two goals: the biggest fix, then the lowest language feature (a different one when the fix is a feature). */
export function deriveQ8RetryFocus(assessment: Q8ModelOutput, score: Pick<Q8BandScore, "biggest_fix">, task: TaskPoints): Q8RetryFocus[] {
  const levels = Object.fromEntries(FEATURES.map((f) => [f, assessment.features[f].level])) as Q8ScoringInput["features"];
  const focus = [q8FocusFor(score.biggest_fix, assessment, task)];
  const next = q8LowestFeature(levels, score.biggest_fix.kind === "feature" ? [score.biggest_fix.feature] : []);
  if (next) focus.push(featureFocus(assessment, next));
  return focus.slice(0, 2);
}

/** The point a goal names ("F1".."A3"), for checking it in a retry; null for any other goal. */
export function goalPoint(objective: string): PointId | null {
  const match = /\b([FA][123])\b/.exec(objective);
  return match ? (match[1] as PointId) : null;
}

export type { Side };
