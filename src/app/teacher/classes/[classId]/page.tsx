import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { teacherLinks } from "@/features/teacher/links";
import { ClassOverview } from "@/features/teacher/sections";
import { commonProblems, studentRow, type SharedStudent } from "@/features/teacher/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, demoClassStudents } from "@/server/demo/demo-teacher";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { classWithStudents } from "@/server/teacher/teacher-service";

export const metadata: Metadata = { title: "Class" };

/**
 * T3 Class overview: the join code (black "Copy join code", quiet Reset code), the most common problems (top 3
 * biggest fixes, once per student, from their latest shared scored attempt, each with its approved lesson), the
 * students, and a quiet Close class (confirm card). Its own teacher only; dynamic, the access check on every request.
 */
export default async function ClassPage(props: PageProps<"/teacher/classes/[classId]">) {
  await connection();
  const [{ classId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let cls: { id: string; name: string; joinCode: string };
  let students: SharedStudent[];
  if (page.mock) {
    if (classId !== DEMO_CLASS.id) notFound();
    cls = DEMO_CLASS;
    students = await demoClassStudents(new Date());
  } else {
    ({ cls, students } = await orNotFound(classWithStudents(page.teacherId, classId)));
  }

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: page.href(teacherLinks.home), label: "Home" }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      <ClassOverview
        classId={cls.id}
        name={cls.name}
        joinCode={cls.joinCode}
        problems={commonProblems(students)}
        students={students.map(studentRow)}
        href={{
          student: (memberId) => page.href(teacherLinks.student(cls.id, memberId)),
          lesson: (slug) => page.href(teacherLinks.lesson(cls.id, slug)),
          afterClose: page.href(teacherLinks.home),
        }}
        demo={page.mock}
      />
    </AppShell>
  );
}
