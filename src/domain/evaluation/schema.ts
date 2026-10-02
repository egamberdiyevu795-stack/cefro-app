import { z } from "zod";
import { CEFR_LEVELS } from "@/domain/cefr";
import { SPEAKING_CRITERIA } from "./criteria";

/**
 * Speaking evaluation result — schema version 1.
 *
 * This is the contract between the AI evaluator and the rest of CEFRO.
 * AI output is validated against it before it is stored, and the UI
 * renders only what it defines.
 *
 * Evolving the schema: add a new `EvaluationResultV2` next to this one and
 * bump `EVALUATION_SCHEMA_VERSION`. Stored evaluations keep their
 * `schema_version`, so old rows can still be parsed with the old schema.
 */
export const EVALUATION_SCHEMA_VERSION = 1;

const cefrLevel = z.enum(CEFR_LEVELS);
const criterion = z.enum(SPEAKING_CRITERIA);

const criterionAssessment = z.object({
  /** False when the evidence cannot support a judgement (e.g. pronunciation from a transcript). */
  assessable: z.boolean(),
  /** 0–10 integer, or null when not assessable. */
  score: z.number().int().min(0).max(10).nullable(),
  level: cefrLevel.nullable(),
  /** Why this score, grounded in the student's actual response. */
  justification: z.string().min(1),
});

const strength = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  /** Exact words from the transcript that demonstrate the strength. */
  evidence_quote: z.string(),
});

/**
 * One weakness, explained using CEFRO's method:
 * what is the problem → why it matters → what to do → better example.
 */
const issue = z.object({
  criterion,
  severity: z.enum(["high", "medium", "low"]),
  /** What is the problem? Specific to this response. */
  problem: z.string().min(1),
  /** Exact quotes from the transcript showing the problem. */
  evidence_quotes: z.array(z.string()),
  /** Why does it matter for the quality of the answer / the exam? */
  why_it_matters: z.string().min(1),
  /** What should the student do? A practical strategy. */
  how_to_fix: z.string().min(1),
  /** A better version of something the student actually said. */
  improved_example: z.object({
    original: z.string(),
    improved: z.string().min(1),
  }),
});

/** A concrete, checkable objective for the next attempt. */
const retryFocus = z.object({
  objective: z.string().min(1),
  /** How the student can tell they achieved it. */
  success_check: z.string().min(1),
  criterion,
});

/** Present only when the attempt is a retry: did the student achieve the previous focus? */
const retryReview = z.object({
  objectives: z.array(
    z.object({
      objective: z.string().min(1),
      outcome: z.enum(["achieved", "partly_achieved", "not_achieved"]),
      evidence: z.string().min(1),
    }),
  ),
  /** Honest comparison with the previous attempt. Must not invent improvement. */
  summary: z.string().min(1),
});

export const evaluationResultV1Schema = z.object({
  overall_level: cefrLevel,
  overall_summary: z.string().min(1),
  criteria: z.object({
    fluency_coherence: criterionAssessment,
    grammar: criterionAssessment,
    vocabulary: criterionAssessment,
    pronunciation: criterionAssessment,
    task_achievement: criterionAssessment,
  }),
  strengths: z.array(strength).min(1).max(4),
  issues: z.array(issue).min(1).max(5),
  retry_focus: z.array(retryFocus).min(1).max(3),
  retry_review: retryReview.nullable(),
  /** Limits of this evaluation (short answer, unclear transcript, etc.), or null. */
  reliability_note: z.string().nullable(),
});

export type EvaluationResult = z.infer<typeof evaluationResultV1Schema>;
export type EvaluationIssue = EvaluationResult["issues"][number];
export type EvaluationStrength = EvaluationResult["strengths"][number];
export type RetryFocusItem = EvaluationResult["retry_focus"][number];
export type CriterionAssessment = EvaluationResult["criteria"]["grammar"];
