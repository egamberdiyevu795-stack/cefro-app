/**
 * The demo student of mock mode (`?mock=1`): a few attempts across several Part 2 tasks, a retry with a goal, and an
 * exam date. Used by the dashboard and History in mock mode instead of the database.
 *
 * Every scored result is a saved live evaluator output (test/fixtures/live-3.6-flash: gemini-3.6-flash, NOT the
 * production model), in the real types (`HistoryAttempt`, `MultilevelResult`), so the pages run their real code on
 * it. Nothing here reads or writes the database, and no provider is called. Dates are relative to `now`, so the demo
 * always looks recent.
 *
 * The saved runs all answered "Advice from someone". The attempts on the other tasks borrow their levels and bands
 * only (that is all the dashboard and History show of them); opening one shows the demo result of "Advice from
 * someone", the only task the result prototype has.
 */
import { getSpeakingTask } from "@/content/speaking";
import { addDays, todayIn } from "@/domain/exam-date";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { RETRY_CURRENT, RETRY_PREVIOUS, anchorOf, evaluationOf } from "@/features/result/mock-data";
import { practiceHref, type MockAttemptKey } from "@/features/speaking-practice/lib/practice-flow";
import { formatInternal, parseInternal, withMock } from "./demo-mode";

interface DemoAttemptSpec {
  id: string;
  taskId: string;
  /** How long before `now` it was recorded. */
  daysAgo: number;
  hoursAgo?: number;
  /** The saved run it is scored with; null for an attempt that failed with no speech. */
  saved: MockAttemptKey | null;
  /** The demo attempt this one retries. */
  retryOf?: string;
}

/** Newest first, as `listAttemptHistory` returns them. */
const SPECS: readonly DemoAttemptSpec[] = [
  // A retry of the attempt below, with its goal: the result prototype's retry pair ("Goal met").
  { id: "demo-6", taskId: "b2-part2-advice-from-someone", daysAgo: 1, saved: RETRY_CURRENT, retryOf: "demo-5" },
  { id: "demo-5", taskId: "b2-part2-advice-from-someone", daysAgo: 1, hoursAgo: 2, saved: RETRY_PREVIOUS },
  { id: "demo-4", taskId: "b2-part2-goal-you-set", daysAgo: 3, saved: { anchor: "A2-b1-all-three", run: 2 } },
  { id: "demo-3", taskId: "b2-part2-working-in-a-team", daysAgo: 4, saved: null },
  { id: "demo-2", taskId: "b2-part2-important-decision", daysAgo: 6, saved: { anchor: "A1-b1-only-q3", run: 1 } },
  { id: "demo-1", taskId: "b2-part2-a-tradition", daysAgo: 9, saved: { anchor: "A0-below-b1", run: 1 } },
];

/** The demo student's exam: this many days from today (Uzbekistan's calendar). */
export const DEMO_EXAM_IN_DAYS = 23;

const BY_ID = new Map(SPECS.map((spec) => [spec.id, spec]));

/** The demo student's attempts, newest first, in the shape the dashboard and History read. */
export function demoAttempts(now: Date): HistoryAttempt[] {
  return SPECS.map((spec) => {
    const task = getSpeakingTask(spec.taskId);
    if (!task) throw new Error(`Demo data: no task ${spec.taskId}`);
    const createdAt = new Date(now.getTime() - (spec.daysAgo * 24 + (spec.hoursAgo ?? 0)) * 3_600_000).toISOString();
    const base = {
      id: spec.id,
      taskId: task.id,
      title: task.title,
      part: examPartOf(task),
      createdAt,
      isStalled: false,
      previousAttemptId: spec.retryOf ?? null,
    };
    if (!spec.saved) {
      return { ...base, status: "failed", failureCode: "transcription_empty", recordingDurationMs: 12_000, result: null };
    }
    return {
      ...base,
      status: "completed",
      failureCode: null,
      recordingDurationMs: anchorOf(spec.saved.anchor).durationMs,
      result: evaluationOf(spec.saved.anchor, spec.saved.run).result,
    };
  });
}

/** The demo student's stored exam date, as the database would hold it. */
export function demoExamDate(now: Date): { examDate: string; examDateSkippedAt: null } {
  return { examDate: addDays(todayIn(now), DEMO_EXAM_IN_DAYS), examDateSkippedAt: null };
}

/** The transcript of a demo attempt (the saved run's answer), or "" for one with no speech. */
export function demoTranscript(attemptId: string): string {
  const saved = BY_ID.get(attemptId)?.saved;
  return saved ? anchorOf(saved.anchor).transcript : "";
}

/** The demo result page of a demo attempt: the `/result` prototype showing that saved run, in mock mode. */
export function demoResultHref(attemptId: string): string {
  const spec = BY_ID.get(attemptId);
  if (!spec) return withMock("/result");
  if (!spec.saved) return withMock("/result?state=no-speech");
  const previous = spec.retryOf ? BY_ID.get(spec.retryOf)?.saved : null;
  if (previous) {
    // The prototype's retry screen always shows RETRY_CURRENT; the demo retry is scored with it (checked by a test).
    return withMock(`/result?${new URLSearchParams({ state: "retry", from: previous.anchor, fromRun: String(previous.run) })}`);
  }
  return withMock(`/result?${new URLSearchParams({ anchor: spec.saved.anchor, run: String(spec.saved.run) })}`);
}

/**
 * A link built by the real pages' code from demo attempts, turned into its mock-mode link: `/result/<demo id>` opens
 * the demo result; a practice link that retries a demo attempt (`?retry=<demo id>`) retries its saved run instead
 * (`?mock=1&retry=<anchor>&run=n`), which carries the same goal; every other link just keeps `mock=1`.
 */
export function demoHref(href: string): string {
  const url = parseInternal(href);
  const result = /^\/result\/([^/]+)$/.exec(url.pathname);
  if (result) return demoResultHref(decodeURIComponent(result[1]));

  const practice = /^\/practice\/speaking\/([^/]+)$/.exec(url.pathname);
  const retry = url.searchParams.get("retry");
  if (practice && retry) {
    const saved = BY_ID.get(retry)?.saved;
    const taskId = decodeURIComponent(practice[1]);
    return saved ? practiceHref(taskId, { mock: true, retry: saved.anchor, run: saved.run }) : practiceHref(taskId, { mock: true });
  }
  return withMock(formatInternal(url));
}
