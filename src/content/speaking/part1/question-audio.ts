import type { QuestionAudioSource } from "@/domain/speaking/question-sequence";
import manifest from "./question-audio.json";

/**
 * Where every Part 1 question's audio comes from (decision 16): pre-generated text-to-speech, one voice for every
 * task, made by scripts/make-part1-question-audio.mjs from question-audio.json (texts, paths, voice and settings).
 * The start-of-speaking chime is not a file: it is the same two tones as Part 2, made in code (lib/chime.ts).
 */
export const PART1_QUESTION_AUDIO: QuestionAudioSource = {
  kind: "tts",
  voice: `${manifest.voice.engine}; voice ${manifest.voice.model}, speaker ${manifest.voice.speaker}. ${manifest.voice.modelLicence}.`,
  description:
    `Pre-generated with scripts/make-part1-question-audio.mjs (length scale ${manifest.voice.lengthScale}, ` +
    `tempo ${manifest.voice.tempo}). Changed wording is regenerated with the same voice and settings.`,
};

/** Folder of a task version's question audio under /public. */
export function part1AudioDir(taskId: string, version: number): string {
  return `/audio/speaking/part1/${taskId}/v${version}`;
}

/** The pre-generated files with the text each one speaks. */
export const PART1_AUDIO_FILES: readonly { path: string; text: string }[] = manifest.files;
