import "server-only";
import { isMultilevel } from "@/domain/evaluation/stored";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { AttemptFailure, AttemptStatus } from "@/domain/speaking/attempt";
import type { HistoryAttempt } from "@/domain/speaking/history";
import type { SharedStudent, TeacherRating } from "@/features/teacher/view-model";
import * as repo from "@/server/attempts/attempt-repository";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { toAttemptView } from "@/server/attempts/attempt-views";
import { HttpError } from "@/server/errors";
import { findRating, notFound, openMembers, ownOpenClass, ownOpenMember, saveRating, teacherCanSee, type ClassRow, type MemberRow } from "./teacher-store";

/*
 * What a teacher may read, shaped for the pages and the API (plan section 4): the shown name and the SHARED attempts
 * (created after `shared_at`, Part 2) with transcript, evaluation and retry outcome. Never an email, account name,
 * recording, exam date, analytics, or an attempt from before the student shared.
 */

/** Part 2 attempts the student made after tapping Share, newest first. A retry of an earlier (unshared) attempt loses its link. */
export function sharedOnly(attempts: readonly HistoryAttempt[], sharedAt: string): HistoryAttempt[] {
  const shared = attempts.filter((a) => a.createdAt > sharedAt && a.part === "2");
  const ids = new Set(shared.map((a) => a.id));
  return shared.map((a) => (a.previousAttemptId && !ids.has(a.previousAttemptId) ? { ...a, previousAttemptId: null } : a));
}

async function sharedStudent(member: MemberRow): Promise<SharedStudent> {
  const attempts = sharedOnly(await listAttemptHistory(member.studentUserId), member.sharedAt);
  return { memberId: member.id, shownName: member.shownName, sharedAt: member.sharedAt, attempts };
}

/** A class with its open members, for its own teacher only (404 otherwise). */
export async function classWithStudents(teacherId: string, classId: string): Promise<{ cls: ClassRow; students: SharedStudent[] }> {
  const cls = await ownOpenClass(teacherId, classId);
  const students = await Promise.all((await openMembers(classId)).map(sharedStudent));
  return { cls, students };
}

/** One open member of the teacher's own open class. */
export async function studentInClass(teacherId: string, classId: string, memberId: string): Promise<{ cls: ClassRow; student: SharedStudent }> {
  const { cls, member } = await ownOpenMember(teacherId, classId, memberId);
  return { cls, student: await sharedStudent(member) };
}

/** One shared attempt, as a teacher reads it (T5). No recording, no account data. */
export interface TeacherAttempt {
  id: string;
  classId: string;
  memberId: string;
  studentName: string;
  taskId: string;
  status: AttemptStatus;
  failure: AttemptFailure | null;
  isStalled: boolean;
  /** How long the answer is (the recording itself is never given to a teacher). */
  durationMs: number;
  transcript: string | null;
  result: MultilevelResult | null;
  /** The shared attempt this one retries; null for a first attempt and for a retry of an attempt from before sharing. */
  previousResult: MultilevelResult | null;
  methodology: { evaluatorVersion: string; rubricVersion: string } | null;
  isDevelopmentProvider: boolean;
  createdAt: string;
  rating: TeacherRating | null;
}

/** The attempt if `teacherCanSee` it through this class, else the same 404 as a stranger's result. */
export async function teacherAttempt(teacherId: string, classId: string, attemptId: string): Promise<TeacherAttempt> {
  const visible = await teacherCanSee(teacherId, attemptId);
  if (!visible || visible.classId !== classId) throw notFound();
  const attempt = await repo.findAttempt(attemptId);
  if (!attempt) throw notFound();
  const [transcript, evaluation] = await Promise.all([repo.findLatestTranscript(attemptId), repo.findLatestEvaluation(attemptId)]);
  // The recording is read only for its length; its address is never given to a teacher.
  const view = toAttemptView(attempt, { recording: await repo.findRecording(attemptId), transcript, evaluation });
  let previousResult: MultilevelResult | null = null;
  if (attempt.previousAttemptId && (await teacherCanSee(teacherId, attempt.previousAttemptId))?.classId === classId) {
    previousResult = await scoredResult(attempt.previousAttemptId);
  }
  const result = view.evaluation && isMultilevel(view.evaluation.result) ? view.evaluation.result : null;
  const rating = await findRating(teacherId, attemptId);
  return {
    id: view.id,
    classId,
    memberId: visible.memberId,
    studentName: visible.shownName,
    taskId: view.taskId,
    status: view.status,
    failure: view.failure,
    isStalled: view.isStalled,
    durationMs: view.recordingDurationMs,
    transcript: view.transcript?.text ?? null,
    result,
    previousResult,
    methodology: view.evaluation ? { evaluatorVersion: view.evaluation.meta.evaluatorVersion, rubricVersion: view.evaluation.meta.rubricVersion } : null,
    isDevelopmentProvider: view.evaluation?.meta.isDevelopmentProvider ?? false,
    createdAt: view.createdAt,
    rating: rating ? (rating.agrees ? { agrees: true } : { agrees: false, band: rating.teacherBand ?? 0 }) : null,
  };
}

/** Agree or Choose level, on a scored attempt the teacher can see through this class. */
export async function rateAttempt(teacherId: string, classId: string, attemptId: string, body: unknown): Promise<TeacherRating> {
  const input = parseRating(body);
  const visible = await teacherCanSee(teacherId, attemptId);
  if (!visible || visible.classId !== classId) throw notFound();
  const evaluation = await repo.findLatestEvaluation(attemptId);
  const attempt = await repo.findAttempt(attemptId);
  const parsed = attempt && evaluation ? toAttemptView(attempt, { recording: undefined, transcript: undefined, evaluation }).evaluation : null;
  if (!parsed || !isMultilevel(parsed.result) || parsed.result.scoring.zero_reason === "too_short") {
    throw new HttpError(409, "not_scored", "This answer has no band to rate yet.");
  }
  const saved = await saveRating(teacherId, visible, attemptId, input, {
    band: parsed.result.scoring.band,
    bandMax: parsed.result.scoring.band_max,
    evaluatorVersion: parsed.meta.evaluatorVersion,
    rubricVersion: parsed.meta.rubricVersion,
  });
  return saved.agrees ? { agrees: true } : { agrees: false, band: saved.teacherBand ?? 0 };
}

/** A completed attempt's stored Multilevel result, or null. */
async function scoredResult(attemptId: string): Promise<MultilevelResult | null> {
  const [row, evaluation] = await Promise.all([repo.findAttempt(attemptId), repo.findLatestEvaluation(attemptId)]);
  const result = row && evaluation ? toAttemptView(row, { recording: undefined, transcript: undefined, evaluation }).evaluation?.result : null;
  return result && isMultilevel(result) ? result : null;
}

function parseRating(body: unknown): { agrees: true } | { agrees: false; band: number } {
  const b = (body ?? {}) as { agrees?: unknown; band?: unknown };
  if (b.agrees === true) return { agrees: true };
  if (b.agrees === false && typeof b.band === "number") return { agrees: false, band: b.band };
  throw new HttpError(400, "invalid_rating", "Choose Agree or a level.");
}
