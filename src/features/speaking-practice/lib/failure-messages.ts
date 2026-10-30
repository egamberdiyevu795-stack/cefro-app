import type { AttemptFailure, AttemptView, FailureCode } from "@/domain/speaking/attempt";

/** Failures that are usually temporary on the provider side: processing is restarted once automatically. */
const AUTO_RESTART_FAILURES: FailureCode[] = [
  "provider_timeout",
  "processing_stalled",
  "transcription_failed",
  "evaluation_failed",
  "evaluation_invalid_output",
];

/** Whether a settled attempt should be restarted automatically (once) instead of showing the failure screen. */
export function shouldAutoRestart(attempt: Pick<AttemptView, "status" | "isStalled" | "failure">): boolean {
  if (attempt.isStalled) return true;
  return attempt.status === "failed" && Boolean(attempt.failure && AUTO_RESTART_FAILURES.includes(attempt.failure.code));
}

export interface FailureCopy {
  title: string;
  message: string;
  /** Whether re-running processing on the same recording can help. */
  canRetryProcessing: boolean;
  /** Whether the student should record again instead. */
  suggestReRecord: boolean;
}

/** Student-facing copy for each failure code. Technical details stay in server logs. */
export function describeFailure(failure: AttemptFailure | null): FailureCopy {
  switch (failure?.code) {
    case "transcription_empty":
      return {
        title: "We couldn't hear enough speech",
        message:
          "Your recording seems to be silent or very short. Check that the right microphone is selected and record again.",
        canRetryProcessing: false,
        suggestReRecord: true,
      };
    case "audio_unavailable":
      return {
        title: "Your recording couldn't be read",
        message: "Something went wrong with the saved audio. Please record your answer again.",
        canRetryProcessing: true,
        suggestReRecord: true,
      };
    case "provider_not_configured":
      return {
        title: "Feedback is temporarily unavailable",
        message: "Your recording is saved. Our feedback service isn't available right now — please try again later.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
    case "provider_rate_limited":
      return {
        title: "We're very busy right now",
        message: "Your recording is saved. Please wait a minute and try again.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
    case "provider_timeout":
    case "processing_stalled":
      return {
        title: "This is taking longer than expected",
        message: "Your recording is saved. Try again and we'll pick up where we left off.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
    case "transcription_failed":
      return {
        title: "We couldn't transcribe your answer",
        message: "Your recording is saved. Please try again.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
    case "audio_unsupported":
      return {
        title: "We couldn't read your recording",
        message: "The audio file seems to be damaged or in a format we can't use. Please record your answer again.",
        canRetryProcessing: false,
        suggestReRecord: true,
      };
    case "evaluation_refused":
      return {
        title: "We couldn't assess this answer",
        message: "Your recording and transcript are saved. Please try again, or record a new answer to the task question.",
        canRetryProcessing: true,
        suggestReRecord: true,
      };
    case "evaluation_failed":
    case "evaluation_invalid_output":
    case "evaluation_quality_rejected":
      return {
        title: "We couldn't prepare your feedback",
        message: "Your recording and transcript are saved. Please try again.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
    default:
      return {
        title: "Something went wrong",
        message: "Your recording is saved. Please try again.",
        canRetryProcessing: true,
        suggestReRecord: false,
      };
  }
}
