import type { AttemptFailure } from "@/domain/speaking/attempt";

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
    case "evaluation_failed":
    case "evaluation_invalid_output":
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
