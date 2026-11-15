import type { TargetLevel } from "@/domain/cefr";

/**
 * Multilevel Part 3 (official Question 8): a balanced argument (docs/part3-plan.md, section 1).
 *
 * A topic statement, a FOR list of 3 points and an AGAINST list of 3 points. The student chooses two points from each
 * list and argues both sides: 1 minute preparation, 2 minutes speaking, target C1, band 0–6.
 *
 * Kept as its own type next to `SpeakingTask` (Part 2) instead of turning `SpeakingTask` into a union, so no Part 2
 * code or stored Part 2 snapshot changes while Part 3 is not live (`PART_LIVE["3"]`).
 */

export const POINT_IDS = ["F1", "F2", "F3", "A1", "A2", "A3"] as const;
/** "F1".."F3" for FOR, "A1".."A3" for AGAINST. Stable: used in the prompt, the model output and stored results. */
export type PointId = (typeof POINT_IDS)[number];
export type Side = "for" | "against";

/** What the student sees, as in the real exam (owner, 2026-11-15). Code and the model keep "for" / "against". */
export const SIDE_LABELS: Record<Side, string> = { for: "Pros", against: "Cons" };

export interface ArgumentPoint {
  id: PointId;
  side: Side;
  /** A short phrase, not a sentence (as in the official task). */
  text: string;
}

export interface BalancedArgumentTask {
  /** Stable, URL-safe identifier. Never reuse an id for different content. */
  id: string;
  version: number;
  level: TargetLevel;
  part: 3;
  taskType: "balanced_argument";
  rubricId: "multilevel-q8";
  title: string;
  topic: string;
  /** The topic statement, e.g. "Cities should ban private cars from their centres." */
  statement: string;
  /** Exactly F1–F3 (FOR) and A1–A3 (AGAINST), in that order. Checked by `argumentTaskProblems`. */
  points: readonly ArgumentPoint[];
  /** Student-facing instructions, shown on the brief. */
  instructions: string[];
  preparationSeconds: number;
  speakingSeconds: number;
  /** For the evaluator only: what "addressing" and "developing" each point looks like. Never sent to the browser. */
  evaluatorGuidance: string;
}

export type PublicArgumentTask = Omit<BalancedArgumentTask, "evaluatorGuidance">;

export function toPublicArgumentTask(task: BalancedArgumentTask): PublicArgumentTask {
  const { evaluatorGuidance: _omit, ...publicTask } = task;
  void _omit;
  return publicTask;
}

export function sideOf(id: PointId): Side {
  return id.startsWith("F") ? "for" : "against";
}

export function pointsOn(task: Pick<BalancedArgumentTask, "points">, side: Side): readonly ArgumentPoint[] {
  return task.points.filter((p) => p.side === side);
}

export function pointById(task: Pick<BalancedArgumentTask, "points">, id: PointId): ArgumentPoint {
  const point = task.points.find((p) => p.id === id);
  if (!point) throw new Error(`No point ${id}`);
  return point;
}

/** The student instructions (plan section 1), the same for every topic. */
export const ARGUMENT_INSTRUCTIONS = [
  "You have 1 minute to prepare. You may make notes.",
  "Talk about two points from the Pros and two from the Cons.",
  "Speak for up to 2 minutes. Explain each point in your own words with a reason or an example.",
  "Don't read the points out: the list is a prompt, not your answer.",
];

/** How many points a student chooses on each side. */
export const POINTS_PER_SIDE = 2;

/**
 * The points a student ticked, as an upload sends them: unique known ids, at most two per side, normalised to list
 * order. Null for anything else (the attempt is still accepted: the choice is feedback only, the evaluator judges
 * what was said).
 */
export function validChosenPoints(value: unknown): PointId[] | null {
  if (!Array.isArray(value) || value.length > POINT_IDS.length) return null;
  if (!value.every((id) => (POINT_IDS as readonly unknown[]).includes(id))) return null;
  if (new Set(value).size !== value.length) return null;
  const points = POINT_IDS.filter((id) => value.includes(id));
  if (pointsPerSide(points, "for") > POINTS_PER_SIDE || pointsPerSide(points, "against") > POINTS_PER_SIDE) return null;
  return points;
}

function pointsPerSide(points: readonly PointId[], side: Side): number {
  return points.filter((id) => sideOf(id) === side).length;
}

/** Everything wrong with a task's shape (empty when it is valid). Checked by the content tests. */
export function argumentTaskProblems(task: BalancedArgumentTask): string[] {
  const problems: string[] = [];
  if (task.points.map((p) => p.id).join() !== POINT_IDS.join()) problems.push("points must be exactly F1, F2, F3, A1, A2, A3 in order");
  for (const point of task.points) {
    if (point.side !== sideOf(point.id)) problems.push(`${point.id} is on the wrong side`);
    if (!point.text.trim()) problems.push(`${point.id} has no text`);
    if (/[.!?]$/.test(point.text.trim())) problems.push(`${point.id} must be a short phrase, not a sentence`);
    if (point.text.split(/\s+/).length > 10) problems.push(`${point.id} is longer than 10 words`);
  }
  if (!/[.]$/.test(task.statement.trim())) problems.push("the statement is one sentence ending with a full stop");
  if (task.preparationSeconds !== 60) problems.push("preparation is 1 minute");
  if (task.speakingSeconds !== 120) problems.push("speaking is 2 minutes");
  if (task.level !== "C1") problems.push("Part 3 targets C1");
  return problems;
}
