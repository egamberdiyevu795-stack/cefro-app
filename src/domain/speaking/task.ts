import type { TargetLevel } from "@/domain/cefr";

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
  title: string;
  topic: string;
  /** The main question the student must answer. */
  question: string;
  /** Points the student is expected to cover. */
  prompts: string[];
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
