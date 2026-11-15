import type { BalancedArgumentTask, PublicArgumentTask } from "./argument-task";
import type { PublicSpeakingTask, SpeakingTask } from "./task";

/**
 * `SpeakingTask` as a union, only as far as the real attempt flow needs it (docs/part3-plan.md, "what the plan says
 * and this branch does not do yet", item 1): the attempts API, processing and the result page work on any task, and
 * narrow by `taskType`. Part 2 / Part 1 code keeps the plain `SpeakingTask`; Part 3 code keeps `BalancedArgumentTask`;
 * neither type changed, so no stored snapshot or Part 2 behaviour changes.
 */
export type AnySpeakingTask = SpeakingTask | BalancedArgumentTask;
export type PublicAnySpeakingTask = PublicSpeakingTask | PublicArgumentTask;

/** Narrow the union: a Part 3 balanced-argument task (official Question 8). */
export function isArgumentTask(task: AnySpeakingTask): task is BalancedArgumentTask;
export function isArgumentTask(task: PublicAnySpeakingTask): task is PublicArgumentTask;
export function isArgumentTask(task: { taskType: string }): boolean {
  return task.taskType === "balanced_argument";
}
