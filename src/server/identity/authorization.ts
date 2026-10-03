import "server-only";
import { HttpError } from "@/server/errors";

/**
 * Ownership checks, in one place. Every user-owned resource (attempt, recording, session, analytics row) records the
 * canonical `userId` that owns it, and access means: the caller's canonical user id (from current-user.ts) equals
 * it. A resource that belongs to someone else is reported exactly like one that does not exist, so ids cannot be
 * probed. Future roles (teachers, organisations) must extend this module rather than add inline comparisons.
 */
export function ownsResource(callerUserId: string, resource: { userId: string } | null | undefined): boolean {
  return Boolean(resource) && resource!.userId === callerUserId;
}

/** Returns the resource if the caller owns it; otherwise throws `notFound()` (never a 403, never a hint that it exists). */
export function assertOwnedOrNotFound<T extends { userId: string }>(
  callerUserId: string,
  resource: T | null | undefined,
  notFound: () => HttpError,
): T {
  if (!ownsResource(callerUserId, resource)) throw notFound();
  return resource as T;
}
