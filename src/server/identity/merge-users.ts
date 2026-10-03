import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts, users } from "@/server/db/schema";

/**
 * Identity boundary for future accounts (no login exists yet; see docs/ARCHITECTURE_DECISIONS.md).
 *
 * `users.id` is the one canonical identity that every other table points at. An anonymous visitor
 * is a `users` row whose id lives in a cookie. When a visitor later signs in, their anonymous
 * history is attached to the account's user with `mergeUsers`, and the anonymous row is kept as a
 * tombstone (`merged_into_user_id`) so any browser still holding its cookie resolves to the account.
 */

/** Follow `merged_into_user_id` to the surviving user. Unknown ids resolve to themselves. */
export function resolveCanonicalUserId(db: Db, userId: string): string {
  let current = userId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const row = db.select({ next: users.mergedIntoUserId }).from(users).where(eq(users.id, current)).get();
    if (!row?.next) return current;
    current = row.next;
  }
  throw new Error(`Identity merge cycle detected at ${current}`); // cannot happen via mergeUsers
}

export interface MergeResult {
  attemptsMoved: number;
  sessionsMoved: number;
}

/**
 * Move everything owned by `fromUserId` onto `intoUserId` in one transaction.
 *
 * - Both users must exist, differ, and be canonical (not already merged); only anonymous users can be merged away.
 * - Attempt numbers are unique per (user, task), so two histories for the same task would collide. They are
 *   merged into one sequence per task, ordered by when the attempts were made (ties by id), so numbers stay
 *   1..n without gaps. Retry links (`previous_attempt_id`) are by id and are untouched.
 * - Audio keys embed the old user id but are stored per recording, so no file moves.
 * - Analytics rows are re-attributed so the person's history is continuous.
 */
export function mergeUsers(db: Db, input: { fromUserId: string; intoUserId: string }): MergeResult {
  const { fromUserId, intoUserId } = input;
  if (fromUserId === intoUserId) throw new Error("Cannot merge a user into itself");

  return db.transaction((tx) => {
    const from = tx.select().from(users).where(eq(users.id, fromUserId)).get();
    const into = tx.select().from(users).where(eq(users.id, intoUserId)).get();
    if (!from || !into) throw new Error("Both users must exist to be merged");
    if (from.mergedIntoUserId) throw new Error("The source user was already merged");
    if (into.mergedIntoUserId) throw new Error("The target user was merged into another user; merge into that one");
    if (from.kind !== "anonymous") throw new Error("Only an anonymous user can be merged into another user");

    // 1. Park the incoming attempts on negative numbers so the move cannot collide with existing ones.
    tx.update(speakingAttempts)
      .set({ attemptNumber: sql`-${speakingAttempts.attemptNumber}` })
      .where(eq(speakingAttempts.userId, fromUserId))
      .run();
    const attemptsMoved = tx
      .update(speakingAttempts)
      .set({ userId: intoUserId })
      .where(eq(speakingAttempts.userId, fromUserId))
      .run().changes;
    const sessionsMoved = tx
      .update(practiceSessions)
      .set({ userId: intoUserId })
      .where(eq(practiceSessions.userId, fromUserId))
      .run().changes;
    tx.update(analyticsEvents).set({ userId: intoUserId }).where(eq(analyticsEvents.userId, fromUserId)).run();

    // 2. One sequence per task: first to temporary distinct negatives, then to the final 1..n.
    const taskIds = tx
      .selectDistinct({ taskId: speakingAttempts.taskId })
      .from(speakingAttempts)
      .where(eq(speakingAttempts.userId, intoUserId))
      .all()
      .map((row) => row.taskId);
    for (const taskId of taskIds) {
      const ordered = tx
        .select({ id: speakingAttempts.id })
        .from(speakingAttempts)
        .where(and(eq(speakingAttempts.userId, intoUserId), eq(speakingAttempts.taskId, taskId)))
        .orderBy(asc(speakingAttempts.createdAt), asc(speakingAttempts.id))
        .all();
      ordered.forEach((row, i) =>
        tx.update(speakingAttempts).set({ attemptNumber: -(1_000_000 + i) }).where(eq(speakingAttempts.id, row.id)).run(),
      );
      ordered.forEach((row, i) =>
        tx.update(speakingAttempts).set({ attemptNumber: i + 1 }).where(eq(speakingAttempts.id, row.id)).run(),
      );
    }

    // 3. Leave a tombstone so a browser holding the old cookie keeps resolving to the survivor.
    tx.update(users).set({ mergedIntoUserId: intoUserId }).where(eq(users.id, fromUserId)).run();
    return { attemptsMoved, sessionsMoved };
  });
}
