import type { ExamPartId } from "@/domain/speaking/exam-part";
import { EXAM_PART_IDS, examPartLabel } from "@/domain/speaking/exam-part";
import type { HistoryAttempt, HistoryMock } from "@/domain/speaking/history";
import { estimateSpeakingLevel, type EstimatedLevel } from "@/domain/speaking/mock-level";
import { mockBands } from "@/features/history/view-model";
import { commonProblems, type CommonProblem, type SharedStudent } from "@/features/teacher/view-model";

/*
 * T8 "Class mock: results" (docs/v1-plan.md section 5): one row per student of ONE class mock (level, part bands, "Listen"
 * to T6), sorted by level, the common problems of this mock, and the black "Open first unrated". Pure and browser-safe:
 * the demo class and a real class feed it the same shape (`SharedStudent`, as the teacher is allowed to read it).
 */

export type ResultState = "finished" | "in_progress" | "not_finished" | "not_started";

export interface ResultRow {
  memberId: string;
  name: string;
  state: ResultState;
  /** The student's mock of this class mock (T6's address); null when they have none. */
  mockId: string | null;
  level: EstimatedLevel | null;
  /** "B2", "Estimate not ready yet", "In progress", "Not finished" or "Not started". Never a score, never Passed / Failed. */
  levelText: string;
  /** One entry per part: "Band 3" or "—" (not done, not scored). */
  bands: { part: ExamPartId; label: string; text: string }[];
  /** At least one scored part, and the teacher rated neither the whole mock nor every scored part. */
  unrated: boolean;
}

export const LEVEL_RANK: Record<EstimatedLevel, number> = { "Below B1": 0, B1: 1, B2: 2, C1: 3 };

/** The mock a student took for this class mock: a finished one first, else the newest. */
export function classMockOf(student: Pick<SharedStudent, "mocks">, classMockId: string): HistoryMock | null {
  const mine = student.mocks.filter((m) => m.classMockId === classMockId);
  return mine.find((m) => m.status === "finished") ?? mine[0] ?? null;
}

export function resultRow(student: SharedStudent, classMockId: string, rated: { mock: boolean; ratedParts: number }): ResultRow {
  const mock = classMockOf(student, classMockId);
  if (!mock) return { memberId: student.memberId, name: student.shownName, state: "not_started", mockId: null, level: null, levelText: "Not started", bands: bandCells({}), unrated: false };
  const parts = student.attempts.filter((a: HistoryAttempt) => a.sessionId === mock.id);
  const bands = mockBands(parts);
  const scored = EXAM_PART_IDS.filter((p) => bands[p] != null).length;
  const estimate = estimateSpeakingLevel(bands);
  const level = mock.status === "finished" && estimate.kind === "ready" ? estimate.level : null;
  const levelText = mock.status === "in_progress" ? "In progress" : mock.status === "not_finished" ? "Not finished" : level ?? "Estimate not ready yet";
  return {
    memberId: student.memberId,
    name: student.shownName,
    state: mock.status,
    mockId: mock.id,
    level,
    levelText,
    bands: bandCells(bands),
    unrated: scored > 0 && !rated.mock && rated.ratedParts < scored,
  };
}

function bandCells(bands: Partial<Record<ExamPartId, number | null>>): ResultRow["bands"] {
  return EXAM_PART_IDS.map((part) => ({ part, label: examPartLabel(part), text: bands[part] == null ? "—" : `Band ${bands[part]}` }));
}

export type SortDirection = "high" | "low";

/** By level, highest first (or lowest first). A student with no level yet goes last in both, by name. */
export function sortByLevel(rows: readonly ResultRow[], direction: SortDirection = "high"): ResultRow[] {
  const sign = direction === "high" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (a.level && b.level) return sign * (LEVEL_RANK[a.level] - LEVEL_RANK[b.level]) || a.name.localeCompare(b.name);
    if (a.level) return -1;
    if (b.level) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** The first row, in the order shown, that has something to rate and no rating (the black "Open first unrated"). */
export function firstUnrated(rows: readonly ResultRow[]): ResultRow | null {
  return rows.find((r) => r.mockId && r.unrated) ?? null;
}

/** "3 of 8 finished", for the page's one-line summary. */
export function finishedText(rows: readonly ResultRow[]): string {
  return `${rows.filter((r) => r.state === "finished").length} of ${rows.length} finished`;
}

/**
 * The common problems of THIS mock: each student counted once, from their latest scored answer inside it (the same rule as
 * the class page, limited to the mock's own answers).
 */
export function mockProblems(students: readonly SharedStudent[], classMockId: string): CommonProblem[] {
  const limited = students.map((s) => {
    const mock = classMockOf(s, classMockId);
    return { ...s, mocks: mock ? [mock] : [], attempts: mock ? s.attempts.filter((a) => a.sessionId === mock.id) : [] };
  });
  return commonProblems(limited);
}
