import "server-only";
import { decideDependence, measurePromptOverlap } from "@/domain/evaluation/multilevel/prompt-overlap";
import { scoreQ8Band } from "@/domain/evaluation/q8/band-scoring";
import { q8ModelOutputSchema, type Q8ModelOutput } from "@/domain/evaluation/q8/model-output";
import { deriveQ8RetryFocus, type Q8Result } from "@/domain/evaluation/q8/result";
import { ProviderError } from "@/server/errors";
import { logger } from "@/server/logging/logger";
import type { ArgumentEvaluationInput, ArgumentEvaluationModel } from "./argument-types";
import { buildQ8EvaluationPrompt, buildQ8RevisionRequest } from "./prompts/q8-evaluation";
import { applyQ8QualityGate, type Q8QualityReport, type Q8QualityViolation } from "./q8-quality-gate";

/** Version of the Part 3 evaluation (prompt, gate and post-processing). Stored with every Part 3 result. */
export const ARGUMENT_EVALUATOR_VERSION = "argument-evaluator/0.1.0";

export interface ArgumentEvaluation {
  result: Q8Result;
  evaluatorVersion: string;
  rubricVersion: string;
  provider: string;
  model: string;
  isDevelopmentProvider: boolean;
  latencyMs: number;
  modelCalls: number;
  quality: Q8QualityReport & { rejectedDrafts: Q8QualityViolation[][] };
}

const MAX_MODEL_CALLS = 2;

/**
 * Runs the Part 3 evaluation (docs/part3-plan.md):
 *   model (judgements + quotes) → schema → quality gate → (regenerate once)
 *   → prompt overlap measured in code → dependence decision (model decides; code overrides only the clear case)
 *   → deterministic band → retry goals.
 * No audio step yet: pronunciation is not assessed and the result is provisional (the audio step judges on Part 2's
 * ladder; a C1 ladder for it is left for the live run).
 */
export async function evaluateArgument(input: ArgumentEvaluationInput, model: ArgumentEvaluationModel): Promise<ArgumentEvaluation> {
  const startedAt = Date.now();
  const prompt = buildQ8EvaluationPrompt(input);
  const rejectedDrafts: Q8QualityViolation[][] = [];
  let accepted: { output: Q8ModelOutput; report: Q8QualityReport; provider: string; model: string; calls: number } | null = null;
  let lastError: ProviderError | undefined;

  for (let call = 1; call <= MAX_MODEL_CALLS && !accepted; call++) {
    const previous = rejectedDrafts.at(-1);
    const request = previous ? { system: prompt.system, user: `${prompt.user}\n\n${buildQ8RevisionRequest(previous)}` } : prompt;
    const raw = await model.evaluate(request, input);
    const parsed = q8ModelOutputSchema.safeParse(typeof raw.output === "string" ? safeJson(raw.output) : raw.output);
    if (!parsed.success) {
      const message = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      rejectedDrafts.push([{ code: "schema_invalid", severity: "reject", path: "(schema)", message }]);
      lastError = new ProviderError("evaluation_invalid_output", `Part 3 output failed schema validation: ${message}`);
      continue;
    }
    const { result, report } = applyQ8QualityGate(parsed.data, { transcript: input.transcript, audioAssessed: false });
    if (report.violations.length) {
      logger.warn("Part 3 quality gate findings", { call, violations: report.violations.map((v) => `${v.severity}:${v.code}@${v.path}`) });
    }
    if (report.passed) {
      accepted = { output: result, report, provider: raw.provider, model: raw.model, calls: call };
    } else {
      rejectedDrafts.push(report.violations.filter((v) => v.severity === "reject"));
      lastError = new ProviderError("evaluation_quality_rejected", "Part 3 evaluation rejected by the quality gate");
    }
  }
  if (!accepted) {
    const failure = lastError ?? new ProviderError("evaluation_failed", "No Part 3 evaluation produced");
    throw new ProviderError(failure.failureCode, failure.message, { details: { rejectedDrafts } });
  }

  const { output } = accepted;
  const config = input.rubric.config;
  const overlap = measurePromptOverlap(input.transcript, { statement: input.task.statement, points: input.task.points }, config.overlap);
  const decision = decideDependence(output.prompt_dependence.level, overlap, config.overlap);
  if (decision.dependence_disagreement) {
    // Flag only (decision 6): codes and numbers, never transcript text.
    logger.info("Part 3 dependence disagreement", { model: decision.model, code: decision.code, override: decision.override_applied });
  }

  const scoring = scoreQ8Band(
    {
      points: output.points,
      dependence: decision.final,
      features: {
        grammar: output.features.grammar.level,
        vocabulary: output.features.vocabulary.level,
        fluency: output.features.fluency.level,
        cohesion: output.features.cohesion.level,
        pronunciation: output.features.pronunciation.level,
      },
      memorizedOrIrrelevant: output.memorized_or_irrelevant,
    },
    config,
  );

  const result: Q8Result = {
    kind: "multilevel_q8",
    rubric_id: "multilevel-q8",
    part: 3,
    official_question: 8,
    chosen_points: [...input.chosenPoints],
    assessment: output,
    overlap: {
      token_count: overlap.token_count,
      copied_ratio: Math.round(overlap.copied_ratio * 100) / 100,
      points_read: overlap.points_read,
      points_read_ids: overlap.points_read_ids,
      novel_content_words: overlap.novel_content_words,
      named_runs: overlap.named_runs,
      copied_spans: overlap.copied_spans,
      model_dependence: decision.model,
      code_dependence: decision.code,
      final_dependence: decision.final,
      override_applied: decision.override_applied,
      dependence_disagreement: decision.dependence_disagreement,
    },
    feature_sources: { grammar: "transcript", vocabulary: "transcript", fluency: "transcript", cohesion: "transcript", pronunciation: "none" },
    audio: { status: "not_assessed", reason: "disabled", provider: null, model: null },
    scoring,
    retry_focus: deriveQ8RetryFocus(output, scoring, input.task),
  };

  return {
    result,
    evaluatorVersion: ARGUMENT_EVALUATOR_VERSION,
    rubricVersion: input.rubric.version,
    provider: accepted.provider,
    model: accepted.model,
    isDevelopmentProvider: model.isDevelopmentProvider,
    latencyMs: Date.now() - startedAt,
    modelCalls: accepted.calls,
    quality: { ...accepted.report, rejectedDrafts },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
}
