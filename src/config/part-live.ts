import { examPartOf } from "@/domain/speaking/exam-part";
import { PART_LIVE } from "./features";

/**
 * Is a task's part live (`PART_LIVE`)? Only then does it have a real practice page and accept real attempts. Part 1.1
 * and 1.2 are not yet: their tasks open only in mock mode, which never uploads.
 */
export function isTaskLive(task: { part: number; level: string }): boolean {
  const part = examPartOf(task);
  return part !== null && PART_LIVE[part];
}
