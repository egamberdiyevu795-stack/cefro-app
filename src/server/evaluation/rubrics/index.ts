import "server-only";
import type { TargetLevel } from "@/domain/cefr";
import type { RubricId, SpeakingTask } from "@/domain/speaking/task";

export interface Rubric {
  /** Registry key; tasks refer to a rubric by this id. */
  id: RubricId;
  /** Persisted with each evaluation. Bump on any change to the text below. */
  version: string;
  targetLevel: TargetLevel;
  text: string;
}

/**
 * Rubric for B2 speaking (long-turn / Part 2 style tasks).
 *
 * Scores are 0–10 per criterion. The band table is shared by all criteria so
 * that numbers are comparable across criteria and across attempts.
 */
const B2_SPEAKING_RUBRIC: Rubric = {
  id: "b2-long-turn",
  version: "b2-speaking-rubric/1.0.0",
  targetLevel: "B2",
  text: `
SCORE BANDS (all criteria, integer 0–10)
- 0–1: A1 or no meaningful response
- 2–3: A2 / A2+
- 4: B1-
- 5: B1
- 6: B1+ (or B2- when close to B2)
- 7: B2
- 8: B2+
- 9: C1-/C1
- 10: C1 or above, fully effective for the task
A score of 7 means "meets the B2 target for this criterion".

CRITERIA

fluency_coherence — Fluency & coherence
- B2 (7): speaks at length with a fairly even tempo; hesitation is mostly for ideas, not words; ideas are linked with a range of connectors (however, whereas, as a result, on the other hand); the answer has a clear structure (position → reasons/examples → conclusion).
- B1 (5): keeps going but with noticeable pauses or false starts; relies on a few simple connectors (and, but, because, so); structure is a list of points rather than a developed argument.
- Evidence available: the transcript (fillers, repetitions, self-corrections, connectors, organisation) plus speaking time, words per minute and filler counts in the metrics. Do not invent hesitations that are not visible in the transcript or metrics.

grammar — Grammatical range & accuracy
- B2 (7): good control of simple and complex structures (relative clauses, conditionals, passives, modals for speculation/advice); errors occur but rarely cause misunderstanding and are often self-corrected.
- B1 (5): mostly simple sentences; complex structures attempted with frequent errors; systematic errors (agreement, tense, missing verbs) are noticeable.

vocabulary — Lexical range & accuracy
- B2 (7): sufficient range to discuss the topic precisely, including some less common topic vocabulary and collocations; can paraphrase; little repetition.
- B1 (5): enough vocabulary to express ideas on familiar topics, but general words and repetition are frequent; some word-choice errors.

pronunciation — Pronunciation
- Cannot be judged from a text transcript. Unless audio-based evidence is explicitly provided in the input, set assessable=false, score=null, level=null and explain briefly in the justification.

task_achievement — Task achievement & development
- B2 (7): answers the question directly, covers all prompts with relevant development, gives reasons and at least one specific example, and uses most of the available time.
- B1 (5): answers the question but some prompts are skipped or treated superficially; ideas are stated rather than developed; may finish well before the time limit.

OVERALL LEVEL
- Holistic judgement informed by the assessable criteria (not a mechanical average). Very short answers (under ~30% of the time or under ~60 words) cannot demonstrate B2 even if the language used is accurate — say so in the reliability note.
`.trim(),
};

const RUBRICS: Record<RubricId, Rubric> = {
  "b2-long-turn": B2_SPEAKING_RUBRIC,
};

/** The rubric a task is scored against. The rubric's own version is stored with every evaluation. */
export function getSpeakingRubric(task: Pick<SpeakingTask, "id" | "rubricId" | "level">): Rubric {
  const rubric = RUBRICS[task.rubricId];
  if (!rubric) throw new Error(`Task ${task.id} refers to unknown rubric "${task.rubricId}"`);
  if (rubric.targetLevel !== task.level) {
    throw new Error(`Rubric ${rubric.id} targets ${rubric.targetLevel} but task ${task.id} is ${task.level}`);
  }
  return rubric;
}
