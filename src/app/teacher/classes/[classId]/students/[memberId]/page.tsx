import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { teacherLinks } from "@/features/teacher/links";
import { StudentView } from "@/features/teacher/sections";
import { studentDetail, type SharedStudent } from "@/features/teacher/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, demoClassStudents } from "@/server/demo/demo-teacher";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { studentInClass } from "@/server/teacher/teacher-service";

export const metadata: Metadata = { title: "Student" };

/**
 * T4 Student: the shown name, current level and skills (shared attempts only), shared attempts newest first, the
 * black "Open latest attempt", and a quiet Remove from class (confirm card). Its class's teacher only.
 */
export default async function StudentPage(props: PageProps<"/teacher/classes/[classId]/students/[memberId]">) {
  await connection();
  const [{ classId, memberId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let student: SharedStudent | undefined;
  if (page.mock) {
    if (classId !== DEMO_CLASS.id) notFound();
    student = (await demoClassStudents(new Date())).find((s) => s.memberId === memberId);
    if (!student) notFound();
  } else {
    ({ student } = await orNotFound(studentInClass(page.teacherId, classId, memberId)));
  }

  const detail = studentDetail(student);
  const classHref = page.href(teacherLinks.cls(classId));
  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: classHref, label: "Class" }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      <StudentView
        detail={detail}
        classId={classId}
        memberId={memberId}
        latestHref={detail.latestId ? page.href(teacherLinks.attempt(classId, detail.latestId)) : null}
        attemptHref={(id) => page.href(teacherLinks.attempt(classId, id))}
        afterRemove={classHref}
        demo={page.mock}
      />
    </AppShell>
  );
}
