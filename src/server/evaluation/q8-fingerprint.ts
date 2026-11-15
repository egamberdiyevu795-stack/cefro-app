import "server-only";
import { z } from "zod";
import { q8ProviderOutputSchema } from "@/domain/evaluation/q8/model-output";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { BalancedArgumentTask } from "@/domain/speaking/argument-task";
import { ARGUMENT_INSTRUCTIONS } from "@/domain/speaking/argument-task";
import type { ArgumentEvaluationInput } from "./argument-types";
import { hashPromptParts, type PromptHashParts } from "./prompt-fingerprint";
import { ARGUMENT_EVALUATOR_VERSION } from "./versions";
import { buildQ8EvaluationPrompt, buildQ8RevisionRequest } from "./prompts/q8-evaluation";
import type { EvaluationPrompt } from "./types";

/**
 * The Part 3 prompt fingerprint: the same contract as Part 2's (`prompt-fingerprint.ts`, scheme "h2"), with the Part 3
 * evaluator version, prompt, revision template and result schema. Two stored Part 3 evaluations with equal hashes were
 * produced from the same instructions. The user-message template is rendered from a fixed sentinel input, so the hash
 * never depends on the student's answer; the task's own wording is versioned by `task_version`, as in Part 2.
 */

const SENTINEL_TASK: BalancedArgumentTask = {
  id: "sentinel-part3-task",
  version: 1,
  level: "C1",
  part: 3,
  taskType: "balanced_argument",
  rubricId: "multilevel-q8",
  title: "Sentinel",
  topic: "Sentinel topic",
  statement: "Sentinel statement.",
  points: [
    { id: "F1", side: "for", text: "Sentinel for one" },
    { id: "F2", side: "for", text: "Sentinel for two" },
    { id: "F3", side: "for", text: "Sentinel for three" },
    { id: "A1", side: "against", text: "Sentinel against one" },
    { id: "A2", side: "against", text: "Sentinel against two" },
    { id: "A3", side: "against", text: "Sentinel against three" },
  ],
  instructions: ARGUMENT_INSTRUCTIONS,
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: "Sentinel guidance.",
};

const SENTINEL_TRANSCRIPT = "Sentinel transcript with enough words so that every metric field is produced for the template.";

function sentinelInput(withPrevious: boolean, rubric: ArgumentEvaluationInput["rubric"]): ArgumentEvaluationInput {
  return {
    task: SENTINEL_TASK,
    rubric,
    transcript: SENTINEL_TRANSCRIPT,
    metrics: computeSpeechMetrics(SENTINEL_TRANSCRIPT, 30_000, SENTINEL_TASK.speakingSeconds),
    chosenPoints: ["F1", "F2", "A1", "A2"],
    audio: { storageProvider: "x", storageKey: "x", mimeType: "audio/webm", durationMs: 30_000 },
    previousAttempt: withPrevious
      ? {
          attemptNumber: 1,
          transcript: "Sentinel previous transcript.",
          retryFocus: [{ objective: "Sentinel objective.", success_check: "Sentinel check." }],
        }
      : null,
  };
}

/** The JSON Schema the providers are asked for (also pinned byte-for-byte by test/fixtures/q8-model-output-schema.json). */
export function q8ProviderSchemaJson(): string {
  return JSON.stringify(z.toJSONSchema(q8ProviderOutputSchema));
}

/** Hash for the Part 3 prompt that is about to be sent for `input` (`prompt` = what `buildQ8EvaluationPrompt` returned). */
export function computeQ8PromptHash(input: ArgumentEvaluationInput, prompt: EvaluationPrompt): string {
  return hashPromptParts(currentQ8PromptParts(input, prompt));
}

export function currentQ8PromptParts(input: ArgumentEvaluationInput, prompt: EvaluationPrompt): PromptHashParts {
  return {
    evaluatorVersion: ARGUMENT_EVALUATOR_VERSION,
    system: prompt.system,
    userTemplate: [
      buildQ8EvaluationPrompt(sentinelInput(false, input.rubric)).user,
      buildQ8EvaluationPrompt(sentinelInput(true, input.rubric)).user,
      // Part 3 has no audio step yet: when one is added, its prompt joins this template (as in Part 2's fingerprint).
    ].join("\n=====\n"),
    revisionTemplate: buildQ8RevisionRequest([
      { code: "schema_invalid", severity: "reject", path: "sentinel.path", message: "Sentinel message." },
    ]),
    resultSchema: q8ProviderSchemaJson(),
  };
}
