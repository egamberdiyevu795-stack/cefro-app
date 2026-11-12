import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { ResultsView } from "@/features/exam-laptop/ResultsView";
import { mockProblems, resultRow } from "@/features/exam-laptop/results-view";
import { formatDate } from "@/features/history/view-model";
import { teacherLinks } from "@/features/teacher/links";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, DEMO_CLASS_MOCK, demoClassStudents } from "@/server/demo/demo-teacher";
import { classMockResults } from "@/server/exam-laptop/results";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";

export const metadata: Metadata = { title: "Class mock results" };

/**
 * T8 Class mock: results. One row per student (level, part bands, "Listen" to T6), sorted by level, the common problems of this
 * mock, and the black "Open first unrated". Its own teacher only. `?mock=1`: the demo class mock "Mock 3".
 */
export default async function ClassMockResultsPage(props: PageProps<"/teacher/classes/[classId]/exam/[classMockId]">) {
  await connection();
  const [{ classId, classMockId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let data: { title: string; className: string; date: string; closed: boolean; rows: Parameters<typeof ResultsView>[0]["rows"]; problems: Parameters<typeof ResultsView>[0]["problems"] };
  if (page.mock) {
    if (classId !== DEMO_CLASS.id || classMockId !== DEMO_CLASS_MOCK.id) notFound();
    const now = new Date();
    const students = await demoClassStudents(now);
    data = {
      title: DEMO_CLASS_MOCK.title,
      className: DEMO_CLASS.name,
      date: formatDate(new Date(now.getTime() - DEMO_CLASS_MOCK.daysAgo * 86_400_000).toISOString()),
      closed: false,
      rows: students.map((s) => resultRow(s, classMockId, { mock: false, ratedParts: 0 })),
      problems: mockProblems(students, classMockId),
    };
  } else {
    const results = await orNotFound(classMockResults(page.teacherId, classId, classMockId));
    data = { title: results.classMock.title, className: results.className, date: formatDate(results.classMock.openedAt), closed: results.classMock.closed, rows: results.rows, problems: results.problems };
  }

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: page.href(teacherLinks.cls(classId)), label: data.className }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      <ResultsView
        {...data}
        classId={classId}
        mock={page.mock}
      />
    </AppShell>
  );
}
