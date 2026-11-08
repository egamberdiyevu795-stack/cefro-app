import "server-only";
/**
 * The demo student of mock mode (`?mock=1`), and every demo result the mock loop can show: a few attempts across
 * several Part 2 tasks, a retry with a goal, an exam date. Used by the dashboard, History, the practice page and the
 * result page in mock mode, instead of the database.
 *
 * Each demo result is produced for its own task: the task's demo answer (`demo-answers.ts`) goes through the real
 * evaluation (`evaluateSpeaking`) with the existing mock evaluator (`MockEvaluationModel`, no delay), so it is a real
 * `SpeakingEvaluation` / `MultilevelResult` for that task's questions. No model is called, nothing reads or writes the
 * database. Results are computed once per process. Dates are relative to `now`, so the demo always looks recent.
 *
 * Demo keys (they name a demo result in links, `?demo=<key>` / `?retry=<key>`):
 *   demo-1 … demo-6        the demo student's attempts
 *   answer.<task id>       the result of a mock practice of that task ("first" answer: question 3 left out)
 *   retry.<task id>.<key>  a mock retry of that task, as a retry of <key> ("full" answer, judged against its goal)
 *   picture.<task id>      lesson demo: an answer that only describes the picture (leads to lesson L-T8)
 *   bare.<task id>         lesson demo: question 3 answered in one bare sentence (leads to lesson L-T4)
 * The two lesson demos exist only for tasks whose demo answer has that text ("Advice from someone").
 */
import { getSpeakingTask } from "@/content/speaking";
import { addDays, todayIn } from "@/domain/exam-date";
import type { AttemptView } from "@/domain/speaking/attempt";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { toPublicTask, type SpeakingTask } from "@/domain/speaking/task";
import type { ResultSource } from "@/features/result/view-model";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
export { demoPracticeKey } from "@/features/speaking-practice/lib/practice-flow";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import { demoAnswerText, type DemoAnswerVariant } from "@/features/demo/demo-answers";
import { formatInternal, parseInternal, withMock } from "@/features/demo/demo-mode";
import { ACCOUNT as DEMO_ACCOUNT } from "@/features/dashboard/mock-data";

interface DemoAttemptSpec {
  id: string;
  taskId: string;
  /** How long before `now` it was recorded. */
  daysAgo: number;
  hoursAgo?: number;
  /** Which demo answer it gave; null for an attempt that failed with no speech. */
  answer: DemoAnswerVariant | null;
  /** The demo attempt this one retries. */
  retryOf?: string;
}

/** Newest first, as `listAttemptHistory` returns them. */
const SPECS: readonly DemoAttemptSpec[] = [
  // A retry of the attempt below, with its goal (answer question 3), now answered.
  { id: "demo-6", taskId: "b2-part2-a-tradition", daysAgo: 1, answer: "full", retryOf: "demo-5" },
  { id: "demo-5", taskId: "b2-part2-a-tradition", daysAgo: 1, hoursAgo: 2, answer: "first" },
  { id: "demo-4", taskId: "b2-part2-goal-you-set", daysAgo: 3, answer: "full" },
  { id: "demo-3", taskId: "b2-part2-working-in-a-team", daysAgo: 4, answer: null },
  { id: "demo-2", taskId: "b2-part2-important-decision", daysAgo: 6, answer: "first" },
  { id: "demo-1", taskId: "b2-part2-advice-from-someone", daysAgo: 9, answer: "first" },
];

/** The demo student's exam: this many days from today (Uzbekistan's calendar). */
export const DEMO_EXAM_IN_DAYS = 23;

/** The ids of the demo student's attempts, newest first. */
export const DEMO_ATTEMPT_IDS = SPECS.map((spec) => spec.id);

const BY_ID = new Map(SPECS.map((spec) => [spec.id, spec]));

/** What a demo key stands for. */
interface DemoResultSpec {
  task: SpeakingTask;
  answer: DemoAnswerVariant | null;
  previous: string | null;
}

/** Reads a demo key; null for anything else (an unknown or malformed key, or a key of an unknown task). */
export function demoResultSpec(key: string): DemoResultSpec | null {
  const attempt = BY_ID.get(key);
  if (attempt) {
    const task = getSpeakingTask(attempt.taskId);
    return task ? { task, answer: attempt.answer, previous: attempt.retryOf ?? null } : null;
  }
  const answer = /^answer\.([a-z0-9-]+)$/.exec(key);
  if (answer) {
    const task = getSpeakingTask(answer[1]);
    return task && demoAnswerText(task.id, "first") ? { task, answer: "first", previous: null } : null;
  }
  const lessonDemo = /^(picture|bare)\.([a-z0-9-]+)$/.exec(key);
  if (lessonDemo) {
    const variant = lessonDemo[1] as "picture" | "bare";
    const task = getSpeakingTask(lessonDemo[2]);
    return task && demoAnswerText(task.id, variant) ? { task, answer: variant, previous: null } : null;
  }
  const retry = /^retry\.([a-z0-9-]+)\.(.+)$/.exec(key);
  if (retry) {
    const task = getSpeakingTask(retry[1]);
    const previous = demoResultSpec(retry[2]);
    // A retry is of an answer to the same task.
    return task && demoAnswerText(task.id, "full") && previous?.task.id === task.id ? { task, answer: "full", previous: retry[2] } : null;
  }
  return null;
}

/** The demo answer's transcript for a key, or "" for one with no speech (or an unknown key). */
export function demoTranscript(key: string): string {
  const spec = demoResultSpec(key);
  return spec?.answer ? (demoAnswerText(spec.task.id, spec.answer) ?? "") : "";
}

/** A demo answer's length: about 2.2 words a second, as a calm B1–B2 speaker talks. */
export function durationOf(transcript: string): number {
  return transcript ? Math.round((transcript.split(/\s+/).length / 2.2) * 1000) : 12_000;
}

const evaluations = new Map<string, Promise<SpeakingEvaluation | null>>();

/**
 * The evaluation of a demo key, produced by the real evaluation with the mock evaluator (computed once). Null for an
 * attempt with no speech and for an unknown key.
 */
export function demoEvaluation(key: string): Promise<SpeakingEvaluation | null> {
  let pending = evaluations.get(key);
  if (!pending) {
    pending = evaluate(key);
    evaluations.set(key, pending);
  }
  return pending;
}

async function evaluate(key: string): Promise<SpeakingEvaluation | null> {
  const spec = demoResultSpec(key);
  if (!spec?.answer) return null;
  const previous = spec.previous ? await demoEvaluation(spec.previous) : null;
  return evaluateDemoAnswer({
    key,
    task: spec.task,
    transcript: demoTranscript(key),
    previous: spec.previous && previous ? { transcript: demoTranscript(spec.previous), evaluation: previous } : null,
  });
}

/**
 * One made-up answer through the real evaluation with the mock evaluator (no delay, no model call): a real
 * `SpeakingEvaluation` for that task. Also used by the demo teacher's class (`demo-teacher.ts`).
 */
export function evaluateDemoAnswer(input: {
  key: string;
  task: SpeakingTask;
  transcript: string;
  previous: { transcript: string; evaluation: SpeakingEvaluation } | null;
}): Promise<SpeakingEvaluation> {
  const { key, task, transcript, previous } = input;
  const durationMs = durationOf(transcript);
  return evaluateSpeaking(
    {
      task,
      rubric: getSpeakingRubric(task),
      transcript,
      metrics: computeSpeechMetrics(transcript, durationMs, task.speakingSeconds),
      audio: { storageProvider: "demo", storageKey: key, mimeType: "audio/webm", durationMs },
      previousAttempt: previous
        ? {
            attemptNumber: 1,
            transcript: previous.transcript,
            retryFocus: previous.evaluation.result.retry_focus.map(({ objective, success_check }) => ({ objective, success_check })),
          }
        : null,
    },
    new MockEvaluationModel({ delayMs: 0 }),
  );
}

/** The demo student's attempts, newest first, in the shape the dashboard and History read. */
export async function demoAttempts(now: Date): Promise<HistoryAttempt[]> {
  return Promise.all(
    SPECS.map(async (spec): Promise<HistoryAttempt> => {
      const task = getSpeakingTask(spec.taskId);
      if (!task) throw new Error(`Demo data: no task ${spec.taskId}`);
      const evaluation = await demoEvaluation(spec.id);
      const base = {
        id: spec.id,
        taskId: task.id,
        title: task.title,
        part: examPartOf(task),
        createdAt: new Date(now.getTime() - (spec.daysAgo * 24 + (spec.hoursAgo ?? 0)) * 3_600_000).toISOString(),
        isStalled: false,
        previousAttemptId: spec.retryOf ?? null,
        recordingDurationMs: durationOf(demoTranscript(spec.id)),
      };
      return evaluation
        ? { ...base, status: "completed", failureCode: null, result: evaluation.result }
        : { ...base, status: "failed", failureCode: "transcription_empty", result: null };
    }),
  );
}

/** The demo student's stored exam date, as the database would hold it. */
/** The demo student joined this many days ago (before their first demo attempt, 9 days ago). */
export const DEMO_MEMBER_SINCE_DAYS = 30;

/** The demo student's account, as Profile and Settings show it in mock mode (the same name and email as the Account menu). */
export function demoAccount(now: Date): { kind: "registered"; name: string; email: string; memberSince: string } {
  return { kind: "registered", ...DEMO_ACCOUNT, memberSince: new Date(now.getTime() - DEMO_MEMBER_SINCE_DAYS * 86_400_000).toISOString() };
}

export function demoExamDate(now: Date): { examDate: string; examDateSkippedAt: null } {
  return { examDate: addDays(todayIn(now), DEMO_EXAM_IN_DAYS), examDateSkippedAt: null };
}

/**
 * A demo result in the shapes the result page reads, for its own task. `scoring`: the "Scoring…" screen of it (a
 * mock practice that was just finished). Null for an unknown key.
 */
export async function demoResultSource(key: string, options: { scoring?: boolean } = {}): Promise<ResultSource | null> {
  const spec = demoResultSpec(key);
  if (!spec) return null;
  const transcript = demoTranscript(key);
  const evaluation = await demoEvaluation(key);
  const previous = spec.previous ? await demoEvaluation(spec.previous) : null;
  return {
    task: toPublicTask(spec.task),
    bandLabels: getSpeakingRubric(spec.task).config.bands.map(({ band, label }) => ({ band, label })),
    status: options.scoring ? "evaluating" : evaluation ? "completed" : "failed",
    failure: evaluation || options.scoring ? null : { stage: "transcription", code: "transcription_empty" },
    recordingDurationMs: durationOf(transcript),
    transcript: transcript || null,
    evaluation: options.scoring ? null : evaluation,
    previous: previous ? { evaluation: previous } : null,
  };
}

/**
 * A demo result as the attempt a mock retry comes from, in the shape the practice page gets from the API (only its
 * evaluation, the retry goal, is used: mock mode never uploads). Null for an unknown key or one with no result.
 */
export async function demoAttemptView(key: string): Promise<AttemptView | null> {
  const spec = demoResultSpec(key);
  const evaluation = await demoEvaluation(key);
  if (!spec || !evaluation) return null;
  const transcript = demoTranscript(key);
  const at = "2026-11-01T09:00:00.000Z";
  return {
    id: key,
    taskId: spec.task.id,
    taskVersion: spec.task.version,
    attemptNumber: spec.previous ? 2 : 1,
    previousAttemptId: spec.previous,
    status: "completed",
    failure: null,
    isStalled: false,
    recordingDurationMs: durationOf(transcript),
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
        createdAt: at,
        latencyMs: evaluation.latencyMs,
        isDevelopmentProvider: evaluation.isDevelopmentProvider,
      },
    },
    createdAt: at,
    completedAt: at,
  };
}

/** The demo result page of a demo key, in mock mode. */
export function demoResultHref(key: string): string {
  return withMock(`/result?${new URLSearchParams({ demo: key })}`);
}

/**
 * A link built by the real pages' code from demo attempts, turned into its mock-mode link: `/result/<demo id>` opens
 * that attempt's demo result; a practice link that retries a demo attempt keeps it as the retry (`?mock=1&retry=<id>`);
 * every other link just keeps `mock=1`.
 */
export function demoHref(href: string): string {
  const url = parseInternal(href);
  const result = /^\/result\/([^/]+)$/.exec(url.pathname);
  if (result) {
    const id = decodeURIComponent(result[1]);
    return demoResultSpec(id) ? demoResultHref(id) : withMock("/result");
  }
  const practice = /^\/practice\/speaking\/([^/]+)$/.exec(url.pathname);
  const retry = url.searchParams.get("retry");
  if (practice && retry) {
    const taskId = decodeURIComponent(practice[1]);
    return practiceHref(taskId, { mock: true, ...(demoResultSpec(retry)?.task.id === taskId ? { retry } : {}) });
  }
  return withMock(formatInternal(url));
}
