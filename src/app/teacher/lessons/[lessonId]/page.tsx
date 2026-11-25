import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { getShownLesson } from "@/content/lessons";
import { TeacherLessonView } from "@/features/lessons/LessonView";
import { teacherLinks } from "@/features/teacher/links";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS } from "@/server/demo/demo-teacher";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { ownOpenClass } from "@/server/teacher/teacher-store";

export async function generateMetadata(props: PageProps<"/teacher/lessons/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await props.params;
  return { title: getShownLesson(lessonId)?.title ?? "Lesson" };
}

/**
 * An approved lesson, read-only, opened from a class's "Most common problems" (`?class=<id>` for the way back). Only
 * approved lessons exist here (`getShownLesson`); teachers only, 404 otherwise.
 */
export default async function TeacherLessonPage(props: PageProps<"/teacher/lessons/[lessonId]">) {
  await connection();
  const [{ lessonId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);
  const lesson = getShownLesson(lessonId);
  const classId = typeof query.class === "string" ? query.class : null;
  if (!lesson || !classId) notFound();
  if (page.mock ? classId !== DEMO_CLASS.id : !(await orNotFound(ownOpenClass(page.teacherId, classId)))) notFound();
  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/lessons" demoTeacher={page.mock} back={false}>
      <TeacherLessonView lesson={lesson} backHref={page.href(teacherLinks.cls(classId))} demo={page.mock} />
    </AppShell>
  );
}
