import "server-only";
import { getSpeakingTask } from "@/content/speaking";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";

/** The recommended first part: Part 2 shows the level fastest (one answer covers all five skills). */
export const RECOMMENDED_TASK_ID = "b2-part2-advice-from-someone";

/**
 * The target level the student's level is compared with, on Home and on Account (the recommended task's rubric
 * target). One place, so both pages always show the same level and target.
 */
export function levelTarget(): FeatureLevel {
  return getSpeakingRubric(getSpeakingTask(RECOMMENDED_TASK_ID)!).targetLevel as FeatureLevel;
}
