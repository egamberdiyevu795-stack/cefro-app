import { placeOfMock } from "@/domain/teacher/exam-laptop";
import "server-only";
import { desc, inArray } from "drizzle-orm";
import { getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { toPublicTask } from "@/domain/speaking/task";
import { NOT_DONE_PART, part3Source, realLinks, speakingPartSource, teacherRatingOf, type MockPartSource, type MockResultSource, type PartTeacherRating } from "@/features/mock-result/part-source";
import { part3RealPracticeHref } from "@/features/part3/links";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { getDb } from "@/server/db/client";
import { teacherRatings } from "@/server/db/schema";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { teacherLevelOfOwnMock } from "@/server/teacher/student-view";
import { getMock } from "./mock-service";

/*
 * The mock result (docs/v1-plan.md, step 4) on the server: the caller's own mock with each part read the way its own result
 * page reads it. Every read starts from `getMock(userId, …)`, which is the owner check (someone else's mock, a single-task
 * session and a malformed id are all the same 404), and each attempt is then loaded through `getAttemptViewForUser` with the
 * same user id, so no row of another student can reach the result.
 */

/**
 * The teacher's level per attempt, for the attempts of the caller's own mock only (the ids come from `getMock`). Empty until a
 * teacher rates something (teacher mode is off; the teacher screens that write ratings arrive with step 6). Several teachers: the
 * newest rating of an attempt wins. Read-only: nothing here writes, and the app's own scoring never reads it.
 */
async function teacherRatingsFor(attemptIds: readonly string[], bandsOf: (attemptId: string) => readonly { band: number; label: string }[]): Promise<Map<string, PartTeacherRating>> {
  const found = new Map<string, PartTeacherRating>();
  if (attemptIds.length === 0) return found;
  const db = await getDb();
  const rows = await db.select().from(teacherRatings).where(inArray(teacherRatings.attemptId, [...attemptIds])).orderBy(desc(teacherRatings.updatedAt)).all();
  for (const row of rows) {
    if (found.has(row.attemptId)) continue;
    const rating = teacherRatingOf(row, bandsOf(row.attemptId));
    if (rating) found.set(row.attemptId, rating);
  }
  return found;
}

/** A task's band labels from its rubric (Part 3 uses its own), `[]` for an unknown task. */
export function bandLabelsForTask(taskId: string): { band: number; label: string }[] {
  const argument = getArgumentTask(taskId);
  if (argument) return getArgumentRubric(argument).config.bands.map(({ band, label }) => ({ band, label }));
  const task = getSpeakingTask(taskId);
  return task ? getSpeakingRubric(task).config.bands.map(({ band, label }) => ({ band, label })) : [];
}

/** The caller's own mock as the result page reads it. 404 (`mock_not_found`) for anyone else's. */
export async function getMockResult(userId: string, mockId: string, now = Date.now()): Promise<MockResultSource> {
  const mock = await getMock(userId, mockId, now);
  const attempts = new Map(
    await Promise.all(
      mock.parts.flatMap((p) => (p.attemptId ? [getAttemptViewForUser(userId, p.attemptId).then((view) => [p.part, view] as const)] : [])),
    ),
  );

  const bandLabelsOf = bandLabelsForTask;
  const taskOf = new Map([...attempts.values()].map((a) => [a.id, a.taskId]));
  const ratings = await teacherRatingsFor([...taskOf.keys()], (attemptId) => bandLabelsOf(taskOf.get(attemptId) ?? ""));

  const parts: MockPartSource[] = mock.parts.map((p): MockPartSource => {
    const attempt = attempts.get(p.part);
    if (!attempt) return NOT_DONE_PART(p.part);
    const teacher = ratings.get(attempt.id) ?? null;
    const argument = getArgumentTask(attempt.taskId);
    if (argument) {
      return part3Source(attempt, {
        task: toPublicArgumentTask(argument),
        links: realLinks(attempt.id, part3RealPracticeHref(argument.id, { retry: attempt.id })),
        teacher,
      });
    }
    const task = getSpeakingTask(attempt.taskId);
    if (!task) return { ...NOT_DONE_PART(p.part), attemptId: attempt.id, detailHref: `/result/${encodeURIComponent(attempt.id)}`, state: "not_scored", reason: "failed" };
    return speakingPartSource(p.part, attempt, {
      task: toPublicTask(task),
      bandLabels: bandLabelsOf(task.id),
      links: realLinks(attempt.id, practiceHref(task.id, { retry: attempt.id })),
      teacher,
    });
  });

  return { id: mock.id, status: mock.status, createdAt: mock.createdAt, finishedAt: mock.finishedAt, parts, teacherLevel: await teacherLevelOfOwnMock(mock.id), place: placeOfMock(mock.classMockId) };
}
