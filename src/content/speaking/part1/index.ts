import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { a2Part11DailyLife } from "./a2-part1-1-daily-life";
import { b1Part12Shopping } from "./b1-part1-2-shopping";

/** Part 1 tasks. Not in the main task registry yet: only the dev player page reads them. */
export const PART1_TASKS: readonly QuestionSequenceTask[] = [a2Part11DailyLife, b1Part12Shopping];

export function getPart1Task(id: string): QuestionSequenceTask | undefined {
  return PART1_TASKS.find((task) => task.id === id);
}
