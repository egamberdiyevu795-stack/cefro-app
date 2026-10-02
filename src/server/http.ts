import "server-only";
import { HttpError } from "./errors";
import { logger } from "./logging/logger";

/** Standard error body for every API route: `{ error: { code, message } }`. */
export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Wrap a route handler so that expected errors (HttpError) become clean
 * JSON responses and unexpected ones are logged and returned as a generic
 * 500 — technical details never reach the client.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error.status, error.code, error.publicMessage);
      }
      logger.error("Unhandled API error", { error });
      return errorResponse(500, "internal_error", "Something went wrong on our side. Please try again.");
    }
  };
}
