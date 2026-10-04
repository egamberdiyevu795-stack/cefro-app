import "server-only";
import { getEnv } from "@/server/config/env";
import { PROCESSING_STALE_AFTER_MS, UPLOAD_STALE_AFTER_MS } from "@/server/attempts/attempt-views";
import * as repo from "@/server/attempts/attempt-repository";
import { HttpError } from "@/server/errors";
import { logger } from "@/server/logging/logger";

/**
 * Server-enforced protection against cost amplification. Every limit is evaluated from the database
 * (never from anything the client sends) before audio is stored or a provider is called.
 *
 * Stable error codes (HTTP 429 unless noted), shown to students as plain-language messages:
 *   too_many_in_progress   several answers are still being processed
 *   hourly_limit_reached   too many submissions in the last hour
 *   daily_limit_reached    too many submissions in the last 24 hours
 *   capacity_reached       (503) the whole service is at its hourly ceiling
 *   restart_limit_reached  this attempt has used all of its processing runs
 *
 * The per-user limits key on the user id, which for anonymous users is a cookie the client can
 * discard; the global ceiling is the identity-independent backstop. Rationale and tuning:
 * docs/ARCHITECTURE_DECISIONS.md.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export async function assertCanSubmitAttempt(userId: string, now = Date.now()): Promise<void> {
  const env = getEnv();

  const inProgress = await repo.countInProgressAttempts(
    userId,
    new Date(now - PROCESSING_STALE_AFTER_MS).toISOString(),
    new Date(now - UPLOAD_STALE_AFTER_MS).toISOString(),
  );
  if (inProgress >= env.LIMIT_CONCURRENT_PROCESSING_PER_USER) {
    throw new HttpError(429, "too_many_in_progress", "Your earlier answers are still being checked. Please wait for the feedback, then try again.", 30);
  }

  const lastHour = await repo.countAttemptsSince(userId, new Date(now - HOUR_MS).toISOString());
  if (lastHour >= env.LIMIT_ATTEMPTS_PER_USER_HOUR) {
    throw new HttpError(429, "hourly_limit_reached", "You've sent a lot of answers in the last hour. Take a break and try again a little later.", 600);
  }
  const lastDay = await repo.countAttemptsSince(userId, new Date(now - DAY_MS).toISOString());
  if (lastDay >= env.LIMIT_ATTEMPTS_PER_USER_DAY) {
    throw new HttpError(429, "daily_limit_reached", "You've reached today's practice limit. Please come back tomorrow.", 3600);
  }

  const everyone = await repo.countAttemptsSince(null, new Date(now - HOUR_MS).toISOString());
  if (everyone >= env.LIMIT_ATTEMPTS_GLOBAL_HOUR) {
    logger.warn("Global hourly attempt ceiling reached", { limit: env.LIMIT_ATTEMPTS_GLOBAL_HOUR });
    throw new HttpError(503, "capacity_reached", "CEFRO is very busy right now. Please try again in a few minutes.", 300);
  }
}

/** A failed or stalled attempt may be restarted only while it has processing runs left. */
export function assertCanRestart(attempt: { processingRuns: number }): void {
  if (attempt.processingRuns >= getEnv().LIMIT_PROCESSING_RUNS_PER_ATTEMPT) {
    throw new HttpError(
      429,
      "restart_limit_reached",
      "We've already tried to check this answer several times. Please record a new answer instead.",
    );
  }
}
