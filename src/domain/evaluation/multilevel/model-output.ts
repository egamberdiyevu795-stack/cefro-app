import { z } from "zod";
import { FEATURE_LEVELS, NOT_ASSESSED, QUESTION_STATUSES } from "./levels";

/**
 * What the Multilevel evaluator model returns. It contains JUDGEMENTS AND EVIDENCE ONLY: no band, no score, no overall
 * level. The band is computed from this by `band-scoring.ts`, so the same output always gives the same band.
 *
 * Zod is the real guard: provider-side JSON-schema enforcement is a convenience (see ../schema.ts).
 */

const quotes = z
  .array(z.string())
  .max(4)
  .describe("Exact substrings copied from the transcript (the student's own words, mistakes included). Never paraphrase.");

const featureFields = {
  evidence: quotes,
  note: z.string().describe("One short sentence for the student: why this level, referring to the quotes."),
  how_to_improve: z
    .string()
    .describe("One concrete instruction for the next attempt that would move this feature towards the next level. Name the words or structure."),
  how_to_check: z.string().describe("How the student can tell, after the next attempt, that they did it."),
};

const featureAssessment = z.object({
  level: z.enum(FEATURE_LEVELS).describe("Best fit against the official descriptors: above_B2, B2, B1 or below_B1."),
  ...featureFields,
});

const pronunciationAssessment = z.object({
  level: z.enum([...FEATURE_LEVELS, NOT_ASSESSED]).describe("Always not_assessed when judging from a transcript."),
  ...featureFields,
});

export const questionAssessmentSchema = z.object({
  id: z.number().int().min(1).describe("Question number, 1-based, exactly as numbered in <task>."),
  status: z
    .enum(QUESTION_STATUSES)
    .describe(
      "on_topic: answered, with a reason, detail or example. partial: touched on but not really answered. minimal: answered in one bare sentence with no reason, detail or example. missing: not addressed. off_topic: talks about something else.",
    ),
  evidence: z.string().describe("Exact substring of the transcript where the student answers this question, or an empty string."),
  note: z.string().describe("One short sentence about what the student said for this question."),
  model_answer: z
    .string()
    .describe(
      "For partial, minimal, missing or off_topic: one or two short sentences (at most 30 words) the student could say, one level above their language level. Keep any view they gave; if they gave none, a frame with both options (should / shouldn't … because …). Empty string for on_topic.",
    ),
});

export const languageErrorSchema = z.object({
  quote: z.string().min(1).describe("Exact substring of the transcript containing the error."),
  correction: z.string().min(1).describe("The same words, corrected. Keep the student's meaning."),
  type: z.enum(["grammar", "vocabulary"]),
  pattern: z
    .string()
    .describe("The name of the error pattern in error_patterns this error belongs to (copied exactly), or an empty string for a one-off error."),
});

export const errorPatternSchema = z.object({
  name: z.string().min(1).describe("Short name of a repeated error type, e.g. 'Missing -s after he/she/it'."),
  type: z.enum(["grammar", "vocabulary"]),
  rule: z.string().min(1).describe("One sentence explaining the rule, with a short correct example."),
  how_to_fix: z.string().min(1).describe("One concrete habit for the next attempt that prevents this error."),
});

export const strengthSchema = z.object({
  feature: z.enum(["grammar", "vocabulary", "fluency", "cohesion"]),
  quote: z.string().min(1).describe("Exact substring of the transcript that shows B2-or-better language for this feature."),
  note: z.string().min(1).describe("One short sentence: what is good about it."),
});

export const retryReviewSchema = z.object({
  objectives: z.array(
    z.object({
      objective: z.string().min(1),
      outcome: z.enum(["achieved", "partly_achieved", "not_achieved"]),
      evidence: z.string().min(1),
    }),
  ),
  summary: z.string().min(1).describe("Honest comparison with the previous attempt. Never invent improvement."),
});

export const multilevelModelOutputSchema = z.object({
  questions: z.array(questionAssessmentSchema).min(1).max(6),
  features: z.object({
    grammar: featureAssessment,
    vocabulary: featureAssessment,
    fluency: featureAssessment,
    cohesion: featureAssessment,
    pronunciation: pronunciationAssessment,
  }),
  memorized_or_irrelevant: z
    .boolean()
    .describe("true only if the whole answer is clearly a memorised/prepared text that ignores the questions, or is irrelevant to the task."),
  errors: z.array(languageErrorSchema).max(8).describe("The most important grammar and vocabulary errors, most serious first."),
  error_patterns: z
    .array(errorPatternSchema)
    .max(4)
    .describe("0-4 error types that occur more than once (or one important type), most important first. Each must be used by at least one entry in errors."),
  strengths: z
    .array(strengthSchema)
    .max(2)
    .describe("0-2 strengths. Only for a feature you judged B2 or above_B2, each with an exact quote. Empty if there is none."),
  retry_review: retryReviewSchema.nullable().describe("Only for retries (see <previous_attempt>); otherwise null."),
});

export type MultilevelModelOutput = z.infer<typeof multilevelModelOutputSchema>;
export type QuestionAssessment = z.infer<typeof questionAssessmentSchema>;
export type FeatureAssessment = MultilevelModelOutput["features"]["grammar"];
export type PronunciationAssessment = MultilevelModelOutput["features"]["pronunciation"];
export type LanguageError = z.infer<typeof languageErrorSchema>;
export type ErrorPattern = z.infer<typeof errorPatternSchema>;
export type Strength = z.infer<typeof strengthSchema>;
export type RetryReview = z.infer<typeof retryReviewSchema>;

/**
 * What the audio step returns (Gemini listening to the recording). It judges intelligibility / listener strain and
 * pausing only. Accent is not an error.
 */
export const audioAssessmentSchema = z.object({
  speech_audible: z.boolean().describe("false if the recording is too unclear to judge pronunciation."),
  pronunciation: z.object({
    level: z.enum(FEATURE_LEVELS).describe("Best fit against the official pronunciation descriptors (intelligibility and listener strain only)."),
    evidence: z
      .array(z.string())
      .max(4)
      .describe("Words or short phrases, copied exactly from the transcript, that were hard to understand. Empty if none."),
    note: z.string().describe("One short sentence for the student about intelligibility. Never criticise the accent itself."),
    how_to_improve: z.string().describe("One concrete instruction for the next attempt, naming the words."),
    how_to_check: z.string().describe("How the student can tell they did it."),
  }),
  fluency: z.object({
    level: z.enum(FEATURE_LEVELS).describe("Best fit against the official fluency descriptors, judged from pausing you can hear."),
    note: z.string().describe("One short sentence for the student about pausing, false starts and reformulation."),
  }),
});

export type AudioAssessment = z.infer<typeof audioAssessmentSchema>;
