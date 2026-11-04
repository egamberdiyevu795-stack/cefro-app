import "server-only";
import type { TargetLevel } from "@/domain/cefr";
import { multilevelRubricConfigSchema, type MultilevelRubricConfig } from "@/domain/evaluation/multilevel/rubric-config";
import type { RubricId, SpeakingTask } from "@/domain/speaking/task";
import rawMultilevelQ7 from "./multilevel_q7.json";

export interface Rubric {
  /** Registry key; tasks refer to a rubric by this id. */
  id: RubricId;
  /** Persisted with each evaluation. Bump (in the JSON file) on any change to the rubric. */
  version: string;
  targetLevel: TargetLevel;
  /** Official bands, descriptors and scoring caps, validated at load time. */
  config: MultilevelRubricConfig;
}

function loadRubric(id: RubricId, raw: unknown): Rubric {
  const config = multilevelRubricConfigSchema.parse(raw);
  if (config.id !== id) throw new Error(`Rubric file declares id "${config.id}" but is registered as "${id}"`);
  return { id, version: config.version, targetLevel: config.target_level, config };
}

/**
 * One rubric per exam part. Adding Part 1 or Part 3 = a new JSON file that passes `multilevelRubricConfigSchema`,
 * a new RubricId, and an entry here.
 */
const RUBRICS: Record<RubricId, Rubric> = {
  "multilevel-q7": loadRubric("multilevel-q7", rawMultilevelQ7),
};

/** The rubric a task is scored against. The rubric's own version is stored with every evaluation. */
export function getSpeakingRubric(task: Pick<SpeakingTask, "id" | "rubricId" | "level" | "part" | "prompts">): Rubric {
  const rubric = RUBRICS[task.rubricId];
  if (!rubric) throw new Error(`Task ${task.id} refers to unknown rubric "${task.rubricId}"`);
  if (rubric.targetLevel !== task.level) {
    throw new Error(`Rubric ${rubric.id} targets ${rubric.targetLevel} but task ${task.id} is ${task.level}`);
  }
  if (rubric.config.part !== task.part) throw new Error(`Rubric ${rubric.id} is for Part ${rubric.config.part} but task ${task.id} is Part ${task.part}`);
  if (rubric.config.question_count !== task.prompts.length) {
    throw new Error(`Rubric ${rubric.id} expects ${rubric.config.question_count} questions but task ${task.id} has ${task.prompts.length}`);
  }
  return rubric;
}
