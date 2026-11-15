import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import type { SpeakingTask } from "@/domain/speaking/task";
import { a2Part11DailyLife } from "./a2-part1-1-daily-life";
import { b1Part12Shopping } from "./b1-part1-2-shopping";
import { PART11_BANK_ENTRY_ID, getPart11BankTask } from "./part1-1-sets";

/**
 * Part 1 tasks on the task list (1.1 then 1.2). Their parts are not live yet (`PART_LIVE`): only mock mode and the dev
 * page open them. Part 1.1 is one entry for the question bank (part1-1-sets.ts): opening it picks a weighted set.
 */
export const PART1_SPEAKING_TASKS: readonly SpeakingTask[] = [getPart11BankTask(PART11_BANK_ENTRY_ID)!, b1Part12Shopping];

/**
 * Tasks no longer offered but still opened by id: stored attempts, the demo student and the tests point at them.
 * "Daily life" was the first Part 1.1 task (own wording), replaced by the question bank on 2026-11-15.
 */
export const PART1_RETIRED_TASKS: readonly SpeakingTask[] = [a2Part11DailyLife];

/** Any Part 1 task by id: listed, retired, or a Part 1.1 set (`a2-part1-1-set-04-06-08`). */
export function findPart1SpeakingTask(id: string): SpeakingTask | undefined {
  return PART1_SPEAKING_TASKS.find((t) => t.id === id) ?? PART1_RETIRED_TASKS.find((t) => t.id === id) ?? getPart11BankTask(id);
}

/** The player's view of a Part 1 task (the dev page and the practice flow's question stepper). */
export function toQuestionSequenceTask(task: Pick<SpeakingTask, "id" | "version" | "level" | "title" | "instructions" | "delivery">): QuestionSequenceTask {
  if (!task.delivery) throw new Error(`Task ${task.id} has no question delivery`);
  return {
    id: task.id,
    version: task.version,
    part: task.level === "A2" ? "1.1" : "1.2",
    title: task.title,
    firstQuestionNumber: task.delivery.firstQuestionNumber,
    instructions: task.instructions,
    questions: task.delivery.questions,
    intro: task.delivery.intro,
    audioSource: task.delivery.audioSource,
  };
}

export const PART1_TASKS: readonly QuestionSequenceTask[] = PART1_SPEAKING_TASKS.map(toQuestionSequenceTask);

export function getPart1Task(id: string): QuestionSequenceTask | undefined {
  const listed = PART1_TASKS.find((task) => task.id === id);
  if (listed) return listed;
  const task = findPart1SpeakingTask(id);
  return task ? toQuestionSequenceTask(task) : undefined;
}
