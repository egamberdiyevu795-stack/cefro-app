import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import type { SpeakingTask } from "@/domain/speaking/task";
import { a2Part11DailyLife } from "./a2-part1-1-daily-life";
import { b1Part12Shopping } from "./b1-part1-2-shopping";

/** Part 1 tasks (1.1 then 1.2). Their parts are not live yet (`PART_LIVE`): only mock mode and the dev page open them. */
export const PART1_SPEAKING_TASKS: readonly SpeakingTask[] = [a2Part11DailyLife, b1Part12Shopping];

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
    chime: task.delivery.chime,
    audioSource: task.delivery.audioSource,
  };
}

export const PART1_TASKS: readonly QuestionSequenceTask[] = PART1_SPEAKING_TASKS.map(toQuestionSequenceTask);

export function getPart1Task(id: string): QuestionSequenceTask | undefined {
  return PART1_TASKS.find((task) => task.id === id);
}
