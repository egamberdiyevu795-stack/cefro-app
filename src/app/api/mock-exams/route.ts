import { fullMockLive } from "@/config/features";
import { assertCanRecord } from "@/server/consent/consent";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";
import { startOrResumeMock } from "@/server/sessions/mock-service";

/** A mock is about 15 minutes; a few starts an hour is plenty (a second start while one is open returns that one). */
const limiter = new FixedWindowLimiter(10, 60 * 60 * 1000);

/**
 * Start a full mock exam for the current user, or return the one already in progress (`resumed: true`, "Continue your
 * mock"). 404 until all four parts are live. Pilot consent (CONSENT_REQUIRED) locks it like every recording: 403
 * `consent_required`, before anything is created.
 */
export const POST = withErrorHandling(async () => {
  if (!fullMockLive()) throw new HttpError(404, "not_found", "This page could not be found.");
  const userId = await getOrCreateCurrentUserId();
  await assertCanRecord(userId);
  const verdict = limiter.hit(userId);
  if (!verdict.allowed) {
    throw new HttpError(429, "mock_rate_limited", "Too many mock exams started. Please try again later.", verdict.retryAfterSeconds);
  }
  const { mock, resumed } = await startOrResumeMock(userId);
  return Response.json({ mock, resumed }, { status: resumed ? 200 : 201 });
});
