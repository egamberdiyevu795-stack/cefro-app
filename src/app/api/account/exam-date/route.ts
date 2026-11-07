import { HttpError } from "@/server/errors";
import { removeExamDate, saveExamDate, skipExamDate } from "@/server/exam-date/exam-date-store";
import { withErrorHandling } from "@/server/http";
import { getCurrentUserId } from "@/server/identity/current-user";

/**
 * The caller's exam date. `PUT { "date": "YYYY-MM-DD" }` saves it (today or later); `PUT { "skip": true }` is the
 * "Skip" answer; `PUT { "remove": true }` clears a saved date (and, like Skip, stops asking). Always the caller's own user (signed-in account or this browser's anonymous identity), never an id
 * from the request.
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { date?: unknown; skip?: unknown; remove?: unknown } | null;
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_body", "Choose a date.");
  const userId = await getCurrentUserId();
  if (body.remove === true) await removeExamDate(userId);
  else if (body.skip === true) await skipExamDate(userId);
  else await saveExamDate(userId, body.date);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
