import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isMockQuery } from "@/features/demo/demo-mode";
import { MOCK_PARTS, pickTaskForPart } from "@/domain/speaking/full-mock";
import { normaliseRoomLabel, DEFAULT_ROOM_LABEL } from "@/domain/teacher/exam-laptop";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { ExamLaptop, type RosterEntryView } from "@/features/exam-laptop/ExamLaptop";
import { buildMockPlan } from "@/features/full-mock/plan";
import { asDemoTeacher, teacherLinks } from "@/features/teacher/links";
import { DEMO_CLASS, DEMO_CLASS_MOCK, DEMO_PIN, demoExamRoster } from "@/server/demo/demo-teacher";
import { mockTasksForPart } from "@/server/sessions/mock-service";
import { examDevicePage } from "@/server/exam-laptop/device-page";

export const metadata: Metadata = { title: "Exam laptop" };

/**
 * T7 Exam laptop. NOT in the app frame: no navigation, no links out, nothing the next student could use to wander into the
 * teacher's account. It runs on the exam laptop's DEVICE SESSION (the teacher's login was signed out of this browser when the exam
 * started): only that session, for exactly this class mock, gets in; everyone else, and a closed class mock, gets the 404.
 * `?mock=1`: the demo class, a list made up for the screen, the PIN is 1234, nothing is sent.
 */
export default async function ExamLaptopPage(props: PageProps<"/teacher/classes/[classId]/exam/[classMockId]/laptop">) {
  await connection();
  const [{ classId, classMockId }, query] = await Promise.all([props.params, props.searchParams]);
  const mock = isMockQuery(query);
  const href = mock ? asDemoTeacher : (path: string) => path;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const room = normaliseRoomLabel(one(query.room)) ?? DEFAULT_ROOM_LABEL;
  const endHref = href(teacherLinks.cls(classId));
  const resultsHref = href(teacherLinks.examResults(classId, classMockId));
  const startHref = href(teacherLinks.examStart(classId));

  if (mock) {
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
        startHref={startHref}
        demo={{ roster, plans: buildMockPlan(MOCK_PARTS, ids), pin: DEMO_PIN }}
        timeScale={scale > 0 && scale <= 1 ? scale : 1}
      />
    );
  }

  const { device, className, title } = await examDevicePage(classId, classMockId);
  return <ExamLaptop classId={classId} classMockId={classMockId} className={className} title={title} room={device.room} endHref={endHref} resultsHref={resultsHref} startHref={startHref} />;
}
