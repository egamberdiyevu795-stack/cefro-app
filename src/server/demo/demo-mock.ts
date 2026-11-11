import "server-only";
/**
 * The demo mock exam of mock mode (`?mock=1`, docs/v1-plan.md step 4): the mock result page and its History row, with no
 * account, no database and no model call. Every part is a demo answer (`features/demo`) put through the REAL evaluation with
 * the existing mock evaluator (`evaluateDemoAnswer`, `part3DemoEvaluation`), so each part carries a real `MultilevelResult` /
 * `Q8Result`; the page reads them through the same code as a real mock (`speakingPartSource`, `part3Source`).
 *
 * Switches (demo only, on `/practice/mock/demo?mock=1`):
 *   state=scoring     Parts 2 and 3 are still being scored (the rows fill in; the demo does not poll, it stays this way)
 *   state=unfinished  the mock was closed after 24 hours with Parts 1.1 and 1.2 done
 *   state=pending     every part is done but Part 3 has no AI band ("AI score not ready yet")
 *   teacher=1         a teacher has rated the parts (they agree with the app's bands, except Part 2: one band higher)
 */
import { getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import type { AttemptView } from "@/domain/speaking/attempt";
import { examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import { MOCK_PARTS, type MockStatus } from "@/domain/speaking/full-mock";
import type { HistoryAttempt, HistoryMock } from "@/domain/speaking/history";
import { toPublicTask } from "@/domain/speaking/task";
import { DEFAULT_POINTS } from "@/features/demo/part3-demo-answers";
import { demoResultHref, demoAttemptView, demoEvaluation, demoTranscript, durationOf } from "./demo-data";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "./part3-demo";
import { NOT_DONE_PART, part3Source, speakingPartSource, teacherRatingOf, type MockPartSource, type MockResultSource, type PartLinks, type PartTeacherRating } from "@/features/mock-result/part-source";
import { part3PracticeHref, part3ResultHref, nextPart3Key } from "@/features/part3/links";
import { practiceHref, demoPracticeKey } from "@/features/speaking-practice/lib/practice-flow";
import { lessonHref } from "@/features/lessons/choose";
import { DEMO_MOCK_HREF, DEMO_MOCK_ID } from "@/features/mock-result/links";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";

export { DEMO_MOCK_HREF, DEMO_MOCK_ID };

/** One demo task per part, each with a hand-written demo answer. */
const DEMO_TASKS: Record<Exclude<ExamPartId, "3">, string> = {
  "1.1": "a2-part1-1-daily-life",
  "1.2": "b1-part1-2-shopping",
  "2": "b2-part2-a-tradition",
};
const DEMO_PART3_TASK = "c1-part3-cars-in-city-centres";
const DEMO_PART3_KEY = nextPart3Key(DEMO_PART3_TASK, DEFAULT_POINTS, null);

export type DemoMockState = "finished" | "scoring" | "unfinished" | "pending";

export interface DemoMockOptions {
  state?: DemoMockState;
  teacher?: boolean;
}

/** Reads the demo switches from a page's query (anything else is the finished demo). */
export function demoMockOptions(query: Record<string, string | string[] | undefined>): DemoMockOptions {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const state = one(query.state);
  return {
    state: state === "scoring" || state === "unfinished" || state === "pending" ? state : "finished",
    teacher: one(query.teacher) === "1",
  };
}

const AT = "2026-11-01T09:00:00.000Z";

function part3AttemptView(key: string, evaluation: NonNullable<Awaited<ReturnType<typeof part3DemoEvaluation>>>): AttemptView {
  const spec = part3DemoSpec(key)!;
  const transcript = part3DemoTranscriptFor(spec);
  return {
    id: key,
    taskId: spec.task.id,
    taskVersion: spec.task.version,
    attemptNumber: 1,
    previousAttemptId: null,
    status: "completed",
    failure: null,
    isStalled: false,
    recordingDurationMs: durationOf(transcript),
    audio: null,
    retryFocus: null,
    transcript: { text: transcript, provider: "demo", model: "demo" },
    metrics: null,
    evaluation: {
      result: evaluation.result,
      meta: {
        evaluatorVersion: evaluation.evaluatorVersion,
        rubricVersion: evaluation.rubricVersion,
        schemaVersion: evaluation.schemaVersion,
        provider: evaluation.provider,
        model: evaluation.model,
        createdAt: AT,
        latencyMs: evaluation.latencyMs,
        isDevelopmentProvider: evaluation.isDevelopmentProvider,
      },
    },
    createdAt: AT,
    completedAt: AT,
  };
}

/** A demo attempt that is still being scored (no evaluation yet) or that has no AI band (the scoring step failed). */
function unscored(view: AttemptView, kind: "scoring" | "ai_pending"): AttemptView {
  return kind === "scoring"
    ? { ...view, status: "evaluating", evaluation: null }
    : { ...view, status: "failed", failure: { stage: "evaluation", code: "evaluation_failed" }, evaluation: null };
}

/** Every demo part as a full AttemptView of a finished demo mock. Null for a part without a demo result. */
async function demoViews(): Promise<Record<ExamPartId, { view: AttemptView; key: string } | null>> {
  const views = {} as Record<ExamPartId, { view: AttemptView; key: string } | null>;
  for (const part of MOCK_PARTS) {
    if (part === "3") {
      const evaluation = await part3DemoEvaluation(DEMO_PART3_KEY);
      views[part] = evaluation ? { view: part3AttemptView(DEMO_PART3_KEY, evaluation), key: DEMO_PART3_KEY } : null;
    } else {
      const key = demoPracticeKey(DEMO_TASKS[part], null);
      const view = await demoAttemptView(key);
      views[part] = view ? { view: { ...view, id: `${DEMO_MOCK_ID}-${part}` }, key } : null;
    }
  }
  return views;
}

function linksFor(part: ExamPartId, key: string, taskId: string): PartLinks {
  return {
    detail: part === "3" ? part3ResultHref(key) : demoResultHref(key),
    retry: part === "3" ? part3PracticeHref(taskId, { retry: key }) : practiceHref(taskId, { mock: true, retry: key }),
    lesson: (lesson) => lessonHref(lesson, { demo: key }, { mock: true }),
  };
}

/** The demo teacher: agrees with the app's band on every part, except Part 2 where they give one band more. */
function demoTeacher(part: ExamPartId, band: number, labels: readonly { band: number; label: string }[]): PartTeacherRating | null {
  const teacherBand = part === "2" ? Math.min(band + 1, Math.max(...labels.map((l) => l.band))) : band;
  return teacherRatingOf({ agrees: teacherBand === band, teacherBand: teacherBand === band ? null : teacherBand, appBand: band }, labels);
}

/** The demo mock as the result page reads it. */
export async function demoMockResult(options: DemoMockOptions = {}): Promise<MockResultSource> {
  const state = options.state ?? "finished";
  const views = await demoViews();
  const parts: MockPartSource[] = [];
  for (const part of MOCK_PARTS) {
    const entry = views[part];
    if (!entry || (state === "unfinished" && (part === "2" || part === "3"))) {
      parts.push(NOT_DONE_PART(part));
      continue;
    }
    let view = entry.view;
    if (state === "scoring" && (part === "2" || part === "3")) view = unscored(view, "scoring");
    if (state === "pending" && part === "3") view = unscored(view, "ai_pending");

    if (part === "3") {
      const task = getArgumentTask(view.taskId)!;
      const labels = getArgumentRubric(task).config.bands.map(({ band, label }) => ({ band, label }));
      const band = view.evaluation && "scoring" in view.evaluation.result ? view.evaluation.result.scoring.band : null;
      parts.push(
        part3Source(view, {
          task: toPublicArgumentTask(task),
          links: linksFor(part, entry.key, task.id),
          teacher: options.teacher && band !== null ? demoTeacher(part, band, labels) : null,
        }),
      );
    } else {
      const task = getSpeakingTask(view.taskId)!;
      const labels = getSpeakingRubric(task).config.bands.map(({ band, label }) => ({ band, label }));
      const band = view.evaluation && "scoring" in view.evaluation.result ? view.evaluation.result.scoring.band : null;
      parts.push(
        speakingPartSource(part, view, {
          task: toPublicTask(task),
          bandLabels: labels,
          links: linksFor(part, entry.key, task.id),
          teacher: options.teacher && band !== null ? demoTeacher(part, band, labels) : null,
        }),
      );
    }
  }
  const status: MockStatus = state === "unfinished" ? "not_finished" : "finished";
  return { id: DEMO_MOCK_ID, status, createdAt: AT, finishedAt: status === "finished" ? AT : null, parts };
}

/* ----------------------------------------------------------------------------------------------------- History */

/** The History address of a demo mock part (`/result/demo-mock-2` → its demo result), or null for any other link. */
export function demoMockPartHref(href: string): string | null {
  const id = /^\/result\/demo-mock-(1\.1|1\.2|2|3)$/.exec(href)?.[1] as ExamPartId | undefined;
  if (!id) return null;
  return id === "3" ? part3ResultHref(DEMO_PART3_KEY) : demoResultHref(demoPracticeKey(DEMO_TASKS[id], null));
}

/**
 * The demo student's one finished mock for History: the mock and its four parts as History attempts (real stored results of
 * the demo answers), newest first. Four days before `now`, so it sits among the demo attempts.
 */
export async function demoMockHistory(now: Date): Promise<{ mocks: HistoryMock[]; attempts: HistoryAttempt[] }> {
  const createdAt = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
  const attempts: HistoryAttempt[] = [];
  for (const part of [...MOCK_PARTS].reverse()) {
    const key = part === "3" ? DEMO_PART3_KEY : demoPracticeKey(DEMO_TASKS[part], null);
    const taskId = part === "3" ? DEMO_PART3_TASK : DEMO_TASKS[part];
    const task = part === "3" ? getArgumentTask(taskId) : getSpeakingTask(taskId);
    if (!task) continue;
    const result = part === "3" ? (await part3DemoEvaluation(key))?.result : (await demoEvaluation(key))?.result;
    if (!result) continue;
    attempts.push({
      id: `${DEMO_MOCK_ID}-${part}`,
      taskId,
      title: task.title,
      part: part === "3" ? "3" : examPartOf(task as { part: number; level: string }),
      createdAt,
      status: "completed",
      isStalled: false,
      failureCode: null,
      recordingDurationMs: durationOf(part === "3" ? part3DemoTranscriptFor(part3DemoSpec(key)!) : demoTranscript(key)),
      previousAttemptId: null,
      sessionId: DEMO_MOCK_ID,
      result,
    });
  }
  return { mocks: [{ id: DEMO_MOCK_ID, status: "finished", createdAt }], attempts };
}
