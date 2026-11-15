import { getAnySpeakingTask } from "@/content/speaking";
import { toQuestionSequenceTask } from "@/content/speaking/part1";
import { PART3_INTRO } from "@/content/speaking/part-intro-audio";
import { isArgumentTask } from "@/domain/speaking/any-task";
import { toPublicArgumentTask, type PublicArgumentTask } from "@/domain/speaking/argument-task";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import type { PartIntro, QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { toPublicTask, type PublicSpeakingTask } from "@/domain/speaking/task";

/**
 * Everything the browser needs to play one part of a mock: the PUBLIC task (no evaluator guidance), plus what that part's
 * player takes. Built on the server from a task id, so only the four chosen tasks reach the browser.
 */
export type MockPartPlan =
  | { part: "1.1" | "1.2"; kind: "sequence"; task: PublicSpeakingTask; sequence: QuestionSequenceTask }
  | { part: "2"; kind: "speaking"; task: PublicSpeakingTask }
  | { part: "3"; kind: "argument"; task: PublicArgumentTask; intro: PartIntro };

export function buildPartPlan(part: ExamPartId, taskId: string): MockPartPlan | null {
  const task = getAnySpeakingTask(taskId);
  if (!task) return null;
  if (isArgumentTask(task)) return part === "3" ? { part, kind: "argument", task: toPublicArgumentTask(task), intro: PART3_INTRO } : null;
  if (part === "3") return null;
  if (task.delivery) return part === "1.1" || part === "1.2" ? { part, kind: "sequence", task: toPublicTask(task), sequence: toQuestionSequenceTask(task) } : null;
  return part === "2" ? { part, kind: "speaking", task: toPublicTask(task) } : null;
}

/** The plans for `ids`, in the order of `parts`; a part with no task is left out (the page then has nothing to play). */
export function buildMockPlan(parts: readonly ExamPartId[], ids: Partial<Record<ExamPartId, string>>): MockPartPlan[] {
  return parts.flatMap((part) => {
    const id = ids[part];
    const plan = id ? buildPartPlan(part, id) : null;
    return plan ? [plan] : [];
  });
}
