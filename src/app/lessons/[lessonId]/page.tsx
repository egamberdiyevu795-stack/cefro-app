import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { getShownLesson } from "@/content/lessons";
import { getSpeakingTask } from "@/content/speaking";
import { isMultilevel } from "@/domain/evaluation/stored";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { SpeakingTask } from "@/domain/speaking/task";
import { isMockQuery, mockLink, withMock } from "@/features/demo/demo-mode";
import { lessonForResult, lessonWhy } from "@/features/lessons/choose";
import { LessonView } from "@/features/lessons/LessonView";
import { PART2_HREF } from "@/features/profile/view-model";
import { evaluationOf, mockAttemptKey } from "@/features/result/mock-data";
import { AppShell } from "@/features/shell/AppShell";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoEvaluation, demoResultHref, demoResultSpec } from "@/server/demo/demo-data";
import { HttpError } from "@/server/errors";
import { findCurrentUserId } from "@/server/identity/current-user";

export async function generateMetadata(props: PageProps<"/lessons/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await props.params;
  return { title: getShownLesson(lessonId)?.title ?? "Lesson" };
}

/** The result a lesson is opened from, with where its links go. */
interface LessonContext {
  result: MultilevelResult;
  task: SpeakingTask;
  retryHref: string;
  resultHref: string;
  mock: boolean;
}

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/*
 * A lesson (docs/teaching-plan.md). Opened from a result whose biggest fix leads to it, the address names that result:
 *
 *   ?demo=<demo key>              a demo result of mock mode (server/demo/demo-data.ts)
 *   ?anchor=<fixture id>&run=1..3 a saved live run (the /result prototype)
 *   ?attempt=<attempt id>         a real attempt: its owner only, exactly as /result/[attemptId] (404 for anyone else)
 *
 * The first two are mock data (no database, no configuration, every link keeps ?mock=1). Only an approved lesson is
 * ever shown, and from a result only the one the result leads to: anything else is the not-found screen.
 * "Retry with this goal" opens the same retry as the result page's button, so the goal is carried over.
 *
 * With none of the three (opened from the Lessons list, /lessons): the lesson without a result. No "Why this lesson",
 * no goal and no retry; the back link goes to the list and the black button is "Go to Part 2" (the Part 2 task list).
 * `?mock=1` keeps every link in mock mode; without it the page is a real page (configuration check, no database).
 */
export default async function LessonPage(props: PageProps<"/lessons/[lessonId]">) {
  const [{ lessonId }, query] = await Promise.all([props.params, props.searchParams]);
  const lesson = getShownLesson(lessonId);
  if (!lesson) notFound();

  if (!namesResult(query)) {
    // From the Lessons list: the lesson without a result.
    const mock = isMockQuery(query);
    if (!mock) {
      await connection();
      assertServerConfigured();
    }
    return (
      <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} back={false} activeHref="/lessons">
        <LessonView lesson={lesson} from={null} listHref={mockLink("/lessons", mock)} practiseHref={mockLink(PART2_HREF, mock)} demo={mock} />
      </AppShell>
    );
  }

  const context = await lessonContext(query);
  if (!context || lessonForResult(context.result)?.slug !== lesson.slug) notFound();
  const { result, task, mock } = context;
  const focus = result.retry_focus[0];

  return (
    // The Lessons tab is the current section.
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} back={false} activeHref="/lessons">
      <LessonView
        lesson={lesson}
        from={{
          why: lessonWhy(lesson, result, task.prompts),
          task: { title: task.title },
          goal: focus ? { objective: focus.objective, check: focus.success_check || null } : null,
          retryHref: context.retryHref,
          resultHref: context.resultHref,
        }}
        listHref={mockLink("/lessons", mock)}
        practiseHref={mockLink(PART2_HREF, mock)}
        demo={mock}
      />
    </AppShell>
  );
}

/** Does the address name a result (demo, saved run or real attempt)? A present but wrong one is still not found. */
function namesResult(query: Query): boolean {
  return ["demo", "anchor", "run", "attempt"].some((key) => query[key] !== undefined);
}

async function lessonContext(query: Query): Promise<LessonContext | null> {
  // A demo result or a saved run is mock mode only: without ?mock=1 such a link is not found (normal use never shows
  // made-up answers).
  const demoOnly = query.demo !== undefined || query.anchor !== undefined || query.run !== undefined;
  if (demoOnly && !isMockQuery(query)) return null;
  const demo = one(query.demo);
  if (demo) {
    const spec = demoResultSpec(demo);
    const evaluation = spec ? await demoEvaluation(demo) : null;
    if (!spec || !evaluation) return null;
    return {
      result: evaluation.result,
      task: spec.task,
      retryHref: practiceHref(spec.task.id, { mock: true, retry: demo }),
      resultHref: demoResultHref(demo),
      mock: true,
    };
  }

  const fixture = mockAttemptKey(one(query.anchor), one(query.run));
  if (fixture) {
    // The saved live runs all answer "Advice from someone".
    const task = getSpeakingTask("b2-part2-advice-from-someone");
    if (!task) return null;
    return {
      result: evaluationOf(fixture.anchor, fixture.run).result,
      task,
      retryHref: practiceHref(task.id, { mock: true, retry: fixture.anchor, run: fixture.run }),
      resultHref: withMock(`/result?${new URLSearchParams({ anchor: fixture.anchor, run: String(fixture.run) })}`),
      mock: true,
    };
  }

  const attemptId = one(query.attempt);
  if (!attemptId) return null;
  // A real attempt: the full server configuration and its owner, as on /result/[attemptId].
  await connection();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  const attempt = userId ? await ownAttempt(userId, attemptId) : null;
  const task = attempt ? getSpeakingTask(attempt.taskId) : undefined;
  const result = attempt?.evaluation?.result;
  if (!attempt || !task || !result || !isMultilevel(result)) return null;
  return {
    result,
    task,
    retryHref: practiceHref(task.id, { retry: attempt.id }),
    resultHref: `/result/${encodeURIComponent(attempt.id)}`,
    mock: false,
  };
}

/** The caller's own attempt, or null: missing, malformed and other people's attempts all look the same (404). */
async function ownAttempt(userId: string, attemptId: string): Promise<AttemptView | null> {
  try {
    return await getAttemptViewForUser(userId, attemptId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}
