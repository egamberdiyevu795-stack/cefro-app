import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { MOCK_PARTS, pickTaskForPart } from "@/domain/speaking/full-mock";
import { normaliseRoomLabel, DEFAULT_ROOM_LABEL } from "@/domain/teacher/exam-laptop";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { ExamLaptop, type RosterEntryView } from "@/features/exam-laptop/ExamLaptop";
import { buildMockPlan } from "@/features/full-mock/plan";
import { teacherLinks } from "@/features/teacher/links";
import { DEMO_CLASS, DEMO_CLASS_MOCK, DEMO_PIN, demoExamRoster } from "@/server/demo/demo-teacher";
import { ownClassMock } from "@/server/exam-laptop/exam-store";
import { mockTasksForPart } from "@/server/sessions/mock-service";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { ownOpenClass } from "@/server/teacher/teacher-store";

export const metadata: Metadata = { title: "Exam laptop" };

/**
 * T7 Exam laptop. NOT in the app frame: no navigation, no links out, nothing the next student could use to wander into the
 * teacher's account. Its own teacher only (the laptop stays signed in as the teacher); a closed class mock opens its results.
 * `?mock=1`: the demo class, a list made up for the screen, the PIN is 1234, nothing is sent.
 */
export default async function ExamLaptopPage(props: PageProps<"/teacher/classes/[classId]/exam/[classMockId]/laptop">) {
  await connection();
  const [{ classId, classMockId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const room = normaliseRoomLabel(one(query.room)) ?? DEFAULT_ROOM_LABEL;
  const endHref = page.href(teacherLinks.cls(classId));
  const resultsHref = page.href(teacherLinks.examResults(classId, classMockId));

  if (page.mock) {
    if (classId !== DEMO_CLASS.id || classMockId !== DEMO_CLASS_MOCK.id) notFound();
    const ids: Partial<Record<ExamPartId, string>> = {};
    for (const part of MOCK_PARTS) ids[part] = pickTaskForPart(mockTasksForPart(part), [], () => 0)?.id;
    const scale = Number(one(query.timeScale));
    const roster: RosterEntryView[] = demoExamRoster().map((e) => ({ ...e, lockedHere: false, locked: false, pickable: e.hasPin && e.state === "not_started" }));
    return (
      <ExamLaptop
        classId={classId}
        classMockId={classMockId}
        className={DEMO_CLASS.name}
        title={DEMO_CLASS_MOCK.title}
        room={room}
        endHref={endHref}
        resultsHref={resultsHref}
        demo={{ roster, plans: buildMockPlan(MOCK_PARTS, ids), pin: DEMO_PIN }}
        timeScale={scale > 0 && scale <= 1 ? scale : 1}
      />
    );
  }

  const cls = await orNotFound(ownOpenClass(page.teacherId, classId));
  const cm = await orNotFound(ownClassMock(page.teacherId, classId, classMockId, { allowClosed: true }));
  if (cm.closedAt) redirect(resultsHref);
  return <ExamLaptop classId={classId} classMockId={classMockId} className={cls.name} title={cm.title} room={room} endHref={endHref} resultsHref={resultsHref} />;
}
