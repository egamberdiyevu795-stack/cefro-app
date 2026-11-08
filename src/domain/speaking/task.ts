import type { TargetLevel } from "@/domain/cefr";
import type { QuestionAudioSource, TimedQuestion } from "./question-sequence";

/**
 * What kind of response a task asks for. It selects the evaluation approach together with `rubricId`.
 * - "long_turn": one topic, several questions, one extended answer (Multilevel Part 2 / official Question 7).
 * - "short_answers": three familiar questions, read one after another, 30 s each (Part 1.1, Questions 1–3).
 * - "picture_questions": two pictures on one topic and three questions about them (Part 1.2, Questions 4–6).
 * A closed union: new kinds are added when their content, rubric and evaluator contract are designed, not before.
 */
export type SpeakingTaskType = "long_turn" | "short_answers" | "picture_questions";

/**
 * A picture of a Part 1.2 task (docs/part1-plan.md §1, "Pictures"). Original or freely licensed only; every field
 * is required (a unit test fails otherwise).
 */
export interface LicensedImage {
  /** Path under /public. */
  src: string;
  /** What it shows, in plain words: the alt text, and what the evaluator is told the picture shows. */
  alt: string;
  width: number;
  height: number;
  author: string;
  /** Where it comes from: the URL of a freely licensed image, or the path of CEFRO's own file. */
  sourceUrl: string;
  licence: string;
  /** When it was taken from its source (YYYY-MM-DD). */
  retrievedAt: string;
}

/**
 * Part 1 delivery (docs/part1-plan.md §1): questions read aloud one after another inside one recording. Timings live
 * here, never as literals in components or the evaluator.
 */
export interface QuestionDelivery {
  /** One per question, in the same order as `prompts` (their `text` equals the prompt). */
  questions: TimedQuestion[];
  /** Official number of the first question ("Question 4" in Part 1.2). */
  firstQuestionNumber: number;
  /** Where the question audio comes from (voice and generator settings). */
  audioSource: QuestionAudioSource;
}

/**
 * A picture shown with the questions (official Part 2 shows one). It only sets the scene: the student answers the
 * questions, not the picture. Every picture must be original CEFRO artwork or freely licensed; its source and licence
 * are stored here (and so in every task snapshot) and listed in public/tasks/README.md.
 */
export interface TaskPicture {
  /** Path under /public, e.g. "/tasks/advice-from-someone.svg". */
  src: string;
  /**
   * What the picture shows, in plain words. Used as the image's alt text AND given to the evaluator, so it can tell
   * a description of the picture from an answer to the questions. Changing it changes the evaluator input.
   */
  alt: string;
  width: number;
  height: number;
  /** Who made it / where it comes from. */
  source: string;
  /** The licence or copyright line, e.g. "© 2026 CEFRO. All rights reserved." or "CC0 1.0". */
  licence: string;
  /** Link to the licence text, for an open licence (e.g. CC0). None for CEFRO's own all-rights-reserved pictures. */
  licenceUrl?: string;
}

/** Identifies a rubric in the server's rubric registry (`server/evaluation/rubrics`). */
export type RubricId = "multilevel-q7" | "multilevel-q1-3" | "multilevel-q4-6";

/**
 * A speaking task as authored in the content layer (`src/content`).
 *
 * Content is versioned: if the wording of a task changes in a way that
 * affects assessment, bump `version` so stored attempts keep pointing at
 * the version the student actually answered.
 */
export interface SpeakingTask {
  /** Stable, URL-safe identifier. Never reuse an id for different content. */
  id: string;
  version: number;
  level: TargetLevel;
  /** Speaking part number within the exam format. */
  part: number;
  taskType: SpeakingTaskType;
  /**
   * The rubric the evaluator scores this task against. Chosen by the task, not derived from the level,
   * so two parts of the same level can have different rubrics.
   */
  rubricId: RubricId;
  title: string;
  topic: string;
  /** The topic introduction shown above the questions. */
  question: string;
  /**
   * The questions the student must answer, in order. Shown and referred to as "Question 1", "Question 2", … (1-based)
   * everywhere: in the UI, in the evaluator prompt and in stored results.
   */
  prompts: string[];
  /** Optional picture shown beside the questions on every screen (brief, preparation, recording, retry). */
  picture?: TaskPicture;
  /** Part 1.2: the two pictures, on screen from Question 4 to the end of Question 6. */
  images?: LicensedImage[];
  /** Part 1: the questions are read aloud and timed one by one inside one recording. */
  delivery?: QuestionDelivery;
  /** Student-facing instructions, shown before preparation. */
  instructions: string[];
  preparationSeconds: number;
  speakingSeconds: number;
  /**
   * Guidance for the evaluator only (what a strong answer contains,
   * common pitfalls). Never sent to the browser — see `toPublicTask`.
   */
  evaluatorGuidance: string;
}

/** The subset of a task that is safe and useful to send to the client. */
export type PublicSpeakingTask = Omit<SpeakingTask, "evaluatorGuidance">;

export function toPublicTask(task: SpeakingTask): PublicSpeakingTask {
  // Explicit destructuring so new private fields are excluded deliberately.
  const { evaluatorGuidance: _omit, ...publicTask } = task;
  void _omit;
  return publicTask;
}

/** The number a question is shown with ("Question 4" for the first question of Part 1.2). `index` is 0-based. */
export function questionNumber(task: Pick<SpeakingTask, "delivery">, index: number): number {
  return (task.delivery?.firstQuestionNumber ?? 1) + index;
}
