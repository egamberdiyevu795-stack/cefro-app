import "server-only";
import { scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { contentWords, tokenizeWords } from "@/domain/speaking/metrics";
import { isOnTopic, type Feature } from "@/domain/evaluation/multilevel/levels";
import { multilevelModelOutputSchema, type MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { deriveRetryFocus, featureLevels, type FeatureSource, type MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { ProviderError } from "@/server/errors";
import { logger } from "@/server/logging/logger";
import { runAudioAssessment, type AudioOutcome } from "./audio-assessment";
import { buildMultilevelEvaluationPrompt, buildRevisionRequest } from "./prompts/multilevel-evaluation";
import { computePromptHash } from "./prompt-fingerprint";
import { applyQualityGate, type QualityReport, type QualityViolation } from "./quality-gate";
import type { AudioAssessor, EvaluationInput, EvaluationModel } from "./types";
import { EVALUATION_SCHEMA_VERSION, EVALUATOR_VERSION } from "./versions";

export interface SpeakingEvaluation {
  result: MultilevelResult;
  evaluatorVersion: string;
  rubricVersion: string;
  schemaVersion: number;
  promptHash: string;
  provider: string;
  model: string;
  modelConfig: Record<string, string | number | boolean>;
  isDevelopmentProvider: boolean;
  latencyMs: number;
  /** Calls to the transcript evaluator: 1 normally; 2 when the first draft was invalid or rejected by the quality gate. */
  modelCalls: number;
  /** Transcript evaluator plus audio step. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** Quality gate outcome for the accepted draft, plus why earlier drafts were rejected. */
  quality: QualityReport & { rejectedDrafts: QualityViolation[][] };
}

/** One draft, plus one controlled regeneration if it is invalid or fails the quality gate. */
const MAX_MODEL_CALLS = 2;

/** A regeneration is not started with less than this left of the processing budget (live calls took 8-32 s). */
const MIN_TIME_FOR_REGENERATION_MS = 40_000;

export interface EvaluateOptions {
  deadlineAt?: number;
  /** The audio step; null/undefined = switched off (pronunciation not assessed, result provisional). */
  audioAssessor?: AudioAssessor | null;
  /** The recording, for the audio step. */
  audio?: Buffer | null;
}

/**
 * Runs the Multilevel evaluation:
 *   transcript evaluator (judgements + evidence) → schema → quality gate → (regenerate once)
 *   ∥ audio step (pronunciation, pausing)
 *   → merge → deterministic band → retry focus → attach versions.
 * Throws ProviderError when the transcript evaluator produced no acceptable output. The audio step never fails the run.
 */
export async function evaluateSpeaking(input: EvaluationInput, model: EvaluationModel, options: EvaluateOptions = {}): Promise<SpeakingEvaluation> {
  const startedAt = Date.now();
  let audioMs = 0;
  const audioStartedAt = Date.now();
  const audioPromise = runAudioAssessment({
    assessor: options.audioAssessor ?? null,
    audio: options.audio ?? null,
    mimeType: input.audio.mimeType,
    transcript: input.transcript,
    config: input.rubric.config,
  }).then((outcome) => {
    audioMs = Date.now() - audioStartedAt;
    return outcome;
  });
  const text = await evaluateTranscript(input, model, options.deadlineAt);
  const textMs = Date.now() - startedAt;
  const audio = await audioPromise;

  const assessment = mergeAudio(text.output, audio);
  const sources = featureSources(audio);
  const scoring = scoreBand(
    {
      questions: assessment.questions,
      features: featureLevels(assessment),
      memorizedOrIrrelevant: assessment.memorized_or_irrelevant,
      // Everything spoken counts towards the minimum, hesitation sounds included (owner decision: a hesitant but
      // real attempt is still a ratable sample; its fluency is judged separately).
      wordCount: tokenizeWords(input.transcript).length,
      // Part 1.2's floor: counted by code from the verified evidence of the questions that count, not by the model.
      relevantWordCount: relevantWordCount(assessment),
    },
    input.rubric.config,
  );
  const result: MultilevelResult = {
    kind: "multilevel",
    rubric_id: input.rubric.id,
    part: input.rubric.config.part,
    official_question: input.rubric.config.official_question,
    assessment,
    feature_sources: Object.fromEntries(input.rubric.config.features.map((f) => [f, sources[f]])) as Partial<Record<Feature, FeatureSource>>,
    audio:
      audio.status === "assessed"
        ? { status: "assessed", reason: null, provider: audio.provider, model: audio.model }
        : { status: "not_assessed", reason: audio.reason, provider: audio.provider, model: audio.model },
    scoring,
    retry_focus: deriveRetryFocus(assessment, scoring, input.task.prompts, {
      firstQuestionNumber: input.rubric.config.first_question_number,
      partialHints: input.task.delivery?.questions.map((q) => q.partialHint),
    }),
  };

  const audioTokens = audio.status === "assessed" ? { input: audio.inputTokens, output: audio.outputTokens } : { input: null, output: null };
  return {
    result,
    evaluatorVersion: EVALUATOR_VERSION,
    rubricVersion: input.rubric.version,
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    promptHash: text.promptHash,
    provider: text.provider,
    model: text.model,
    modelConfig: {
      ...model.config,
      audioAssessment: audio.status === "assessed" ? `${audio.provider}:${audio.model}` : `off:${audio.reason}`,
      // Where the evaluation's time went (the two run side by side): the transcript evaluator and the audio step.
      textMs,
      audioMs,
    },
    isDevelopmentProvider: model.isDevelopmentProvider,
    latencyMs: Date.now() - startedAt,
    modelCalls: text.modelCalls,
    inputTokens: sumNullable(text.inputTokens, audioTokens.input),
    outputTokens: sumNullable(text.outputTokens, audioTokens.output),
    quality: text.quality,
  };
}

async function evaluateTranscript(input: EvaluationInput, model: EvaluationModel, deadlineAt: number | undefined) {
  const prompt = buildMultilevelEvaluationPrompt(input);
  const promptHash = computePromptHash(input, prompt);
  const rejectedDrafts: QualityViolation[][] = [];
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let lastError: ProviderError | undefined;

  for (let call = 1; call <= MAX_MODEL_CALLS; call++) {
    // Never start a regeneration that cannot finish inside the caller's processing budget.
    if (call > 1 && deadlineAt !== undefined && deadlineAt - Date.now() < MIN_TIME_FOR_REGENERATION_MS) {
      logger.warn("Skipping regeneration: processing budget nearly used up", { call });
      break;
    }
    const previousRejection = rejectedDrafts.at(-1);
    const request = previousRejection
      ? { system: prompt.system, user: `${prompt.user}\n\n${buildRevisionRequest(previousRejection)}` }
      : prompt;

    let raw;
    try {
      raw = await model.evaluate(request, input);
    } catch (error) {
      // A provider that reports unusable output (empty, truncated) gets the same one regeneration as invalid JSON.
      // Every other failure (timeout, auth, rate limit, refusal) is not retried here.
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

    let validated: MultilevelModelOutput;
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
      questionCount: input.rubric.config.question_count,
      rubric: input.rubric.config,
      hasPreviousAttempt: input.previousAttempt !== null,
      metrics: { speakingSeconds: input.metrics.speakingSeconds, wordCount: input.metrics.wordCount },
    });
    logQualityReport(report, call);

    if (report.passed) {
      return {
        output: result,
        promptHash,
        provider: raw.provider,
        model: raw.model,
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

/**
 * Pronunciation comes only from the audio step. Fluency: the transcript shows false starts and fillers, the audio
 * shows the pauses themselves, so when the audio step ran its level is used, with its note; the transcript quotes stay
 * as evidence.
 */
export function mergeAudio(output: MultilevelModelOutput, audio: AudioOutcome): MultilevelModelOutput {
  if (audio.status !== "assessed") return output;
  const { pronunciation, fluency } = audio.assessment;
  return {
    ...output,
    features: {
      ...output.features,
      pronunciation: { ...pronunciation },
      fluency: { ...output.features.fluency, level: fluency.level, note: fluency.note || output.features.fluency.note },
    },
  };
}

/**
 * Relevant words: the words inside the (verified, exact) evidence quotes of the questions that count as on topic,
 * hesitation sounds excluded (docs/part1-plan.md §2, Part 1.2's min_relevant_words).
 */
export function relevantWordCount(assessment: Pick<MultilevelModelOutput, "questions">): number {
  return assessment.questions.filter((q) => isOnTopic(q.status)).reduce((sum, q) => sum + contentWords(q.evidence).length, 0);
}

function featureSources(audio: AudioOutcome): Record<Feature, FeatureSource> {
  const assessed = audio.status === "assessed";
  return {
    grammar: "transcript",
    vocabulary: "transcript",
    cohesion: "transcript",
    fluency: assessed ? "transcript+audio" : "transcript",
    pronunciation: assessed ? "audio" : "none",
  };
}

/** Parse and validate unknown model output (object or JSON string) against the model-output schema. */
export function validateEvaluationOutput(output: unknown): MultilevelModelOutput {
  let value = output;
  if (typeof value === "string") {
    try {
      value = JSON.parse(stripCodeFence(value));
    } catch (error) {
      throw new ProviderError("evaluation_invalid_output", "Evaluation output is not valid JSON", { cause: error });
    }
  }
  const parsed = multilevelModelOutputSchema.safeParse(value);
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
