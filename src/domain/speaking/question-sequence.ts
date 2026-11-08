/**
 * Content shape for parts that ask questions one after another inside one recording (Multilevel Part 1.1 and 1.2,
 * docs/part1-plan.md §1).
 *
 * Kept separate from `SpeakingTask` for now: Part 1 is built as an isolated piece and is not in the task registry yet.
 * Timings live here, in the content, never as literals in components.
 */

/** One question as it is delivered: read aloud, then a chime, then a timed speaking window. */
export interface TimedQuestion {
  /** Shown on screen while the audio plays and while the student speaks (decision 18). */
  text: string;
  /** URL of the question audio (pre-generated, stored with the content). */
  audio: string;
  /** Always 0 in Part 1. Kept so the same player can serve parts with preparation later. */
  prepSeconds: number;
  speakingSeconds: number;
  /** Part 1.2 Question 4: what makes an answer only partial (used by the evaluator later). */
  partialHint?: string;
}

/** Where the question audio comes from, so changed wording can be regenerated with the same voice (decision 16). */
export interface QuestionAudioSource {
  kind: "placeholder" | "tts" | "recorded";
  /** For "tts": the voice, its licence and where it comes from; for "recorded": the speaker. */
  voice?: string;
  /** Voice and generator settings; for placeholders, what the files are. */
  description: string;
}

/** The spoken introduction of a part (our own wording), read before Question 1 and followed by a sample chime. */
export interface PartIntro {
  /** Shown on screen while it plays. */
  text: string;
  /** URL of its pre-generated audio. */
  audio: string;
}

export interface QuestionSequenceTask {
  id: string;
  version: number;
  /** Multilevel part: "1.1" (Questions 1–3, target A2) or "1.2" (Questions 4–6, target B1). */
  part: "1.1" | "1.2";
  title: string;
  /** Official question number of the first question (1 for Part 1.1, 4 for Part 1.2). */
  firstQuestionNumber: number;
  instructions: string[];
  questions: TimedQuestion[];
  intro?: PartIntro;
  audioSource: QuestionAudioSource;
}

/** Total speaking time of a task, from its content. */
export function totalSpeakingSeconds(task: Pick<QuestionSequenceTask, "questions">): number {
  return task.questions.reduce((sum, q) => sum + q.speakingSeconds, 0);
}
