import "server-only";
import { HttpError } from "./errors";
import { isDatabaseUnavailable, safeDatabaseMessage } from "./db/errors";
import { logger } from "./logging/logger";

/** Standard error body for every API route: `{ error: { code, message } }`. */
export function errorResponse(status: number, code: string, message: string, retryAfterSeconds?: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined },
  );
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
        return errorResponse(error.status, error.code, error.publicMessage, error.retryAfterSeconds);
      }
      if (isDatabaseUnavailable(error)) {
        // The database (or the connection to it) failed: say so, and say it is temporary. It is never reported as a missing record.
        logger.error("Database unavailable", { detail: safeDatabaseMessage(error) });
        return errorResponse(503, "database_unavailable", "CEFRO can't reach its data store right now. Please try again in a moment.", 5);
      }
      logger.error("Unhandled API error", { error });
      return errorResponse(500, "internal_error", "Something went wrong on our side. Please try again.");
    }
  };
}

/**
 * Read a request body without ever holding more than `maxBytes`. The declared Content-Length is only
 * a fast path: it can be absent (chunked uploads) or wrong, so the bytes actually received are
 * counted and the stream is cancelled the moment the limit is crossed.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
  tooLarge: () => HttpError = () => new HttpError(413, "audio_too_large", "The recording is too large."),
): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) throw new HttpError(400, "invalid_form", "The upload was incomplete. Please try again.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_form", "The upload was incomplete. Please try again.");
  }
  return Buffer.concat(chunks);
}

/** Parse a multipart/form-data body that has already been read (and size-checked). */
export async function parseFormData(body: Buffer, contentType: string | null): Promise<FormData> {
  try {
    return await new Response(new Uint8Array(body), { headers: { "content-type": contentType ?? "" } }).formData();
  } catch {
    throw new HttpError(400, "invalid_form", "The upload was incomplete. Please try again.");
  }
}
