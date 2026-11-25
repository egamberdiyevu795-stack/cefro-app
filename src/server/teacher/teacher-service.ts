import { placeOfMock } from "@/domain/teacher/exam-laptop";
import "server-only";
import { getAnySpeakingTask, getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { isMultilevel, isMultilevelQ8 } from "@/domain/evaluation/stored";
import type { AttemptFailure, AttemptStatus, AttemptView } from "@/domain/speaking/attempt";
import { examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import { MOCK_PARTS } from "@/domain/speaking/full-mock";
import type { BandedResult, HistoryAttempt } from "@/domain/speaking/history";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { toPublicTask } from "@/domain/speaking/task";
import { memberScope, memberSeesAttempt, memberSeesMock, teacherSafeShownName } from "@/domain/teacher/rules";
import { part3TranscriptFixes } from "@/features/teacher/part3-fixes";
import { buildTranscriptFixes } from "@/features/result/transcript-fixes";
import { appEstimate, teacherMockHeader, type TeacherListen, type TeacherMockPartView, type TeacherMockRating, type TeacherMockView } from "@/features/teacher/mock-view";
import type { SharedStudent, TeacherRating } from "@/features/teacher/view-model";
import { NOT_DONE_PART, part3Source, speakingPartSource } from "@/features/mock-result/part-source";
import * as repo from "@/server/attempts/attempt-repository";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { toAttemptView } from "@/server/attempts/attempt-views";
import { HttpError } from "@/server/errors";
import { bandLabelsForTask } from "@/server/sessions/mock-result";
import { listMockHistory } from "@/server/sessions/mock-history";
import { getMock } from "@/server/sessions/mock-service";
import { teacherAudioHref } from "@/features/teacher/links";
import {
  accountEmail,
  findMockRating,
  findRating,
  notFound,
  openMembers,
  ownOpenClass,
  ownOpenMember,
  saveMockRating,
  saveRating,
  teacherCanHear,
  teacherCanSee,
  teacherCanSeeMock,
  type ClassRow,
  type MemberRow,
} from "./teacher-store";

/*
 * What a teacher may read, shaped for the pages and the API (plan section 4): the shown name and the SHARED attempts
 * (created after `shared_at`, Part 2) with transcript, evaluation and retry outcome. Never an email, account name,
 * recording, exam date, analytics, or an attempt from before the student shared.
 */

/**
 * The attempts the student's membership shares, newest first: made after Share, any part on the current wording, Part 2
 * only on an old one (`memberSeesAttempt`, the same rule as `teacherCanSee`). A retry of an attempt that is not shared
 * loses its link.
 */
export function sharedOnly(attempts: readonly HistoryAttempt[], member: Pick<MemberRow, "sharedAt" | "shareTextVersion" | "allPartsFrom">): HistoryAttempt[] {
  const shared = attempts.filter((a) => memberSeesAttempt(member, { part: a.part, createdAt: a.createdAt }));
  const ids = new Set(shared.map((a) => a.id));
  return shared.map((a) => (a.previousAttemptId && !ids.has(a.previousAttemptId) ? { ...a, previousAttemptId: null } : a));
}

async function sharedStudent(member: MemberRow): Promise<SharedStudent> {
  const attempts = sharedOnly(await listAttemptHistory(member.studentUserId), member);
  const mocks = (await listMockHistory(member.studentUserId)).filter((m) => memberSeesMock(member, m));
  const shownName = teacherSafeShownName(member.shownName, await accountEmail(member.studentUserId));
  return { memberId: member.id, shownName, sharedAt: member.sharedAt, attempts, mocks, partsShared: memberFullScope(member) };
}

/** Does this membership share every part, mocks and recordings (not only Part 2)? */
function memberFullScope(member: Pick<MemberRow, "sharedAt" | "shareTextVersion" | "allPartsFrom">): boolean {
  return memberScope(member) === "all_parts_audio";
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

/** One shared attempt, as a teacher reads it (T5). The recording is only ever a `listen` entry the teacher may play. */
export interface TeacherAttempt {
  id: string;
  classId: string;
  memberId: string;
  studentName: string;
  taskId: string;
  /** "1.1", "1.2", "2" or "3"; null for a task that is not one of the exam's parts. */
  part: ExamPartId | null;
  status: AttemptStatus;
  failure: AttemptFailure | null;
  isStalled: boolean;
  /** How long the answer is. */
  durationMs: number;
  transcript: string | null;
  /** The stored result: Parts 1.1, 1.2 and 2 (`multilevel`) or Part 3 (`multilevel_q8`). */
  result: BandedResult | null;
  /** The shared attempt this one retries; null for a first attempt and for a retry of an attempt from before sharing. */
  previousResult: BandedResult | null;
  methodology: { evaluatorVersion: string; rubricVersion: string } | null;
  isDevelopmentProvider: boolean;
  createdAt: string;
  /** The full mock this attempt belongs to, when the teacher can see that mock too (for the link back). */
  mockId: string | null;
  /** Null: nothing to play and nothing to say (no recording the teacher may hear, and not deleted). */
  listen: TeacherListen | null;
  rating: TeacherRating | null;
}

/** What the player is given: the teacher's own audio route while the teacher may hear it, or the "deleted" note. */
async function listenFor(teacherId: string, classId: string, attemptId: string, recording: Awaited<ReturnType<typeof repo.findRecording>>): Promise<TeacherListen | null> {
  if (!recording) return null;
  const hearable = await teacherCanHear(teacherId, attemptId);
  if (hearable) return { state: "playable", src: teacherAudioHref(classId, attemptId), durationMs: recording.durationMs };
  if (recording.audioDeletedAt) return { state: "deleted", deletedAt: recording.audioDeletedAt, durationMs: recording.durationMs };
  return null;
}

/** The attempt if `teacherCanSee` it through this class, else the same 404 as a stranger's result. */
export async function teacherAttempt(teacherId: string, classId: string, attemptId: string): Promise<TeacherAttempt> {
  const visible = await teacherCanSee(teacherId, attemptId);
  if (!visible || visible.classId !== classId) throw notFound();
  const attempt = await repo.findAttempt(attemptId);
  if (!attempt) throw notFound();
  const [recording, transcript, evaluation] = await Promise.all([repo.findRecording(attemptId), repo.findLatestTranscript(attemptId), repo.findLatestEvaluation(attemptId)]);
  const view = toAttemptView(attempt, { recording, transcript, evaluation });
  let previousResult: BandedResult | null = null;
  if (attempt.previousAttemptId && (await teacherCanSee(teacherId, attempt.previousAttemptId))?.classId === classId) {
    previousResult = await scoredResult(attempt.previousAttemptId);
  }
  const result = view.evaluation && (isMultilevel(view.evaluation.result) || isMultilevelQ8(view.evaluation.result)) ? view.evaluation.result : null;
  const rating = await findRating(teacherId, attemptId);
  const task = getAnySpeakingTask(attempt.taskId);
  const mock = attempt.sessionId ? await teacherCanSeeMock(teacherId, attempt.sessionId) : null;
  return {
    id: view.id,
    classId,
    memberId: visible.memberId,
    studentName: teacherSafeShownName(visible.shownName, await accountEmail(visible.studentUserId)),
    taskId: view.taskId,
    part: task ? examPartOf(task) : null,
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
    mockId: mock && mock.classId === classId ? attempt.sessionId : null,
    listen: await listenFor(teacherId, classId, attemptId, recording),
    rating: rating ? (rating.agrees ? { agrees: true } : { agrees: false, band: rating.teacherBand ?? 0 }) : null,
  };
}

/** Agree or Choose level, on a scored attempt the teacher can see through this class (any of the four parts). */
export async function rateAttempt(teacherId: string, classId: string, attemptId: string, body: unknown): Promise<TeacherRating> {
  const input = parseRating(body);
  const visible = await teacherCanSee(teacherId, attemptId);
  if (!visible || visible.classId !== classId) throw notFound();
  const evaluation = await repo.findLatestEvaluation(attemptId);
  const attempt = await repo.findAttempt(attemptId);
  const parsed = attempt && evaluation ? toAttemptView(attempt, { recording: undefined, transcript: undefined, evaluation }).evaluation : null;
  if (!parsed || !(isMultilevel(parsed.result) || isMultilevelQ8(parsed.result)) || parsed.result.scoring.zero_reason === "too_short") {
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

/* ------------------------------------------------------------------------------------------------- T6 student's mock */

/**
 * A student's full mock as a teacher reads it (T6): its four parts, each with the transcript (and its sentences to
 * improve), the recording the teacher may hear, the app's band and the teacher's own rating. Only when `teacherCanSeeMock`
 * passes through this class; a part is shown only if `teacherCanSee` its attempt (same rule), else it reads "Not done".
 */
export async function teacherMock(teacherId: string, classId: string, mockId: string): Promise<TeacherMockView> {
  const visible = await teacherCanSeeMock(teacherId, mockId);
  if (!visible || visible.classId !== classId) throw notFound();
  const mock = await getMock(visible.studentUserId, mockId);
  const parts: TeacherMockPartView[] = await Promise.all(
    MOCK_PARTS.map(async (part): Promise<TeacherMockPartView> => {
      const found = mock.parts.find((p) => p.part === part);
      const attemptId = found?.attemptId ?? null;
      const shared = attemptId ? await teacherCanSee(teacherId, attemptId) : null;
      const empty = { ...NOT_DONE_PART(part), bands: [], transcript: null, fixes: null, listen: null, rating: null };
      if (!attemptId || !shared || shared.classId !== classId) return { ...empty, attemptId: null, taskTitle: null };
      return partOfMock(teacherId, classId, part, attemptId, empty);
    }),
  );
  const rating = await findMockRating(teacherId, mockId);
  return {
    id: mock.id,
    classId,
    memberId: visible.memberId,
    studentName: teacherSafeShownName(visible.shownName, await accountEmail(visible.studentUserId)),
    status: mock.status,
    createdAt: mock.createdAt,
    finishedAt: mock.finishedAt,
    parts,
    rating: rating ? (rating.agrees ? { agrees: true } : { agrees: false, level: rating.teacherLevel as "B1" }) : null,
    place: placeOfMock(mock.classMockId),
  };
}

type EmptyPart = TeacherMockPartView & { detailHref: string | null; fix: unknown; teacher: unknown };

async function partOfMock(teacherId: string, classId: string, part: ExamPartId, attemptId: string, empty: EmptyPart): Promise<TeacherMockPartView> {
  const attempt = await repo.findAttempt(attemptId);
  if (!attempt) return { ...empty, attemptId: null, taskTitle: null };
  const [recording, transcript, evaluation] = await Promise.all([repo.findRecording(attemptId), repo.findLatestTranscript(attemptId), repo.findLatestEvaluation(attemptId)]);
  const view: AttemptView = toAttemptView(attempt, { recording, transcript, evaluation });
  const links = { detail: "", retry: "", lesson: () => "" };
  const bands = bandLabelsForTask(view.taskId);
  const argument = getArgumentTask(view.taskId);
  const speaking = argument ? undefined : getSpeakingTask(view.taskId);
  const source = argument
    ? part3Source(view, { task: toPublicArgumentTask(argument), links, teacher: null })
    : speaking
      ? speakingPartSource(part, view, { task: toPublicTask(speaking), bandLabels: bands, links, teacher: null })
      : { ...NOT_DONE_PART(part), attemptId, state: "not_scored" as const, reason: "failed" as const };
  const result = view.evaluation && (isMultilevel(view.evaluation.result) || isMultilevelQ8(view.evaluation.result)) ? view.evaluation.result : null;
  const text = view.transcript?.text ?? null;
  const rating = await findRating(teacherId, attemptId);
  return {
    part,
    attemptId,
    taskTitle: source.taskTitle,
    state: source.state,
    reason: source.reason,
    band: source.band,
    bands,
    transcript: text,
    fixes: text && result ? (argument && isMultilevelQ8(result) ? part3TranscriptFixes(result, toPublicArgumentTask(argument), text, bands) : buildTranscriptFixes(text, result.assessment.sentence_fixes, [], result.assessment.strengths.map((s) => s.quote))) : null,
    listen: await listenFor(teacherId, classId, attemptId, recording),
    rating: rating ? (rating.agrees ? { agrees: true } : { agrees: false, band: rating.teacherBand ?? 0 }) : null,
  };
}

/** Agree or Choose level for one part of a mock is `rateAttempt`. This is the whole mock's level (optional). */
export async function rateMock(teacherId: string, classId: string, mockId: string, body: unknown): Promise<TeacherMockRating> {
  const visible = await teacherCanSeeMock(teacherId, mockId);
  if (!visible || visible.classId !== classId) throw notFound();
  const input = parseMockRatingBody(body);
  const view = await teacherMock(teacherId, classId, mockId);
  const saved = await saveMockRating(teacherId, visible, mockId, input, appEstimate(view.parts));
  return saved.agrees ? { agrees: true } : { agrees: false, level: saved.teacherLevel as "B1" };
}

function parseMockRatingBody(body: unknown): { agrees: true } | { agrees: false; level: string } {
  const b = (body ?? {}) as { agrees?: unknown; level?: unknown };
  if (b.agrees === true) return { agrees: true };
  if (b.agrees === false && typeof b.level === "string") return { agrees: false, level: b.level };
  throw new HttpError(400, "invalid_rating", "Choose Agree or a level.");
}

export { teacherMockHeader };

/** A completed attempt's stored Multilevel result, or null. */
async function scoredResult(attemptId: string): Promise<BandedResult | null> {
  const [row, evaluation] = await Promise.all([repo.findAttempt(attemptId), repo.findLatestEvaluation(attemptId)]);
  const result = row && evaluation ? toAttemptView(row, { recording: undefined, transcript: undefined, evaluation }).evaluation?.result : null;
  return result && (isMultilevel(result) || isMultilevelQ8(result)) ? result : null;
}

function parseRating(body: unknown): { agrees: true } | { agrees: false; band: number } {
  const b = (body ?? {}) as { agrees?: unknown; band?: unknown };
  if (b.agrees === true) return { agrees: true };
  if (b.agrees === false && typeof b.band === "number") return { agrees: false, band: b.band };
  throw new HttpError(400, "invalid_rating", "Choose Agree or a level.");
}
