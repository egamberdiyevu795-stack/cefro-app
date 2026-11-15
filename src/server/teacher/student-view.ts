import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { teacherMockRatings, teacherRatings } from "@/server/db/schema";
import { teacherRatingOf, type PartTeacherRating } from "@/features/mock-result/part-source";
import type { EstimatedLevel } from "@/domain/speaking/mock-level";
import { isMockLevel } from "@/domain/teacher/rules";

/*
 * What a STUDENT sees of their teacher's level (docs/v1-plan.md, decision Q6): "Your teacher: B2" next to CEFRO's level,
 * never instead of it. Read-only; the callers have already checked that the attempt or mock is the caller's own (the
 * result page and `getMock` do), and the rating of a membership that ended is already gone (Leave / Remove / Close delete
 * it). The newest rating wins when two teachers rated. Nothing here reads a teacher's name, class or email.
 */

/** The level the teacher gave this attempt of the caller's own, with the part's band labels; null when not rated. */
export async function teacherLevelOfOwnAttempt(attemptId: string, bandLabels: readonly { band: number; label: string }[]): Promise<PartTeacherRating | null> {
  const row = await (await getDb())
    .select()
    .from(teacherRatings)
    .where(eq(teacherRatings.attemptId, attemptId))
    .orderBy(desc(teacherRatings.updatedAt))
    .limit(1)
    .get();
  return row ? teacherRatingOf(row, bandLabels) : null;
}

/** The level the teacher gave the caller's own whole mock ("Agree" counts as the estimate they agreed with); null when not rated. */
export async function teacherLevelOfOwnMock(sessionId: string): Promise<EstimatedLevel | null> {
  const row = await (await getDb())
    .select()
    .from(teacherMockRatings)
    .where(and(eq(teacherMockRatings.sessionId, sessionId)))
    .orderBy(desc(teacherMockRatings.updatedAt))
    .limit(1)
    .get();
  if (!row) return null;
  const level = row.agrees ? row.appLevel : row.teacherLevel;
  return isMockLevel(level) ? level : null;
}
