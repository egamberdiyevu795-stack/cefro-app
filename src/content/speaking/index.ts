import type { SpeakingTask } from "@/domain/speaking/task";
import { b2Part2AdviceFromSomeone } from "./b2/part-2-advice-from-someone";
import { b2Part2ATradition } from "./b2/part-2-a-tradition";
import { b2Part2GoalYouSet } from "./b2/part-2-goal-you-set";
import { b2Part2HappyDay } from "./b2/part-2-happy-day";
import { b2Part2ImportantDecision } from "./b2/part-2-important-decision";
import { b2Part2TryingAndFailing } from "./b2/part-2-trying-and-failing";
import { b2Part2WorkingInATeam } from "./b2/part-2-working-in-a-team";
import { PART1_SPEAKING_TASKS } from "./part1";

/**
 * Registry of available speaking tasks.
 *
 * Content lives in code for now (reviewed via pull requests). When the
 * content library grows, this module is the single seam to replace with a
 * CMS or database-backed source — callers only use the functions below.
 */
/** In the order the task list shows them. "Advice from someone" stays first: it is the recommended first practice. */
const TASKS: readonly SpeakingTask[] = [
  b2Part2AdviceFromSomeone,
  b2Part2ImportantDecision,
  b2Part2GoalYouSet,
  b2Part2WorkingInATeam,
  b2Part2TryingAndFailing,
  b2Part2ATradition,
  b2Part2HappyDay,
];

/**
 * The tasks of the parts on the task list (Part 2). Part 1 tasks are left out until their parts are live
 * (`PART_LIVE`), so the task list, the dashboard's Practise next and the demo student never offer them.
 */
export function listSpeakingTasks(): readonly SpeakingTask[] {
  return TASKS;
}

/** Every task, Part 1 included (Part 1.1 and 1.2 open only in mock mode while their parts are not live). */
export function listAllSpeakingTasks(): readonly SpeakingTask[] {
  return [...PART1_SPEAKING_TASKS, ...TASKS];
}

export function getSpeakingTask(id: string): SpeakingTask | undefined {
  return TASKS.find((task) => task.id === id) ?? PART1_SPEAKING_TASKS.find((task) => task.id === id);
}
