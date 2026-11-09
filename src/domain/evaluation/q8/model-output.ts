import { z } from "zod";
import { errorPatternSchema, languageErrorSchema, retryReviewSchema } from "@/domain/evaluation/multilevel/model-output";
import { PROMPT_DEPENDENCE_LEVELS } from "@/domain/evaluation/multilevel/prompt-overlap";
import { POINT_IDS } from "@/domain/speaking/argument-task";
import { Q8_LEVELS, Q8_PRONUNCIATION_LEVELS } from "./levels";

/**
 * What the Part 3 evaluator returns (docs/part3-plan.md, section 3): JUDGEMENTS AND EXACT QUOTES ONLY. No band, no
 * score, no overall level: `band-scoring.ts` computes the band, so the same output always gives the same band.
 * Errors, error patterns and the retry review are Part 2's building blocks, unchanged.
 */

export const POINT_STATUSES = ["developed", "restated", "not_addressed", "misread"] as const;
export type PointStatus = (typeof POINT_STATUSES)[number];

export const pointAssessmentSchema = z.object({
  id: z.enum(POINT_IDS),
  status: z
    .enum(POINT_STATUSES)
    .describe(
      "developed: the student explains the point with at least one reason, example or consequence of their own that SUPPORTS it. " +
        "restated: the point is mentioned (read, paraphrased or named) but nothing is added in its support. " +
        "not_addressed: not mentioned. misread: presented on the wrong side or with a meaning the point does not have.",
    ),
  /**
   * Added to the plan's schema: the rebuttal rule (decision 8) needs to know when a point was stated only to be argued
   * against, so the feedback can say "Before you argue against a point, give one real reason that supports it."
   */
  rebutted: z.boolean().describe("true when the student states this point only to argue against it ('Some people say X, but…')."),
  evidence: z.string().describe("Exact substring of the transcript where the point is made, or ''."),
  development_evidence: z
    .string()
    .describe("Exact substring with the student's own reason or example SUPPORTING this point, or '' unless developed. A rebuttal is never this point's development."),
  note: z.string().describe("One short sentence for the student about this point."),
  model_answer: z
    .string()
    .describe("For restated / not_addressed points: 1–2 sentences (at most 40 words) developing it at C1, on this point only. '' otherwise."),
});

export const ownPointSchema = z.object({
  side: z.enum(["for", "against"]),
  evidence: z.string().min(1).describe("Exact substring: an argument of the student's own that is not on the list."),
  note: z.string(),
});

const quotes = z.array(z.string()).max(4).describe("Exact substrings copied from the transcript. Never paraphrase.");
const featureFields = {
  evidence: quotes,
  note: z.string().describe("One short sentence for the student: why this level, referring to the quotes."),
  how_to_improve: z.string().describe("One concrete instruction for the next attempt, about ONE issue. Examples on another topic."),
  how_to_check: z.string().describe("How the student can tell, after the next attempt, that they did it. A skill, never a set phrase."),
};
const featureAssessment = z.object({ level: z.enum(Q8_LEVELS), ...featureFields });
const pronunciationAssessment = z.object({
  level: z.enum(Q8_PRONUNCIATION_LEVELS).describe("Up to C1 only, never above_C1. not_assessed when judging from a transcript."),
  ...featureFields,
});

export const q8StrengthSchema = z.object({
  feature: z.enum(["grammar", "vocabulary", "fluency", "cohesion"]),
  quote: z.string().min(1).describe("Exact substring that shows C1-or-better language for this feature."),
  note: z.string().min(1),
});

export const q8ModelOutputSchema = z.object({
  points: z.array(pointAssessmentSchema).length(6).describe("Exactly F1, F2, F3, A1, A2, A3, in this order."),
  own_points: z.array(ownPointSchema).max(4),
  prompt_dependence: z.object({
    level: z.enum(PROMPT_DEPENDENCE_LEVELS),
    evidence: z.array(z.string()).max(4).describe("Exact substrings that show reading or leaning on the prompt text; [] for own_development."),
    note: z.string(),
  }),
  coherent_and_sustained: z.boolean().describe("false when the answer is a list of fragments rather than a connected argument."),
  conclusion: z.enum(["weighed", "one_sided", "none"]).describe("Feedback only; no band effect."),
  features: z.object({
    grammar: featureAssessment,
    vocabulary: featureAssessment,
    fluency: featureAssessment,
    cohesion: featureAssessment,
    pronunciation: pronunciationAssessment,
  }),
  memorized_or_irrelevant: z.boolean(),
  errors: z.array(languageErrorSchema).max(8),
  error_patterns: z.array(errorPatternSchema).max(4),
  strengths: z.array(q8StrengthSchema).max(2).describe("0-2 strengths, only for features judged C1 or above_C1."),
  retry_review: retryReviewSchema.nullable(),
});

export type Q8ModelOutput = z.infer<typeof q8ModelOutputSchema>;
export type PointAssessment = z.infer<typeof pointAssessmentSchema>;
export type OwnPoint = z.infer<typeof ownPointSchema>;
export type Q8FeatureAssessment = Q8ModelOutput["features"]["grammar"];
