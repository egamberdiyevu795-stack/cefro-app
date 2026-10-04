import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";
import { createPracticeSession } from "@/server/sessions/session-service";

/** Opening a practice page creates one session; a handful per hour is plenty for real use. */
const limiter = new FixedWindowLimiter(30, 60 * 60 * 1000);

/**
 * Start a practice session for the current user. The id is generated here and only returned; the
 * client sends it back with attempts and analytics events, where it is checked against the user.
 */
export const POST = withErrorHandling(async () => {
  const userId = await getOrCreateCurrentUserId();
  const verdict = limiter.hit(userId);
  if (!verdict.allowed) {
    throw new HttpError(429, "session_rate_limited", "Too many practice sessions started. Please try again later.", verdict.retryAfterSeconds);
  }
  return Response.json({ sessionId: await createPracticeSession(userId) }, { status: 201 });
});
