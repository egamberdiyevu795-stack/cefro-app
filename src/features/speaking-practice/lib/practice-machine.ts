import { IN_PROGRESS_STATUSES, type AttemptView } from "@/domain/speaking/attempt";

/**
 * State machine for one practice session on a task.
 *
 *  brief ──▶ intro ──▶ preparing ──▶ recording ──▶ review ──▶ uploading ──▶ processing ──▶ result
 *    ▲                         ▲            │            │                          │
 *    │                         └─ re-record ┘     uploadFailed (recording kept)     │
 *    └──────────── retryBrief ◀───────────────────── "Retry this task" ◀────────────┤
 *                                                    comparison ◀── "Compare" ◀─────┘
 *
 * "intro" is the part's spoken introduction on its own screen (then the chime), as in the exam.
 *
 * Timers are stored as absolute deadlines (`endsAt`), so the displayed
 * countdown is always derived from this state, never kept separately.
 */
export type PracticePhase =
  | { kind: "brief" }
  | { kind: "retryBrief" }
  | { kind: "intro" }
  | { kind: "preparing"; endsAt: number }
  | { kind: "recording"; endsAt: number }
  | { kind: "review" }
  | { kind: "uploading" }
  | { kind: "uploadFailed"; message: string }
  | { kind: "processing"; attemptId: string }
  | { kind: "result"; attemptId: string }
  | { kind: "comparison"; beforeId: string; afterId: string };

export interface PracticeState {
  phase: PracticePhase;
  /** When set, the next submission is a retry of this attempt. */
  retryOf: AttemptView | null;
  /** Attempts loaded in this session, by id. */
  attempts: Record<string, AttemptView>;
}

export type PracticeAction =
  | { type: "introStarted" }
  | { type: "preparationStarted"; now: number; preparationMs: number }
  | { type: "recordingStarted"; now: number; speakingMs: number }
  | { type: "recordingStopped" }
  | { type: "uploadStarted" }
  | { type: "uploadFailed"; message: string }
  | { type: "uploadSucceeded"; attempt: AttemptView }
  | { type: "attemptUpdated"; attempt: AttemptView }
  | { type: "processingRestarted"; attempt: AttemptView }
  | { type: "showAttempt"; attempt: AttemptView }
  /** Keep an attempt (e.g. the one a retry was compared with) without changing the screen. */
  | { type: "attemptCached"; attempt: AttemptView }
  | { type: "retryRequested"; attempt: AttemptView }
  | { type: "comparisonRequested"; before: AttemptView; after: AttemptView }
  | { type: "backToResult"; attemptId: string }
  | { type: "backToBrief" };

export const initialPracticeState: PracticeState = { phase: { kind: "brief" }, retryOf: null, attempts: {} };

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  switch (action.type) {
    case "introStarted":
      return state.phase.kind === "brief" || state.phase.kind === "retryBrief" ? { ...state, phase: { kind: "intro" } } : state;
    case "preparationStarted":
      return { ...state, phase: { kind: "preparing", endsAt: action.now + action.preparationMs } };
    case "recordingStarted":
      return { ...state, phase: { kind: "recording", endsAt: action.now + action.speakingMs } };
    case "recordingStopped":
      return state.phase.kind === "recording" ? { ...state, phase: { kind: "review" } } : state;
    case "uploadStarted":
      return { ...state, phase: { kind: "uploading" } };
    case "uploadFailed":
      return { ...state, phase: { kind: "uploadFailed", message: action.message } };
    case "uploadSucceeded":
      return {
        ...state,
        attempts: { ...state.attempts, [action.attempt.id]: action.attempt },
        phase: { kind: "processing", attemptId: action.attempt.id },
      };
    case "attemptUpdated": {
      const attempts = { ...state.attempts, [action.attempt.id]: action.attempt };
      const phase =
        state.phase.kind === "processing" && state.phase.attemptId === action.attempt.id
          ? { kind: "result" as const, attemptId: action.attempt.id }
          : state.phase;
      return { ...state, attempts, phase };
    }
    case "processingRestarted":
      return {
        ...state,
        attempts: { ...state.attempts, [action.attempt.id]: action.attempt },
        phase: { kind: "processing", attemptId: action.attempt.id },
      };
    case "showAttempt": {
      // An attempt still being processed resumes the progress screen.
      const stillProcessing =
        IN_PROGRESS_STATUSES.includes(action.attempt.status) && !action.attempt.isStalled;
      return {
        ...state,
        attempts: { ...state.attempts, [action.attempt.id]: action.attempt },
        phase: { kind: stillProcessing ? "processing" : "result", attemptId: action.attempt.id },
      };
    }
    case "attemptCached":
      return { ...state, attempts: { ...state.attempts, [action.attempt.id]: action.attempt } };
    case "retryRequested":
      // Only from a brief: a retry that finishes loading late must never pull the student out of preparation,
      // recording or a result.
      if (state.phase.kind !== "brief" && state.phase.kind !== "retryBrief") return state;
      return { ...state, retryOf: action.attempt, phase: { kind: "retryBrief" } };
    case "comparisonRequested":
      return {
        ...state,
        attempts: {
          ...state.attempts,
          [action.before.id]: action.before,
          [action.after.id]: action.after,
        },
        phase: { kind: "comparison", beforeId: action.before.id, afterId: action.after.id },
      };
    case "backToResult":
      return { ...state, phase: { kind: "result", attemptId: action.attemptId } };
    case "backToBrief":
      return { ...state, retryOf: null, phase: { kind: "brief" } };
  }
}
