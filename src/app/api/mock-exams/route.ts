import { fullMockLive } from "@/config/features";
import { assertCanRecord } from "@/server/consent/consent";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { actingUser } from "@/server/exam-laptop/acting-user";
import { startPassMock } from "@/server/exam-laptop/exam-store";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";
import { startOrResumeMock } from "@/server/sessions/mock-service";

/** A mock is about 15 minutes; a few starts an hour is plenty (a second start while one is open returns that one). */
const limiter = new FixedWindowLimiter(10, 60 * 60 * 1000);

/**
 * Start a full mock exam for the current user, or return the one already in progress (`resumed: true`, "Continue your
 * mock"). With an exam laptop's one-mock pass it starts (or resumes) the pass's student's mock for that class mock ("In class").
 * 404 until all four parts are live. Pilot consent (CONSENT_REQUIRED) locks it like every recording: 403
 * `consent_required`, before anything is created.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (!fullMockLive()) throw new HttpError(404, "not_found", "This page could not be found.");
  // With an exam laptop's pass this is the STUDENT (their consent check, their mock); without one, the caller as always.
  const { userId, pass } = await actingUser(request);
  await assertCanRecord(userId);
  const verdict = limiter.hit(userId);
  if (!verdict.allowed) {
    throw new HttpError(429, "mock_rate_limited", "Too many mock exams started. Please try again later.", verdict.retryAfterSeconds);
  }
  const { mock, resumed } = pass ? await startPassMock(pass) : await startOrResumeMock(userId);
  return Response.json({ mock, resumed }, { status: resumed ? 200 : 201 });
});
