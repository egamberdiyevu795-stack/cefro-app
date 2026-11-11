import { remainingParts } from "@/domain/speaking/full-mock";
import type { ExamPartId } from "@/domain/speaking/exam-part";

/*
 * What the mock runner is doing, as a pure reducer (the browser parts around it are tested by the browser test).
 *
 *   ready ──begin──▶ starting ──started──▶ playing ──partRecorded (last)──▶ sending ──allSent──▶ done
 *     ▲                 │                     │  ▲
 *     └──startFailed────┘                     └──┘ partRecorded (not last: the next part starts at once)
 *
 * `queue` is the parts to play, in exam order: all four for a new mock, only the unfinished ones when continuing. A
 * recording is handed on the moment a part ends; whether it has reached the server is the upload queue's business, and
 * the runner waits for that only after the last part ("sending").
 */
export type RunPhase = "ready" | "starting" | "playing" | "sending" | "done";

export interface RunState {
  phase: RunPhase;
  queue: ExamPartId[];
  /** Index in `queue` of the part being played. */
  index: number;
  /** Why the last start failed (shown on the start screen). */
  error: string | null;
}

export type RunAction =
  | { type: "begin" }
  /** The session exists (or was resumed): `finished` are the parts the server already holds. */
  | { type: "started"; finished: readonly ExamPartId[] }
  | { type: "startFailed"; message: string }
  | { type: "partRecorded"; part: ExamPartId }
  | { type: "allSent" };

export function initialRunState(finished: readonly ExamPartId[]): RunState {
  return { phase: "ready", queue: remainingParts(finished.map((part) => ({ part }))), index: 0, error: null };
}

export function currentPart(state: RunState): ExamPartId | null {
  return state.phase === "playing" ? (state.queue[state.index] ?? null) : null;
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "begin":
      return state.phase === "ready" ? { ...state, phase: "starting", error: null } : state;
    case "started": {
      if (state.phase !== "starting") return state;
      // The server's list wins: another tab may have finished a part since this page was drawn.
      const queue = remainingParts(action.finished.map((part) => ({ part })));
      return { phase: queue.length > 0 ? "playing" : "sending", queue, index: 0, error: null };
    }
    case "startFailed":
      return state.phase === "starting" ? { ...state, phase: "ready", error: action.message } : state;
    case "partRecorded": {
      // Only the part on screen can end; a late or repeated report is ignored.
      if (currentPart(state) !== action.part) return state;
      const index = state.index + 1;
      return index >= state.queue.length ? { ...state, phase: "sending", index } : { ...state, index };
    }
    case "allSent":
      return state.phase === "sending" ? { ...state, phase: "done" } : state;
  }
}
