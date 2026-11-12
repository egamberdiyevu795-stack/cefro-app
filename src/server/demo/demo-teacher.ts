import "server-only";
/**
 * The demo teacher of mock mode (`?mock=1`, docs/teacher-plan.md section 6): "Demo teacher" with one class ("Demo
 * class", code DEMO42) and six made-up students. Built like the demo student (demo-data.ts): hand-written answers go
 * through the real evaluation with the mock evaluator, so every result is a real `SpeakingEvaluation` in the real
 * types. No database, cookies or identity; nothing is saved. Dates are relative to `now`.
 *
 * DEMO42 contains an "O", which real join codes never use (domain/teacher/rules.ts), so it can never be a real class.
 */
import { getSpeakingTask } from "@/content/speaking";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { demoAnswerText } from "@/features/demo/demo-answers";
import type { SharedStudent } from "@/features/teacher/view-model";
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import type { TeacherAttempt } from "@/server/teacher/teacher-service";
import { durationOf, evaluateDemoAnswer } from "./demo-data";

export const DEMO_TEACHER = { name: "Demo teacher" } as const;
export const DEMO_CLASS = { id: "demo-class", name: "Demo class", joinCode: "DEMO42" } as const;

/** Is this what the student typed the demo class's code? (not case-sensitive, spaces and dashes ignored) */
export function isDemoCode(value: unknown): boolean {
  return typeof value === "string" && value.replace(/[\s-]+/g, "").toUpperCase() === DEMO_CLASS.joinCode;
}

/** Made-up answers written for the demo class (the shared demo answers are reused by key: `<task>:<variant>`). */
const CLASS_ANSWERS: Record<string, string> = {
  // A short, simple answer: fewer words and few linkers.
  "madina.happy-day":
    "My happy day was my birthday last year. My family was at home and my friends is coming too. We ate cake and we played games. I was very happy because everybody was there. I think money is good but family is more better for me.",
  "sardor.trying-and-failing":
    "Last spring I tried to win the city football cup with my school team. We trained every day after lessons, but in the final we lost two to one. I was very sad, however my coach said that we played well. As a result, now I train harder. I think failure is useful for young people, although it hurts, because you learn what to change.",
};

interface DemoClassAttemptSpec {
  /** Unique within the class, e.g. "aziza-1". */
  id: string;
  taskId: string;
  /** `first` / `full` / `picture` / `bare` from the shared demo answers, or a key of CLASS_ANSWERS. */
  answer: string;
  daysAgo: number;
  hoursAgo?: number;
  /** The attempt (of this student, shared) it retries. */
  retryOf?: string;
}

interface DemoStudentSpec {
  memberId: string;
  shownName: string;
  /** When they tapped Share. */
  sharedDaysAgo: number;
  /** Newest first. */
  attempts: DemoClassAttemptSpec[];
}

/** Six made-up students, in the order they joined. */
const STUDENTS: readonly DemoStudentSpec[] = [
  {
    memberId: "s1",
    shownName: "Aziza",
    sharedDaysAgo: 12,
    attempts: [
      { id: "aziza-3", taskId: "b2-part2-important-decision", answer: "full", daysAgo: 1 },
      { id: "aziza-2", taskId: "b2-part2-a-tradition", answer: "full", daysAgo: 4, retryOf: "aziza-1" },
      { id: "aziza-1", taskId: "b2-part2-a-tradition", answer: "first", daysAgo: 4, hoursAgo: 3 },
    ],
  },
  {
    memberId: "s2",
    shownName: "Bekzod",
    sharedDaysAgo: 11,
    attempts: [
      { id: "bekzod-2", taskId: "b2-part2-goal-you-set", answer: "first", daysAgo: 2 },
      { id: "bekzod-1", taskId: "b2-part2-advice-from-someone", answer: "picture", daysAgo: 6 },
    ],
  },
  {
    memberId: "s3",
    shownName: "Dilnoza",
    sharedDaysAgo: 10,
    attempts: [{ id: "dilnoza-1", taskId: "b2-part2-working-in-a-team", answer: "first", daysAgo: 3 }],
  },
  {
    memberId: "s4",
    shownName: "Jasur",
    sharedDaysAgo: 9,
    attempts: [
      { id: "jasur-2", taskId: "b2-part2-advice-from-someone", answer: "full", daysAgo: 2, retryOf: "jasur-1" },
      { id: "jasur-1", taskId: "b2-part2-advice-from-someone", answer: "bare", daysAgo: 5 },
    ],
  },
  {
    memberId: "s5",
    shownName: "Madina",
    sharedDaysAgo: 8,
    attempts: [
      { id: "madina-2", taskId: "b2-part2-trying-and-failing", answer: "first", daysAgo: 1, hoursAgo: 5 },
      { id: "madina-1", taskId: "b2-part2-happy-day", answer: "madina.happy-day", daysAgo: 6 },
    ],
  },
  {
    memberId: "s6",
    shownName: "Sardor",
    sharedDaysAgo: 2,
    attempts: [{ id: "sardor-1", taskId: "b2-part2-trying-and-failing", answer: "sardor.trying-and-failing", daysAgo: 1 }],
  },
];

/** The demo class's member ids, in the order they joined. */
export const DEMO_MEMBER_IDS = STUDENTS.map((s) => s.memberId);

function transcriptOf(spec: DemoClassAttemptSpec): string {
  const own = CLASS_ANSWERS[spec.answer];
  if (own) return own;
  const shared = demoAnswerText(spec.taskId, spec.answer as "first" | "full" | "picture" | "bare");
  if (!shared) throw new Error(`Demo class: no answer ${spec.answer} for ${spec.taskId}`);
  return shared;
}

const ATTEMPTS = new Map(STUDENTS.flatMap((student) => student.attempts.map((a) => [a.id, { student, spec: a }] as const)));

const evaluations = new Map<string, Promise<SpeakingEvaluation>>();

/** A demo class attempt's evaluation (the real evaluation, mock evaluator; computed once). */
function evaluationOf(id: string): Promise<SpeakingEvaluation> {
  let pending = evaluations.get(id);
  if (!pending) {
    const { spec } = ATTEMPTS.get(id)!;
    const task = getSpeakingTask(spec.taskId);
    if (!task) throw new Error(`Demo class: no task ${spec.taskId}`);
    pending = (async () => {
      const previous = spec.retryOf ? ATTEMPTS.get(spec.retryOf)!.spec : null;
      return evaluateDemoAnswer({
        key: `demo-class.${id}`,
        task,
        transcript: transcriptOf(spec),
        previous: previous ? { transcript: transcriptOf(previous), evaluation: await evaluationOf(previous.id) } : null,
      });
    })();
    evaluations.set(id, pending);
  }
  return pending;
}

const ago = (now: Date, days: number, hours = 0) => new Date(now.getTime() - (days * 24 + hours) * 3_600_000).toISOString();

async function historyAttempt(spec: DemoClassAttemptSpec, now: Date): Promise<HistoryAttempt> {
  const task = getSpeakingTask(spec.taskId)!;
  const evaluation = await evaluationOf(spec.id);
  return {
    id: spec.id,
    taskId: task.id,
    title: task.title,
    part: examPartOf(task),
    createdAt: ago(now, spec.daysAgo, spec.hoursAgo),
    status: "completed",
    isStalled: false,
    failureCode: null,
    recordingDurationMs: durationOf(transcriptOf(spec)),
    previousAttemptId: spec.retryOf ?? null,
    result: evaluation.result,
  };
}

/** The demo class's six students with their shared attempts, as the real server would give them to their teacher. */
export async function demoClassStudents(now: Date): Promise<SharedStudent[]> {
  return Promise.all(
    STUDENTS.map(async (s) => ({
      memberId: s.memberId,
      shownName: s.shownName,
      sharedAt: ago(now, s.sharedDaysAgo),
      attempts: await Promise.all(s.attempts.map((a) => historyAttempt(a, now))),
    })),
  );
}

/** One demo class attempt as a teacher reads it (T5), or null for an unknown id. */
export async function demoTeacherAttempt(attemptId: string, now: Date): Promise<TeacherAttempt | null> {
  const found = ATTEMPTS.get(attemptId);
  if (!found) return null;
  const { student, spec } = found;
  const evaluation = await evaluationOf(spec.id);
  return {
    id: spec.id,
    classId: DEMO_CLASS.id,
    memberId: student.memberId,
    studentName: student.shownName,
    taskId: spec.taskId,
    status: "completed",
    failure: null,
    isStalled: false,
    durationMs: durationOf(transcriptOf(spec)),
    transcript: transcriptOf(spec),
    result: evaluation.result,
    previousResult: spec.retryOf ? (await evaluationOf(spec.retryOf)).result : null,
    methodology: { evaluatorVersion: evaluation.evaluatorVersion, rubricVersion: evaluation.rubricVersion },
    // As on the demo student's results: demo data carries the demo label instead of the development note.
    isDevelopmentProvider: false,
    createdAt: ago(now, spec.daysAgo, spec.hoursAgo),
    rating: null,
  };
}

/** The demo student's suggested name on the Share screen (the demo account is "Student"). */
export const DEMO_STUDENT_ACCOUNT_NAME = "Student";
