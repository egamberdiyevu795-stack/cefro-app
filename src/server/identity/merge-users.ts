import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts, users } from "@/server/db/schema";

/**
 * Identity boundary (see docs/ARCHITECTURE_DECISIONS.md, "Identity and accounts").
 *
 * `users.id` is the one canonical identity that every other table points at. An anonymous visitor is a
 * `users` row whose id lives in a cookie; an account is a `users` row with credentials. When a visitor signs up or
 * signs in, their anonymous history is attached to the account's user with `mergeUsers`, and the anonymous row is
 * kept as a tombstone (`merged_into_user_id`) for lineage and so that a retried merge is a no-op.
 *
 * A tombstone is NOT a way to reach the account: an old anonymous cookie is a low-trust bearer credential and must
 * never resolve to the account's data (see current-user.ts). `resolveCanonicalUserId` exists for operations that
 * hold a user id from a trusted source (e.g. support tooling, merge idempotency), not for cookies.
 */

/** Follow `merged_into_user_id` to the surviving user. Unknown ids resolve to themselves. */
export async function resolveCanonicalUserId(db: Db, userId: string): Promise<string> {
  let current = userId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const row = await db.select({ next: users.mergedIntoUserId }).from(users).where(eq(users.id, current)).get();
    if (!row?.next) return current;
    current = row.next;
  }
  throw new Error(`Identity merge cycle detected at ${current}`); // cannot happen via mergeUsers
}

export interface MergeResult {
  attemptsMoved: number;
  sessionsMoved: number;
  /** True when this exact merge had already been done: nothing was changed (safe retry). */
  alreadyMerged?: boolean;
}

/**
 * Move everything owned by `fromUserId` onto `intoUserId` in one transaction.
 *
 * - Both users must exist, differ, and the target must be canonical; only anonymous users can be merged away.
 * - Idempotent: merging a user that was already merged into the SAME target changes nothing and reports
 *   `alreadyMerged`. Merging it into a different target is an error.
 * - Attempt numbers are unique per (user, task), so two histories for the same task would collide. They are
 *   merged into one sequence per task, ordered by when the attempts were made (ties by id), so numbers stay
 *   1..n without gaps. Retry links (`previous_attempt_id`) are by id and are untouched.
 * - Audio keys embed the old user id but are stored per recording, so no file moves.
 * - Analytics rows are re-attributed so the person's history is continuous.
 */
export async function mergeUsers(db: Db, input: { fromUserId: string; intoUserId: string }): Promise<MergeResult> {
  const { fromUserId, intoUserId } = input;
  if (fromUserId === intoUserId) throw new Error("Cannot merge a user into itself");

  return db.transaction(async (tx) => {
    const from = await tx.select().from(users).where(eq(users.id, fromUserId)).get();
    const into = await tx.select().from(users).where(eq(users.id, intoUserId)).get();
    if (!from || !into) throw new Error("Both users must exist to be merged");
    if (from.mergedIntoUserId === intoUserId) return { attemptsMoved: 0, sessionsMoved: 0, alreadyMerged: true };
    if (from.mergedIntoUserId) throw new Error("The source user was already merged into a different user");
    if (into.mergedIntoUserId) throw new Error("The target user was merged into another user; merge into that one");
    if (from.kind !== "anonymous") throw new Error("Only an anonymous user can be merged into another user");

    // 1. Park the incoming attempts on negative numbers so the move cannot collide with existing ones.
    await tx
      .update(speakingAttempts)
      .set({ attemptNumber: sql`-${speakingAttempts.attemptNumber}` })
      .where(eq(speakingAttempts.userId, fromUserId))
      .run();
    const attemptsMoved = (
      await tx.update(speakingAttempts).set({ userId: intoUserId }).where(eq(speakingAttempts.userId, fromUserId)).run()
    ).rowsAffected;
    const sessionsMoved = (
      await tx.update(practiceSessions).set({ userId: intoUserId }).where(eq(practiceSessions.userId, fromUserId)).run()
    ).rowsAffected;
    await tx.update(analyticsEvents).set({ userId: intoUserId }).where(eq(analyticsEvents.userId, fromUserId)).run();

    // 2. One sequence per task: first to temporary distinct negatives, then to the final 1..n.
    const taskIds = (
      await tx
        .selectDistinct({ taskId: speakingAttempts.taskId })
        .from(speakingAttempts)
        .where(eq(speakingAttempts.userId, intoUserId))
        .all()
    ).map((row) => row.taskId);
    for (const taskId of taskIds) {
      const ordered = await tx
        .select({ id: speakingAttempts.id })
        .from(speakingAttempts)
        .where(and(eq(speakingAttempts.userId, intoUserId), eq(speakingAttempts.taskId, taskId)))
        .orderBy(asc(speakingAttempts.createdAt), asc(speakingAttempts.id))
        .all();
      for (const [i, row] of ordered.entries()) {
        await tx.update(speakingAttempts).set({ attemptNumber: -(1_000_000 + i) }).where(eq(speakingAttempts.id, row.id)).run();
      }
      for (const [i, row] of ordered.entries()) {
        await tx.update(speakingAttempts).set({ attemptNumber: i + 1 }).where(eq(speakingAttempts.id, row.id)).run();
      }
    }

    // 3. Leave a tombstone so a browser holding the old cookie keeps resolving to the survivor.
    await tx.update(users).set({ mergedIntoUserId: intoUserId }).where(eq(users.id, fromUserId)).run();
    return { attemptsMoved, sessionsMoved };
  });
}
