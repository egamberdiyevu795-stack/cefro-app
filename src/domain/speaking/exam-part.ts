/**
 * The four parts of the Multilevel speaking exam, as the student sees them. Part 1 has two halves with their own
 * target level and band table: Part 1.1 (Questions 1–3, target A2) and Part 1.2 (Questions 4–6, target B1).
 */
export const EXAM_PART_IDS = ["1.1", "1.2", "2", "3"] as const;
export type ExamPartId = (typeof EXAM_PART_IDS)[number];

export function isExamPartId(value: unknown): value is ExamPartId {
  return typeof value === "string" && (EXAM_PART_IDS as readonly string[]).includes(value);
}

/**
 * Which exam part a task belongs to, from what every stored task snapshot has: its part number and target level.
 * Part 1 is split by its target (A2 → 1.1, B1 → 1.2). Null for anything the exam does not have.
 */
export function examPartOf(task: { part: number; level: string }): ExamPartId | null {
  if (task.part === 1) return task.level === "A2" ? "1.1" : task.level === "B1" ? "1.2" : null;
  const id = String(task.part);
  return isExamPartId(id) ? id : null;
}

export function examPartLabel(part: ExamPartId): string {
  return `Part ${part}`;
}

/** The id of a part's section on the task list ("/practice"): "part-2", "part-1-1". */
export function examPartAnchor(part: ExamPartId): string {
  return `part-${part.replace(".", "-")}`;
}

/** A part's tasks on the task list. */
export function examPartListHref(part: ExamPartId): string {
  return `/practice#${examPartAnchor(part)}`;
}

/** What a stored result's rubric says about where it belongs (results carry `part` 1 for both halves of Part 1). */
const RUBRIC_PARTS: Record<string, { part: ExamPartId; firstQuestionNumber: number }> = {
  "multilevel-q1-3": { part: "1.1", firstQuestionNumber: 1 },
  "multilevel-q4-6": { part: "1.2", firstQuestionNumber: 4 },
  "multilevel-q7": { part: "2", firstQuestionNumber: 1 },
};

/** The exam part of a stored result ("1.1", "1.2", "2" …), from its rubric id; falls back to its part number. */
export function examPartOfResult(result: { rubric_id: string; part: number }): ExamPartId | null {
  const known = RUBRIC_PARTS[result.rubric_id]?.part;
  if (known) return known;
  const id = String(result.part);
  return isExamPartId(id) ? id : null;
}

/** The number the student saw for a result's first question (Part 1.2 starts at Question 4). */
export function firstQuestionNumberOfResult(result: { rubric_id: string }): number {
  return RUBRIC_PARTS[result.rubric_id]?.firstQuestionNumber ?? 1;
}
