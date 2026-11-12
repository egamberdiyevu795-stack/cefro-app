import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { MOCK_PARTS, pickTaskForPart } from "@/domain/speaking/full-mock";
import { getAnySpeakingTask } from "@/content/speaking";
import { StartExam } from "@/features/exam-laptop/StartExam";
import { teacherLinks } from "@/features/teacher/links";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, DEMO_CLASS_MOCK } from "@/server/demo/demo-teacher";
import { openClassMockOf, suggestPaper, toClassMockView } from "@/server/exam-laptop/exam-store";
import { mockTasksForPart } from "@/server/sessions/mock-service";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { ownOpenClass } from "@/server/teacher/teacher-store";

export const metadata: Metadata = { title: "Start exam laptop" };

/**
 * "Start exam laptop": choose the paper, name this laptop, then T7. If another laptop already opened the class's mock, this one
 * joins it. Its own teacher only. `?mock=1`: the demo class; nothing is stored.
 */
export default async function StartExamPage(props: PageProps<"/teacher/classes/[classId]/exam">) {
  await connection();
  const [{ classId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let className: string;
  let open: Parameters<typeof StartExam>[0]["open"] = null;
  let suggestion: Parameters<typeof StartExam>[0]["suggestion"];
  if (page.mock) {
    if (classId !== DEMO_CLASS.id) notFound();
    className = DEMO_CLASS.name;
    suggestion = MOCK_PARTS.flatMap((part) => {
      const pick = pickTaskForPart(mockTasksForPart(part), [], () => 0);
      return pick ? [{ part, taskId: pick.id, title: getAnySpeakingTask(pick.id)?.title ?? pick.title }] : [];
    });
  } else {
    className = (await orNotFound(ownOpenClass(page.teacherId, classId))).name;
    const row = await openClassMockOf(classId);
    const view = row ? toClassMockView(row) : null;
    open = view ? { id: view.id, title: view.title, paper: view.paper?.map(({ part, title }) => ({ part, title })) ?? null } : null;
    suggestion = open ? [] : await orNotFound(suggestPaper(page.teacherId, classId));
  }

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: page.href(teacherLinks.cls(classId)), label: className }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      <StartExam
        classId={classId}
        className={className}
        open={open}
        suggestion={suggestion}
        demo={page.mock}
        demoClassMockId={DEMO_CLASS_MOCK.id}
      />
    </AppShell>
  );
}
