import type { SpeakingTask } from "@/domain/speaking/task";
import { b2Part2TechnologyYoungPeople } from "./b2/part-2-technology-young-people";

/**
 * Registry of available speaking tasks.
 *
 * Content lives in code for now (reviewed via pull requests). When the
 * content library grows, this module is the single seam to replace with a
 * CMS or database-backed source — callers only use the functions below.
 */
const TASKS: readonly SpeakingTask[] = [b2Part2TechnologyYoungPeople];

export function listSpeakingTasks(): readonly SpeakingTask[] {
  return TASKS;
}

export function getSpeakingTask(id: string): SpeakingTask | undefined {
  return TASKS.find((task) => task.id === id);
}
