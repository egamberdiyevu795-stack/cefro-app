import { lessonT1 } from "./l-t1-answer-every-question";
import { lessonT4B2 } from "./l-t4-answer-reason-example-b2";
import { lessonT8 } from "./l-t8-picture-is-not-the-question";
import type { Lesson } from "./types";

export type { Lesson, LessonBlock, LessonExample, LessonStatus } from "./types";

/**
 * Every lesson in the app, drafts included. Pages never read this list directly: they use `shownLessons` /
 * `getShownLesson`, which only ever return approved lessons (teaching plan, decision 7).
 */
export const ALL_LESSONS: readonly Lesson[] = [lessonT1, lessonT8, lessonT4B2];

/** Approved: the owner reviewed it (status "approved", with a reviewer and a date). Anything else is never shown. */
export function isApproved(lesson: Lesson): boolean {
  return lesson.status === "approved" && Boolean(lesson.reviewedBy) && Boolean(lesson.reviewedAt);
}

/** The lessons a student may see. */
export function shownLessons(lessons: readonly Lesson[] = ALL_LESSONS): Lesson[] {
  return lessons.filter(isApproved);
}

/** An approved lesson by its address slug, or undefined (unknown, or not approved). */
export function getShownLesson(slug: string, lessons: readonly Lesson[] = ALL_LESSONS): Lesson | undefined {
  return shownLessons(lessons).find((lesson) => lesson.slug === slug);
}
