import "server-only";
import { q8RubricConfigSchema, type Q8RubricConfig } from "@/domain/evaluation/q8/rubric-config";
import type { BalancedArgumentTask } from "@/domain/speaking/argument-task";
import rawMultilevelQ8 from "./multilevel_q8.json";

/** The Part 3 rubric (official Question 8), validated at load time. */
export interface ArgumentRubric {
  id: "multilevel-q8";
  version: string;
  config: Q8RubricConfig;
}

const RUBRIC: ArgumentRubric = (() => {
  const config = q8RubricConfigSchema.parse(rawMultilevelQ8);
  return { id: config.id, version: config.version, config };
})();

/** The rubric a Part 3 task is scored against; checks the task and the rubric agree. */
export function getArgumentRubric(task: Pick<BalancedArgumentTask, "id" | "rubricId" | "level" | "part">): ArgumentRubric {
  if (task.rubricId !== RUBRIC.id) throw new Error(`Task ${task.id} refers to unknown rubric "${task.rubricId}"`);
  if (task.level !== RUBRIC.config.target_level) throw new Error(`Rubric ${RUBRIC.id} targets C1 but task ${task.id} is ${task.level}`);
  if (task.part !== RUBRIC.config.part) throw new Error(`Rubric ${RUBRIC.id} is for Part 3 but task ${task.id} is Part ${task.part}`);
  return RUBRIC;
}
