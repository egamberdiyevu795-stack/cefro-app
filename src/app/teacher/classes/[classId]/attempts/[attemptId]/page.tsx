import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { isMultilevel, isMultilevelQ8 } from "@/domain/evaluation/stored";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { toPublicTask } from "@/domain/speaking/task";
import { Part3ScoredResult } from "@/features/part3/result-sections";
import { buildPart3View } from "@/features/part3/view-model";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
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
  const studentHref = page.href(teacherLinks.student(classId, attempt.memberId));
  const status = attempt.isStalled ? "failed" : attempt.status;
  const ratingUrl = `/api/teacher/classes/${encodeURIComponent(classId)}/attempts/${encodeURIComponent(attemptId)}/rating`;

  // Part 3 (balanced argument) has its own result page; here its read-only version, with the same "Your view".
  const argumentTask = getArgumentTask(attempt.taskId);
  if (argumentTask) {
    const task = toPublicArgumentTask(argumentTask);
    const bandLabels = getArgumentRubric(argumentTask).config.bands.map(({ band, label }) => ({ band, label }));
    const result = attempt.result && isMultilevelQ8(attempt.result) ? attempt.result : null;
    const previous = attempt.previousResult && isMultilevelQ8(attempt.previousResult) ? attempt.previousResult : null;
    const scored = status === "completed" && result ? buildPart3View(result, { task, transcript: attempt.transcript ?? "", durationMs: attempt.durationMs, bandLabels, previous, isDevelopmentProvider: attempt.isDevelopmentProvider }) : null;
    return (
      <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: studentHref, label: attempt.studentName }}>
        {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
        {scored ? (
          <Part3ScoredResult view={scored} retryHref="" demo={false} teacher={{ studentName: attempt.studentName, listen: attempt.listen }}>
            <YourView verdict={appVerdictText("3", scored.band, scored.bandLabel)} bands={bandLabels} initial={attempt.rating} url={ratingUrl} demo={page.mock} />
          </Part3ScoredResult>
        ) : (
          <NotScoredCard title={task.title} studentName={attempt.studentName} status={status} aiPending={Boolean(attempt.transcript?.trim()) && attempt.failure?.stage === "evaluation"} />
        )}
      </AppShell>
    );
  }

  const speakingTask = getSpeakingTask(attempt.taskId);
  if (!speakingTask) notFound();
  const task = toPublicTask(speakingTask);
  const bandLabels = getSpeakingRubric(speakingTask).config.bands.map(({ band, label }) => ({ band, label }));
  const result = attempt.result && isMultilevel(attempt.result) ? attempt.result : null;
  const previous = attempt.previousResult && isMultilevel(attempt.previousResult) ? attempt.previousResult : null;
  const source: ResultSource = {
    task,
    status,
    failure: attempt.isStalled ? { stage: null, code: "processing_stalled" } : attempt.failure,
    recordingDurationMs: attempt.durationMs,
    transcript: attempt.transcript,
    evaluation: result ? { result } : null,
    previous: previous ? { evaluation: { result: previous } } : null,
    bandLabels,
    isDevelopmentProvider: attempt.isDevelopmentProvider,
  };
  const state = resultPageState(source);

  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: studentHref, label: attempt.studentName }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      {state.kind === "scored" ? (
        <ScoredResult view={state.view} task={task} teacher={{ studentName: attempt.studentName, listen: attempt.listen }}>
          <YourView
            verdict={appVerdictText(attempt.part ?? task.part, state.view.band, state.view.bandLabel)}
            bands={bandLabels}
            initial={attempt.rating}
            url={ratingUrl}
            demo={page.mock}
          />
        </ScoredResult>
      ) : (
        <NotScoredCard
          title={task.title}
          studentName={attempt.studentName}
          status={state.kind === "scoring" ? "scoring" : "failed"}
          aiPending={state.kind === "failed" && state.aiPending}
        />
      )}
    </AppShell>
  );
}

/** A shared answer with no band to rate: still scoring, "AI score not ready yet", or not scored. */
function NotScoredCard({ title, studentName, status, aiPending }: { title: string; studentName: string; status: string; aiPending: boolean }) {
  const scoring = status !== "completed" && status !== "failed";
  return (
    <Card aria-labelledby="attempt-title" className="mx-auto max-w-2xl">
      <p className="text-caption text-fg-muted">
        {studentName} · {title}
      </p>
      <h1 id="attempt-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
        {scoring ? "Scoring…" : aiPending ? "AI score not ready yet" : "This answer wasn't scored"}
      </h1>
      <p className="mt-2 text-body text-fg-muted">
        {scoring
          ? "Its result appears here once it is scored."
          : aiPending
            ? "The AI score isn't available yet. The recording and transcript are saved."
            : "There is no band to rate. The student can record it again."}
      </p>
    </Card>
  );
}
