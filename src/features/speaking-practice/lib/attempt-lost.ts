import { ApiError } from "./api-client";

/**
 * How many "not found" answers in a row mean the attempt is really gone (not a one-off blip), so polling
 * stops and the student is told instead of watching a spinner forever. Polls are about a second apart.
 */
export const LOST_AFTER_NOT_FOUND = 3;

/** The server answered, and its answer was "this attempt does not exist (for you)". */
export function isAttemptNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" && error.status === 404;
}

/**
 * The running count of consecutive "not found" answers after one poll. A successful poll resets it; a network
 * error or a temporary server error says nothing about whether the attempt exists, so it leaves the count as is.
 */
export function nextNotFoundCount(previous: number, outcome: { ok: true } | { ok: false; error: unknown }): number {
  if (outcome.ok) return 0;
  return isAttemptNotFound(outcome.error) ? previous + 1 : previous;
}
