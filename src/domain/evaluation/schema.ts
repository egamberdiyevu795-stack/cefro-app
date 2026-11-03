import { z } from "zod";
import { CEFR_LEVELS } from "@/domain/cefr";
import { SPEAKING_CRITERIA } from "./criteria";

/**
 * Speaking evaluation result schemas.
 *
 * This is the contract between the AI evaluator and the rest of CEFRO.
 * AI output is validated against the current schema before it is stored,
 * and the UI renders only what it defines.
 *
 * Version 3 (current) is the Multilevel band evaluation: ./multilevel/result.ts. Versions 1 and 2 (below) are
 * the old analytic /10-per-criterion results; they are kept only so stored attempts can still be read.
 *
 * Evolving the schema: add a new version next to the existing ones, bump
 * `EVALUATION_SCHEMA_VERSION`, and teach `parseStoredEvaluation`
 * (./stored.ts) to upgrade older rows for display. Stored evaluations keep
 * their original `schema_version` and JSON.
 *
 * Note: the Anthropic SDK turns enum/min/max constraints into description
 * hints when it builds the JSON Schema for structured outputs, so they are
 * NOT enforced by the API. Zod validation here is the real guard.
 */
export const EVALUATION_SCHEMA_VERSION = 3;

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

export type EvaluationResultV1 = z.infer<typeof evaluationResultV1Schema>;

// ── Version 2 ──────────────────────────────────────────────────────────
// Adds: evidence_basis per issue (traceability), task_coverage per task
// point, an explicit link from each retry focus to the issue it addresses,
// tighter limits (fewer, higher-value issues) and field descriptions that
// are sent to the model as guidance.

const evidenceBasis = z
  .enum(["transcript_quote", "speech_metric", "task_requirement"])
  .describe(
    "What the weakness is based on: exact words from the transcript, a number from speech_metrics, or a task point the student did not address.",
  );

const strengthV2 = z.object({
  title: z.string().min(1).describe("Short, specific label, e.g. 'Clear opinion in the first sentence'."),
  detail: z.string().min(1).describe("One sentence explaining why this helps the answer."),
  evidence_quote: z.string().describe("Exact words copied from the transcript."),
});

const issueV2 = z.object({
  criterion,
  severity: z.enum(["high", "medium", "low"]),
  evidence_basis: evidenceBasis,
  problem: z
    .string()
    .min(1)
    .describe("What exactly is wrong in THIS answer, naming the word, form or habit. Never generic."),
  evidence_quotes: z
    .array(z.string())
    .describe("Exact words copied from the transcript. Required for transcript_quote; may be empty otherwise."),
  why_it_matters: z.string().min(1).describe("One or two sentences: the effect on this answer or on the examiner."),
  how_to_fix: z.string().min(1).describe("A concrete strategy the student can apply in their next 2-minute answer."),
  improved_example: z.object({
    original: z
      .string()
      .describe("A sentence copied exactly from the transcript (empty only when the issue is about something missing)."),
    improved: z
      .string()
      .min(1)
      .describe("The same idea, corrected at a realistic B2 level. Keep the student's meaning and most of their words."),
  }),
});

const taskCoverage = z.object({
  prompt_index: z.number().int().min(0).describe("0-based index of the task point."),
  status: z.enum(["covered", "partly_covered", "not_covered"]),
  note: z.string().min(1).describe("One short sentence, referring to what the student said."),
});

const retryFocusV2 = z.object({
  objective: z.string().min(1).describe("One concrete instruction for the next attempt, tied to an issue."),
  success_check: z.string().min(1).describe("How the student can tell they did it."),
  criterion,
  addresses_issue: z.number().int().min(0).describe("0-based index into issues of the weakness this focus fixes."),
});

export const evaluationResultV2Schema = z.object({
  overall_level: cefrLevel,
  overall_summary: z.string().min(1).describe("Two sentences at most, in simple English."),
  criteria: z.object({
    fluency_coherence: criterionAssessment,
    grammar: criterionAssessment,
    vocabulary: criterionAssessment,
    pronunciation: criterionAssessment,
    task_achievement: criterionAssessment,
  }),
  task_coverage: z.array(taskCoverage),
  strengths: z.array(strengthV2).min(1).max(3),
  issues: z.array(issueV2).min(1).max(4).describe("Most important first. Usually 2-3."),
  retry_focus: z.array(retryFocusV2).min(1).max(2),
  retry_review: retryReview.nullable(),
  reliability_note: z.string().nullable(),
});

/** Legacy (schema 1–2) analytic result, read-only. */
export type LegacyEvaluationResult = z.infer<typeof evaluationResultV2Schema>;
export type LegacyRetryFocusItem = LegacyEvaluationResult["retry_focus"][number];

export { multilevelResultSchema, type MultilevelResult } from "./multilevel/result";
