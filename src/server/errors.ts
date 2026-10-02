import "server-only";
import type { FailureCode } from "@/domain/speaking/attempt";

/**
 * Error raised by an external provider (transcription, evaluation, storage).
 * `failureCode` is what gets stored on the attempt and shown (as friendly
 * copy) to the student; `message`/`cause` are for logs only.
 */
export class ProviderError extends Error {
  constructor(
    readonly failureCode: FailureCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.retryable = options?.retryable ?? true;
  }
  readonly retryable: boolean;
}

/** Error with an HTTP status and a message that is safe to show to users. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "HttpError";
  }
}
