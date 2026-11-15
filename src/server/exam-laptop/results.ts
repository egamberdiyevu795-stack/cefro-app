import "server-only";
import { EXAM_PART_IDS } from "@/domain/speaking/exam-part";
import { classMockOf, firstUnrated, mockProblems, resultRow, sortByLevel, type ResultRow } from "@/features/exam-laptop/results-view";
import { mockBands } from "@/features/history/view-model";
import type { CommonProblem } from "@/features/teacher/view-model";
import { findMockRating, findRating } from "@/server/teacher/teacher-store";
import { classWithStudents } from "@/server/teacher/teacher-service";
import { ownClassMock, toClassMockView, type ClassMockView } from "./exam-store";

export interface ClassMockResults {
  classMock: ClassMockView;
  className: string;
  /** Sorted by level, highest first. */
  rows: ResultRow[];
  problems: CommonProblem[];
  /** T6's mock id of the first row, in the order shown, that still has something to rate. */
  firstUnratedMockId: string | null;
}

/**
 * T8: one row per student who shared with the class, for ONE class mock. Only what the teacher may already read (their shared
 * students' mocks and attempts, through `classWithStudents`); no PIN, no hash, no email. Its own teacher only.
 */
export async function classMockResults(teacherId: string, classId: string, classMockId: string): Promise<ClassMockResults> {
  const cm = await ownClassMock(teacherId, classId, classMockId, { allowClosed: true });
  const { cls, students } = await classWithStudents(teacherId, classId);
  const rows: ResultRow[] = [];
  for (const student of students) {
    const mock = classMockOf(student, classMockId);
    let ratedParts = 0;
    let mockRated = false;
    if (mock) {
      mockRated = Boolean(await findMockRating(teacherId, mock.id));
      const parts = student.attempts.filter((a) => a.sessionId === mock.id);
      const scored = EXAM_PART_IDS.filter((p) => mockBands(parts)[p] != null);
      for (const part of scored) {
        const attempt = parts.find((a) => a.part === part);
        if (attempt && (await findRating(teacherId, attempt.id))) ratedParts++;
      }
    }
    rows.push(resultRow(student, classMockId, { mock: mockRated, ratedParts }));
  }
  const sorted = sortByLevel(rows);
  return { classMock: toClassMockView(cm), className: cls.name, rows: sorted, problems: mockProblems(students, classMockId), firstUnratedMockId: firstUnrated(sorted)?.mockId ?? null };
}
