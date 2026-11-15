import type { PartIntro } from "@/domain/speaking/question-sequence";
import manifest from "./part-intro-audio.json";

/**
 * The spoken introductions of Part 2 and Part 3, as in the exam: a screen with only the part's name and what happens
 * in it, read aloud, then the chime, then the task with its one-minute countdown. Our own wording (the official
 * introductions are a reference for the format only). One introduction per part, the same for every task.
 *
 * Pre-generated offline with the same voice and settings as the Part 1 questions (scripts/make-part1-question-audio.mjs,
 * which reads this manifest too). Nothing calls a speech API at practice time.
 */
function intro(part: 2 | 3): PartIntro {
  const file = manifest.files.find((f) => f.path.startsWith(`/audio/speaking/part${part}/intro/`));
  if (!file) throw new Error(`No introduction for Part ${part}`);
  return { text: file.text, audio: file.path };
}

export const PART2_INTRO: PartIntro = intro(2);
export const PART3_INTRO: PartIntro = intro(3);

/** The introduction's text without its leading "Part n." (the screen shows the part as a heading). */
export function introBody(text: string): string {
  return text.replace(/^Part \d(\.\d)?\.\s*/, "");
}

export const PART_INTRO_AUDIO_FILES: readonly { path: string; text: string }[] = manifest.files;
export const PART_INTRO_VOICE = manifest.voice;
