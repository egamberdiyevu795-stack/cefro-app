import "server-only";
import { evaluationResultSchema, type EvaluationResult } from "@/domain/evaluation/schema";
import { ProviderError } from "@/server/errors";
import { logger } from "@/server/logging/logger";
import { buildRevisionRequest, buildSpeakingEvaluationPrompt } from "./prompts/speaking-evaluation-v2";
import { computePromptHash } from "./prompt-fingerprint";
import { applyQualityGate, type QualityReport, type QualityViolation } from "./quality-gate";
import type { EvaluationInput, EvaluationModel } from "./types";
import { EVALUATION_SCHEMA_VERSION, EVALUATOR_VERSION } from "./versions";

export interface SpeakingEvaluation {
  result: EvaluationResult;
  evaluatorVersion: string;
  rubricVersion: string;
  schemaVersion: number;
  promptHash: string;
  provider: string;
  model: string;
  modelConfig: Record<string, string | number | boolean>;
  isDevelopmentProvider: boolean;
  latencyMs: number;
  /** 1 normally; 2 when the first draft was invalid or rejected by the quality gate. */
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Quality gate outcome for the accepted draft, plus why earlier drafts were rejected. */
  quality: QualityReport & { rejectedDrafts: QualityViolation[][] };
}

/** One draft, plus one controlled regeneration if it is invalid or fails the quality gate. */
const MAX_MODEL_CALLS = 2;

/** A regeneration is not started with less than this left of the processing budget (live calls took 8-32 s). */
const MIN_TIME_FOR_REGENERATION_MS = 40_000;

/**
 * Runs the speaking evaluation methodology:
 * build prompt → call model → validate schema → quality gate → (regenerate once) → attach versions.
 * Throws ProviderError when no acceptable evaluation could be produced.
 */
export async function evaluateSpeaking(
  input: EvaluationInput,
  model: EvaluationModel,
  options: { deadlineAt?: number } = {},
): Promise<SpeakingEvaluation> {
  const prompt = buildSpeakingEvaluationPrompt(input);
  const promptHash = computePromptHash(input, prompt);
  const startedAt = Date.now();
  const rejectedDrafts: QualityViolation[][] = [];
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let lastError: ProviderError | undefined;

  for (let call = 1; call <= MAX_MODEL_CALLS; call++) {
    // Never start a regeneration that cannot finish inside the caller's processing budget.
    if (call > 1 && options.deadlineAt !== undefined && options.deadlineAt - Date.now() < MIN_TIME_FOR_REGENERATION_MS) {
      logger.warn("Skipping regeneration: processing budget nearly used up", { call });
      break;
    }
    const previousRejection = rejectedDrafts.at(-1);
    const request = previousRejection
      ? { system: prompt.system, user: `${prompt.user}\n\n${buildRevisionRequest(previousRejection)}` }
      : prompt;

    // Provider failures (timeouts, rate limits, refusals…) are not retried here;
    // the SDK already retries transient HTTP errors.
    let raw;
    try {
      raw = await model.evaluate(request, input);
    } catch (error) {
      // A provider that reports unusable output (empty, truncated) gets the same one
      // regeneration as invalid JSON. Every other failure (timeout, auth, rate limit,
      // refusal) is not retried here.
      if (error instanceof ProviderError && error.failureCode === "evaluation_invalid_output") {
        lastError = error;
        rejectedDrafts.push([{ code: "schema_invalid", severity: "reject", path: "(response)", message: error.message }]);
        logger.warn("Evaluation draft unusable", { call, reason: error.message });
        continue;
      }
      throw error;
    }
    inputTokens = sumNullable(inputTokens, raw.inputTokens);
    outputTokens = sumNullable(outputTokens, raw.outputTokens);

    let validated: EvaluationResult;
    try {
      validated = validateEvaluationOutput(raw.output);
    } catch (error) {
      lastError = error as ProviderError;
      rejectedDrafts.push([{ code: "schema_invalid", severity: "reject", path: "(schema)", message: lastError.message }]);
      logger.warn("Evaluation draft failed schema validation", { call, reason: lastError.message });
      continue;
    }

    const { result, report } = applyQualityGate(validated, {
      transcript: input.transcript,
      taskPromptCount: input.task.prompts.length,
      hasPreviousAttempt: input.previousAttempt !== null,
      metrics: { speakingSeconds: input.metrics.speakingSeconds, wordCount: input.metrics.wordCount },
    });
    logQualityReport(report, call);

    if (report.passed) {
      return {
        result: normalise(result),
        evaluatorVersion: EVALUATOR_VERSION,
        rubricVersion: input.rubric.version,
        schemaVersion: EVALUATION_SCHEMA_VERSION,
        promptHash,
        provider: raw.provider,
        model: raw.model,
        modelConfig: model.config,
        isDevelopmentProvider: model.isDevelopmentProvider,
        latencyMs: Date.now() - startedAt,
        modelCalls: call,
        inputTokens,
        outputTokens,
        quality: { ...report, rejectedDrafts },
      };
    }

    rejectedDrafts.push(report.violations.filter((v) => v.severity === "reject"));
    lastError = new ProviderError(
      "evaluation_quality_rejected",
      `Evaluation rejected by quality gate: ${rejectedDrafts.at(-1)!.map((v) => v.code).join(", ")}`,
    );
  }

  // Attach what was rejected, so a failed evaluation can still be reviewed by developers.
  const failure = lastError ?? new ProviderError("evaluation_failed", "No evaluation produced");
  throw new ProviderError(failure.failureCode, failure.message, {
    cause: failure.cause,
    retryable: failure.retryable,
    details: { rejectedDrafts },
  });
}

/** Parse and validate unknown model output (object or JSON string) against the current schema. */
export function validateEvaluationOutput(output: unknown): EvaluationResult {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(stripCodeFence(value));
    } catch (error) {
      throw new ProviderError("evaluation_invalid_output", "Evaluation output is not valid JSON", { cause: error });
    }
  }
  const parsed = evaluationResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderError(
      "evaluation_invalid_output",
      `Evaluation output failed schema validation: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Some models wrap JSON in a markdown fence even when told not to. */
function stripCodeFence(text: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}

/** Transcript-only evaluation: non-assessable criteria (always pronunciation) carry no score. */
function normalise(result: EvaluationResult): EvaluationResult {
  const criteria = { ...result.criteria };
  for (const key of Object.keys(criteria) as (keyof typeof criteria)[]) {
    const c = criteria[key];
    if (key === "pronunciation" || !c.assessable || c.score === null) {
      criteria[key] = { ...c, assessable: false, score: null, level: null };
    }
  }
  return { ...result, criteria };
}

function logQualityReport(report: QualityReport, call: number) {
  if (report.violations.length === 0) return;
  // Codes and paths only — never transcript text.
  logger.warn("Evaluation quality gate findings", {
    call,
    passed: report.passed,
    violations: report.violations.map((v) => `${v.severity}:${v.code}@${v.path}`),
  });
}

function sumNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}
