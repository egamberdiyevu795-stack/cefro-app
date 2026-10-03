import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { logger } from "@/server/logging/logger";
import { mergeUsers, type MergeResult } from "./merge-users";
import { isValidUserId } from "./user-cookie";

/**
 * Attach the anonymous identity held in a browser cookie to the account that just authenticated.
 *
 * Trust rules (enforced here, not by callers):
 *  - the anonymous id comes ONLY from the request's anonymous cookie, never from a body or query;
 *  - it must be a well-formed id of an ACTIVE anonymous user (not a registered user, not already merged);
 *  - the account id is the one the auth library just authenticated.
 * Anything else is ignored silently: a stale or foreign cookie must never turn a login into a merge.
 * Returns what was moved, or null when there was nothing to convert. Safe to retry.
 */
export function mergeAnonymousCookieIdentity(
  db: Db,
  input: { anonymousUserId: string; accountUserId: string },
): MergeResult | null {
  const { anonymousUserId, accountUserId } = input;
  if (!isValidUserId(anonymousUserId) || anonymousUserId === accountUserId) return null;

  const anonymous = db
    .select({ id: users.id, mergedInto: users.mergedIntoUserId })
    .from(users)
    .where(and(eq(users.id, anonymousUserId), eq(users.kind, "anonymous")))
    .get();
  if (!anonymous) return null; // unknown id, or an account id presented through the anonymous cookie
  if (anonymous.mergedInto === accountUserId) return null; // already converted (a retried login)
  if (anonymous.mergedInto) return null; // belongs to some other account's history: leave it alone

  const result = mergeUsers(db, { fromUserId: anonymousUserId, intoUserId: accountUserId });
  logger.info("Anonymous identity attached to account", { attemptsMoved: result.attemptsMoved, sessionsMoved: result.sessionsMoved });
  return result;
}
