import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { ScoredResult } from "@/features/result/sections";
import { resultPageState, type ResultSource } from "@/features/result/view-model";
import { YourView } from "@/features/teacher/actions";
import { teacherLinks } from "@/features/teacher/links";
import { appVerdictText } from "@/features/teacher/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { DEMO_CLASS, demoTeacherAttempt } from "@/server/demo/demo-teacher";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { orNotFound, teacherPage } from "@/server/teacher/page-context";
import { teacherAttempt, type TeacherAttempt } from "@/server/teacher/teacher-service";

export const metadata: Metadata = { title: "Attempt" };

/**
 * T5 Attempt, read-only: the result page's own components (band, questions, biggest fix with quote, Try instead and
 * goal, skills, transcript), with no player, Retry or Learn how. A retry of an attempt from before the student joined
 * shows no comparison. "Your view": the app's verdict, then Agree and Choose level, both grey and the same size.
 * No black button on this screen. Only when `teacherCanSee` passes through this class (404 otherwise).
 */
export default async function TeacherAttemptPage(props: PageProps<"/teacher/classes/[classId]/attempts/[attemptId]">) {
  await connection();
  const [{ classId, attemptId }, query] = await Promise.all([props.params, props.searchParams]);
  const page = await teacherPage(query);

  let attempt: TeacherAttempt | null;
  if (page.mock) {
    attempt = classId === DEMO_CLASS.id ? await demoTeacherAttempt(attemptId, new Date()) : null;
    if (!attempt) notFound();
  } else {
    attempt = await orNotFound(teacherAttempt(page.teacherId, classId, attemptId));
  }
  const speakingTask = getSpeakingTask(attempt.taskId);
  if (!speakingTask) notFound();
  const task = toPublicTask(speakingTask);
  const bandLabels = getSpeakingRubric(speakingTask).config.bands.map(({ band, label }) => ({ band, label }));
  const source: ResultSource = {
    task,
    status: attempt.isStalled ? "failed" : attempt.status,
    failure: attempt.isStalled ? { stage: null, code: "processing_stalled" } : attempt.failure,
    recordingDurationMs: attempt.durationMs,
    transcript: attempt.transcript,
    evaluation: attempt.result ? { result: attempt.result } : null,
    previous: attempt.previousResult ? { evaluation: { result: attempt.previousResult } } : null,
    bandLabels,
    isDevelopmentProvider: attempt.isDevelopmentProvider,
  };
  const state = resultPageState(source);
  const studentHref = page.href(teacherLinks.student(classId, attempt.memberId));

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: studentHref, label: attempt.studentName }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      {state.kind === "scored" ? (
        <ScoredResult view={state.view} task={task} teacher={{ studentName: attempt.studentName }}>
          <YourView
            verdict={appVerdictText(task.part, state.view.band, state.view.bandLabel)}
            bands={bandLabels}
            initial={attempt.rating}
            url={`/api/teacher/classes/${encodeURIComponent(classId)}/attempts/${encodeURIComponent(attemptId)}/rating`}
            demo={page.mock}
          />
        </ScoredResult>
      ) : (
        <Card aria-labelledby="attempt-title" className="mx-auto max-w-2xl">
          <p className="text-caption text-fg-muted">
            {attempt.studentName} · {task.title}
          </p>
          <h1 id="attempt-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
            {state.kind === "scoring" ? "Scoring…" : "This answer wasn't scored"}
          </h1>
          <p className="mt-2 text-body text-fg-muted">
            {state.kind === "scoring" ? "Its result appears here once it is scored." : "There is no band to rate. The student can record it again."}
          </p>
        </Card>
      )}
    </AppShell>
  );
}
