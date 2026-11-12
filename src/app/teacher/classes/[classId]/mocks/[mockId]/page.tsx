import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { teacherLinks } from "@/features/teacher/links";
import { TeacherMock } from "@/features/teacher/MockView";
import type { TeacherMockView } from "@/features/teacher/mock-view";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS } from "@/server/demo/demo-teacher";
import { demoMockOwner } from "@/server/demo/demo-teacher";
import { demoTeacherMock } from "@/server/demo/demo-mock";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { teacherMock } from "@/server/teacher/teacher-service";

export const metadata: Metadata = { title: "Mock" };

/**
 * T6 Student's mock: estimated level, date and Finished / Not finished; four part cards (player, transcript with its
 * sentences to improve, CEFRO's band, Agree / Choose level per part, all grey); the optional level for the whole mock.
 * No black button. Only when `teacherCanSeeMock` passes through this class (404 otherwise); dynamic, checked on every request.
 */
export default async function TeacherMockPage(props: PageProps<"/teacher/classes/[classId]/mocks/[mockId]">) {
  await connection();
  const [{ classId, mockId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let mock: TeacherMockView | null;
  if (page.mock) {
    const owner = classId === DEMO_CLASS.id ? demoMockOwner(mockId) : null;
    mock = owner ? await demoTeacherMock(mockId, { classId, ...owner }) : null;
    if (!mock) notFound();
  } else {
    mock = await orNotFound(teacherMock(page.teacherId, classId, mockId));
  }

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: page.href(teacherLinks.student(classId, mock.memberId)), label: mock.studentName }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      <TeacherMock
        mock={mock}
        demo={page.mock}
        ratingUrl={(attemptId) => `/api/teacher/classes/${encodeURIComponent(classId)}/attempts/${encodeURIComponent(attemptId)}/rating`}
        mockRatingUrl={`/api/teacher/classes/${encodeURIComponent(classId)}/mocks/${encodeURIComponent(mockId)}/rating`}
      />
    </AppShell>
  );
}
