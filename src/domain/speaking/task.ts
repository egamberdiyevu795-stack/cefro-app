import type { TargetLevel } from "@/domain/cefr";

/**
 * What kind of response a task asks for. It selects the evaluation approach together with `rubricId`.
 * Only "long_turn" (one topic, several questions, one extended answer: Multilevel Part 2 / official Question 7)
 * exists; new kinds are added here when their content, rubric and evaluator contract are designed, not before.
 */
export type SpeakingTaskType = "long_turn";

/**
 * A picture shown with the questions (official Part 2 shows one). It only sets the scene: the student answers the
 * questions, not the picture. Every picture must be original or freely licensed; its source and licence are stored
 * here (and so in every task snapshot) and listed in public/tasks/README.md.
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
  /** Licence name, e.g. "CC0 1.0". */
  licence: string;
  licenceUrl: string;
}

/** Identifies a rubric in the server's rubric registry (`server/evaluation/rubrics`). */
export type RubricId = "multilevel-q7";

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
