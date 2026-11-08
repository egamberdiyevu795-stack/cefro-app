import type { PartIntro } from "@/domain/speaking/question-sequence";
import type { BalancedArgumentTask } from "@/domain/speaking/argument-task";
import manifest from "./part3-intro-audio.json";

/**
 * The spoken introduction of each Part 3 topic, read in the exam style before the minute of preparation: what the
 * part is, the statement, the timings, then the sample chime. Our own wording. Pre-generated offline with the same
 * voice and settings as the Part 1 questions (scripts/make-part1-question-audio.mjs, which reads this manifest too).
 * Nothing calls a speech API at practice time.
 */
export function part3IntroText(task: Pick<BalancedArgumentTask, "statement">): string {
  return (
    "Part 3. In this part, you will see a statement, with points for it and against it. " +
    `The statement is: ${task.statement} ` +
    "You have one minute to prepare. Choose two points from each list. Then you have two minutes to speak. " +
    "Start speaking when you hear this sound."
  );
}

export function part3IntroAudioPath(task: Pick<BalancedArgumentTask, "id" | "version">): string {
  return `/audio/speaking/part3/${task.id}/v${task.version}/intro.wav`;
}

/** The topic's introduction: the text shown while it plays and its audio file. */
export function part3Intro(task: Pick<BalancedArgumentTask, "id" | "version" | "statement">): PartIntro {
  return { text: part3IntroText(task), audio: part3IntroAudioPath(task) };
}

/** The pre-generated files with the text each one speaks (checked against `part3IntroText` by the content test). */
export const PART3_INTRO_AUDIO_FILES: readonly { path: string; text: string }[] = manifest.files;
export const PART3_INTRO_VOICE = manifest.voice;
