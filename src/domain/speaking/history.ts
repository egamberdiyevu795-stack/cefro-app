import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { Q8Result } from "@/domain/evaluation/q8/result";
import type { AttemptStatus, FailureCode } from "./attempt";
import type { ExamPartId } from "./exam-part";
import type { MockStatus } from "./full-mock";

/**
 * A stored result with a Part band: Part 1/2 (`kind: "multilevel"`) or Part 3 (`kind: "multilevel_q8"`). Both carry
 * `scoring` (band, band_max, label, target_band, zero_reason, provisional) and `retry_focus`, which is all the lists
 * read; everything else is narrowed by `kind`.
 */
export type BandedResult = MultilevelResult | Q8Result;

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
  /** The practice session it belongs to (a full mock's id for its four parts); null or absent for a single practice. */
  sessionId?: string | null;
  /** The stored Multilevel result (Part 1/2 or Part 3) of a completed attempt; null otherwise, and for results scored with the old method. */
  result: BandedResult | null;
}

/**
 * One of the student's full mock exams, as the History page reads it: its status (after the 24-hour rule) and when it started.
 * Its parts are the attempts whose `sessionId` is this id (`HistoryAttempt`), so a part's band is read exactly once, from the attempt.
 */
export interface HistoryMock {
  id: string;
  status: MockStatus;
  createdAt: string;
}
