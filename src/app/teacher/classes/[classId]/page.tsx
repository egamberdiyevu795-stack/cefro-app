import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import type { ClassMockSummary } from "@/features/exam-laptop/ClassMocksCard";
import { teacherLinks } from "@/features/teacher/links";
import { ClassOverview } from "@/features/teacher/sections";
import { commonProblems, studentRow, type SharedStudent } from "@/features/teacher/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, DEMO_CLASS_MOCK, demoClassStudents } from "@/server/demo/demo-teacher";
import { classMockSummaries } from "@/server/exam-laptop/exam-store";
import { formatDate } from "@/features/history/view-model";
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
  let classMocks: ClassMockSummary[];
  if (page.mock) {
    if (classId !== DEMO_CLASS.id) notFound();
    cls = DEMO_CLASS;
    const now = new Date();
    students = await demoClassStudents(now);
    // The demo class mock "Mock 3": two of the six students have a finished mock in it.
    classMocks = [{ id: DEMO_CLASS_MOCK.id, title: DEMO_CLASS_MOCK.title, date: formatDate(new Date(now.getTime() - DEMO_CLASS_MOCK.daysAgo * 86_400_000).toISOString()), finished: 2, total: students.length, closed: false }];
  } else {
    ({ cls, students } = await orNotFound(classWithStudents(page.teacherId, classId)));
    classMocks = await orNotFound(classMockSummaries(page.teacherId, classId));
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
        classMocks={classMocks}
        href={{
          examStart: page.href(teacherLinks.examStart(cls.id)),
          examResults: (classMockId) => page.href(teacherLinks.examResults(cls.id, classMockId)),
          student: (memberId) => page.href(teacherLinks.student(cls.id, memberId)),
          lesson: (slug) => page.href(teacherLinks.lesson(cls.id, slug)),
          afterClose: page.href(teacherLinks.home),
        }}
        demo={page.mock}
      />
    </AppShell>
  );
}
