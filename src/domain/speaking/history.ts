import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { AttemptStatus, FailureCode } from "./attempt";
import type { ExamPartId } from "./exam-part";

/**
 * One of the student's attempts, as the History page and the dashboard's Recent attempts read it. Built on the server
 * from the owner's own rows only (see `listAttemptHistory`); the page turns a list of these into what it shows.
 */
export interface HistoryAttempt {
  id: string;
  taskId: string;
  /** The task's title from the snapshot the attempt was made against. */
  title: string;
  /** Null for a task that is not one of the exam's parts. */
  part: ExamPartId | null;
  createdAt: string;
  status: AttemptStatus;
  /** True when processing has been "in progress" for too long (shown as not scored, not as "Scoring…"). */
  isStalled: boolean;
  failureCode: FailureCode | null;
  recordingDurationMs: number;
  /** The attempt this one retries (null for a first attempt). */
  previousAttemptId: string | null;
  /** The stored Multilevel result of a completed attempt; null otherwise, and for results scored with the old method. */
  result: MultilevelResult | null;
}
