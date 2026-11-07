import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { multilevelModelOutputSchema } from "@/domain/evaluation/multilevel/model-output";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { buildAudioAssessmentPrompt } from "./prompts/multilevel-audio-assessment";
import { buildMultilevelEvaluationPrompt, buildRevisionRequest } from "./prompts/multilevel-evaluation";
import type { EvaluationInput, EvaluationPrompt } from "./types";
import { EVALUATOR_VERSION } from "./versions";

/**
 * The stored `prompt_hash` identifies everything that shapes what the model is asked, so two
 * evaluations with equal hashes were produced from the same instructions:
 *
 *  - the evaluator version,
 *  - the system prompt actually sent (methodology, feedback rules AND the task's rubric text),
 *  - the user-message template (section structure, wording, which fields of the task, metrics and
 *    previous attempt are included), rendered from a fixed sentinel input so that it does not change
 *    with each student's answer,
 *  - the revision-request template used on regeneration,
 *  - the audio-step prompt (rendered for a sentinel transcript),
 *  - the model-output schema, including the field descriptions that are sent to the model as guidance.
 *
 * Not covered, by design: the task's own wording and evaluator guidance (versioned by `task_version`),
 * and provider-specific request settings (recorded in `model_config` next to provider and model).
 *
 * Scheme history: rows written before Stage 3 hold a bare hex digest of version + system prompt only.
 * Current rows carry the "h2:" prefix, so the two schemes can never be confused or compared.
 */
export const PROMPT_HASH_SCHEME = "h2";

export interface PromptHashParts {
  evaluatorVersion: string;
  system: string;
  userTemplate: string;
  revisionTemplate: string;
  resultSchema: string;
}

export function hashPromptParts(parts: PromptHashParts): string {
  const digest = createHash("sha256")
    // JSON array: unambiguous boundaries between parts.
    .update(JSON.stringify([parts.evaluatorVersion, parts.system, parts.userTemplate, parts.revisionTemplate, parts.resultSchema]))
    .digest("hex");
  return `${PROMPT_HASH_SCHEME}:${digest}`;
}

const SENTINEL_TASK: SpeakingTask = {
  id: "sentinel-task",
  version: 1,
  level: "B2",
  part: 2,
  taskType: "long_turn",
  rubricId: "multilevel-q7",
  title: "Sentinel",
  topic: "Sentinel topic",
  question: "Sentinel question?",
  prompts: ["Sentinel question one", "Sentinel question two", "Sentinel question three"],
  // A picture, so that the template covers the picture line of <task>.
  picture: { src: "/sentinel.svg", alt: "Sentinel picture.", width: 1, height: 1, source: "Sentinel", licence: "© 2026 CEFRO. All rights reserved." },
  instructions: [],
  preparationSeconds: 60,
  speakingSeconds: 120,
  evaluatorGuidance: "Sentinel guidance.",
};

const SENTINEL_TRANSCRIPT = "Sentinel transcript with enough words so that every metric field is produced for the template.";

function sentinelInput(withPrevious: boolean, rubric: EvaluationInput["rubric"]): EvaluationInput {
  return {
    task: SENTINEL_TASK,
    rubric,
    transcript: SENTINEL_TRANSCRIPT,
    metrics: computeSpeechMetrics(SENTINEL_TRANSCRIPT, 30_000, SENTINEL_TASK.speakingSeconds),
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

/** Hash for the prompt that is about to be sent for `input` (`prompt` = what `buildMultilevelEvaluationPrompt` returned). */
export function computePromptHash(input: EvaluationInput, prompt: EvaluationPrompt): string {
  return hashPromptParts(currentPromptParts(input, prompt));
}

export function currentPromptParts(input: EvaluationInput, prompt: EvaluationPrompt): PromptHashParts {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    system: prompt.system,
    userTemplate: [
      buildMultilevelEvaluationPrompt(sentinelInput(false, input.rubric)).user,
      buildMultilevelEvaluationPrompt(sentinelInput(true, input.rubric)).user,
      // The audio step's instructions shape the result too (pronunciation, fluency level).
      buildAudioAssessmentPrompt(input.rubric.config, SENTINEL_TRANSCRIPT),
    ].join("\n=====\n"),
    revisionTemplate: buildRevisionRequest([
      { code: "schema_invalid", severity: "reject", path: "sentinel.path", message: "Sentinel message." },
    ]),
    resultSchema: JSON.stringify(z.toJSONSchema(multilevelModelOutputSchema)),
  };
}
