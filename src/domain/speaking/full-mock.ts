import { EXAM_PART_IDS, type ExamPartId } from "./exam-part";

/*
 * The full mock exam (docs/v1-plan.md, section 3.2) as a pure state machine: no database, no clock, no randomness of its
 * own. One practice session of kind "full_mock" holds Parts 1.1, 1.2, 2 and 3 back to back. Which parts are done is NOT
 * stored on the session: it is the session's attempts (one per part), so a part is "finished" exactly when its recording
 * reached the server. The server and the browser both ask these functions.
 */

/** The parts of a mock, in exam order. */
export const MOCK_PARTS: readonly ExamPartId[] = EXAM_PART_IDS;

/** A mock not finished within this long after it started becomes "not_finished". Its finished parts keep their results. */
export const MOCK_EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000;

export type MockStatus = "in_progress" | "finished" | "not_finished";

/** What the rules need to know about a mock session. `createdAt` is an ISO-8601 string, as stored. */
export interface MockSession {
  status: MockStatus;
  createdAt: string;
}

/** A part whose recording reached the server. */
export interface FinishedPart {
  part: ExamPartId;
  attemptId: string;
  taskId: string;
}

/** The status a mock has at `now`: an in-progress mock older than 24 hours is "not_finished", whatever is stored. */
export function effectiveMockStatus(session: MockSession, now: number): MockStatus {
  if (session.status !== "in_progress") return session.status;
  return now - Date.parse(session.createdAt) >= MOCK_EXPIRES_AFTER_MS ? "not_finished" : "in_progress";
}

/** The parts still to do, in exam order. After a break these are what "Continue your mock" plays, nothing else. */
export function remainingParts(finished: readonly Pick<FinishedPart, "part">[]): ExamPartId[] {
  const done = new Set(finished.map((p) => p.part));
  return MOCK_PARTS.filter((part) => !done.has(part));
}

/** The next part to play, or null when all four are done. */
export function nextMockPart(finished: readonly Pick<FinishedPart, "part">[]): ExamPartId | null {
  return remainingParts(finished)[0] ?? null;
}

export function isMockComplete(finished: readonly Pick<FinishedPart, "part">[]): boolean {
  return remainingParts(finished).length === 0;
}

/** The thin progress line above a part: "Part 2 of 4" (the position in the mock, not the part's own number). */
export function mockProgressLabel(part: ExamPartId): string {
  return `Part ${MOCK_PARTS.indexOf(part) + 1} of ${MOCK_PARTS.length}`;
}

/** Why a recording may not join a mock (null: it may). */
export type MockRefusal = "not_in_progress" | "expired" | "part_done" | "not_a_mock_part";

/**
 * May a recording of `part` join this mock now? Order is not enforced here: uploads run while the next part plays, so
 * Part 1.2 can arrive before a slow Part 1.1 upload is retried. A part may be uploaded once; a mock that ended or ran
 * out of time takes nothing more.
 */
export function mockRefusal(
  session: MockSession,
  finished: readonly Pick<FinishedPart, "part">[],
  part: ExamPartId | null,
  now: number,
): MockRefusal | null {
  const status = effectiveMockStatus(session, now);
  if (status !== "in_progress") return session.status === "in_progress" ? "expired" : "not_in_progress";
  if (part === null) return "not_a_mock_part";
  if (finished.some((p) => p.part === part)) return "part_done";
  return null;
}

/* ------------------------------------------------------------------------------------------------- task picker */

export interface PickableTask {
  id: string;
}

/** One earlier attempt of a task: when the student last did it. */
export interface TaskHistory {
  taskId: string;
  createdAt: string;
}

/**
 * One task for a part that the student hasn't done recently: a task never attempted first; otherwise the one whose latest
 * attempt is the oldest. Ties (several never attempted, or the same moment) are broken with `random` (0 ≤ r < 1), so two
 * mocks in a row differ and the choice is still testable. Null for a part with no task.
 */
export function pickTaskForPart<T extends PickableTask>(tasks: readonly T[], history: readonly TaskHistory[], random: () => number = Math.random): T | null {
  if (tasks.length === 0) return null;
  const last = new Map<string, number>();
  for (const h of history) last.set(h.taskId, Math.max(last.get(h.taskId) ?? -Infinity, Date.parse(h.createdAt)));
  const age = (t: T) => last.get(t.id) ?? -Infinity;
  const oldest = Math.min(...tasks.map(age));
  const best = tasks.filter((t) => age(t) === oldest);
  return best[Math.min(best.length - 1, Math.floor(random() * best.length))]!;
}
