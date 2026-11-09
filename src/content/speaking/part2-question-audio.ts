import type { SpeakingTask } from "@/domain/speaking/task";
import manifest from "./part2-question-audio.json";

/**
 * The examiner reads every Part 2 task's questions aloud, as in the exam: the spoken introduction, the chime, then the
 * text on the task screen read out (the task line and its three questions), and only then the minute of preparation.
 *
 * One file per task version: `/audio/speaking/part2/<task id>/v<version>/questions.wav`. Pre-generated offline with
 * the same voice and settings as the Part 1 questions and the introductions (scripts/make-part1-question-audio.mjs,
 * which reads this manifest too). A unit test checks that each file speaks the task's current wording, so changing a
 * question fails the tests until its audio is made again. Nothing calls a speech API at practice time.
 */

/** What the examiner reads: the task line without "Answer the three questions below." (a pointer to the screen), then the questions. */
export function part2SpokenQuestions(task: Pick<SpeakingTask, "question" | "prompts">): string {
  const line = task.question.replace(/\s*Answer the three questions below\.$/, "").trim();
  return [line, ...task.prompts].join(" ");
}

export function part2QuestionAudioPath(task: Pick<SpeakingTask, "id" | "version">): string {
  return `/audio/speaking/part2/${task.id}/v${task.version}/questions.wav`;
}

export const PART2_QUESTION_AUDIO_FILES: readonly { path: string; text: string }[] = manifest.files;
export const PART2_QUESTION_AUDIO_VOICE = manifest.voice;
