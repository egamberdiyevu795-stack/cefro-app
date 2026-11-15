import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getAnySpeakingTask } from "@/content/speaking";
import { examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import { MOCK_PARTS, remainingParts } from "@/domain/speaking/full-mock";
import {
  EXAM_MESSAGES,
  PASS_REFUSAL_MESSAGE,
  addFailure,
  classMockTitle,
  clearFailuresOn,
  failuresOn,
  isLockedAnywhere,
  isLockedOn,
  isPaperMode,
  isPin,
  isLaptopId,
  normaliseRoomLabel,
  parsePinFailures,
  passExpiry,
  passRefusal,
  pickable,
  rosterState,
  serialisePinFailures,
  suggestClassPaper,
  MAX_PIN_FAILURES,
  type PassRow,
  type RosterState,
} from "@/domain/teacher/exam-laptop";
import { teacherSafeShownName } from "@/domain/teacher/rules";
import { formatDate } from "@/features/history/view-model";
import { buildMockPlan, type MockPartPlan } from "@/features/full-mock/plan";
import * as repo from "@/server/attempts/attempt-repository";
import { assertCanRecord, teacherSharingAllowed } from "@/server/consent/consent";
import { getDb } from "@/server/db/client";
import { classMembers, classMocks, examPasses, practiceSessions, users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { newId, nowIso } from "@/server/ids";
import { finishMock, getMock, mockTasksForPart, planMockTasks, resolvePart11Pick, type MockView } from "@/server/sessions/mock-service";
import { notFound, openMembers, ownOpenClass } from "@/server/teacher/teacher-store";
import { verifyPin } from "./pin";

/*
 * Exam laptop mode on the server (docs/v1-plan.md section 6). The laptop stays signed in as the TEACHER. A correct PIN gives
 * that laptop a one-mock pass for ONE student; every recording made with it is saved to that student's account (the routes
 * that accept a pass resolve the caller through `acting-user.ts`). Every function takes the teacher's own id from the session.
 * A PIN, a PIN hash and the failure counts never leave this file.
 */

export type ClassMockRow = typeof classMocks.$inferSelect;
export type PassRecord = typeof examPasses.$inferSelect;

const closedError = () => new HttpError(409, "class_mock_closed", EXAM_MESSAGES.closed);

/* ---------------------------------------------------------------------------------------------- class mocks */

export interface ClassMockView {
  id: string;
  title: string;
  /** The one paper everyone sits, as titles (null: a different paper for each student). */
  paper: { part: ExamPartId; taskId: string; title: string }[] | null;
  openedAt: string;
  closed: boolean;
}

function paperOf(row: ClassMockRow): ClassMockView["paper"] {
  const ids: Partial<Record<ExamPartId, string | null>> = { "1.1": row.task11, "1.2": row.task12, "2": row.task2, "3": row.task3 };
  if (!MOCK_PARTS.some((part) => ids[part])) return null;
  return MOCK_PARTS.flatMap((part) => {
    const taskId = ids[part];
    const task = taskId ? getAnySpeakingTask(taskId) : null;
    return taskId && task ? [{ part, taskId, title: task.title }] : [];
  });
}

export const toClassMockView = (row: ClassMockRow): ClassMockView => ({ id: row.id, title: row.title, paper: paperOf(row), openedAt: row.openedAt, closed: Boolean(row.closedAt) });

/** The class's open class mock (not closed), or null. Only for the class's own teacher (call `ownOpenClass` first). */
export async function openClassMockOf(classId: string): Promise<ClassMockRow | null> {
  return (await (await getDb()).select().from(classMocks).where(and(eq(classMocks.classId, classId), isNull(classMocks.closedAt))).orderBy(desc(classMocks.openedAt)).get()) ?? null;
}

/** Every class mock of the teacher's own open class, newest first (T3's "Class mocks" list). */
export async function listClassMocks(teacherId: string, classId: string): Promise<ClassMockRow[]> {
  await ownOpenClass(teacherId, classId);
  return (await getDb()).select().from(classMocks).where(eq(classMocks.classId, classId)).orderBy(desc(classMocks.openedAt)).all();
}

/** The teacher's own class mock of their own open class, or 404. `allowClosed`: results stay readable after "close". */
export async function ownClassMock(teacherId: string, classId: string, classMockId: string, options: { allowClosed?: boolean } = {}): Promise<ClassMockRow> {
  await ownOpenClass(teacherId, classId);
  const row = await (await getDb()).select().from(classMocks).where(and(eq(classMocks.id, classMockId), eq(classMocks.classId, classId), eq(classMocks.teacherUserId, teacherId))).get();
  if (!row) throw notFound();
  if (row.closedAt && !options.allowClosed) throw closedError();
  return row;
}

/** T3's "Class mocks": every class mock of the class with "k of n finished" (n = the students who share with the class). */
export async function classMockSummaries(teacherId: string, classId: string): Promise<{ id: string; title: string; date: string; finished: number; total: number; closed: boolean }[]> {
  const rows = await listClassMocks(teacherId, classId);
  const total = (await openMembers(classId)).length;
  const db = await getDb();
  const out = [];
  for (const row of rows) {
    const finished = new Set((await db.select({ userId: practiceSessions.userId }).from(practiceSessions).where(and(eq(practiceSessions.classMockId, row.id), eq(practiceSessions.status, "finished"))).all()).map((r) => r.userId)).size;
    out.push({ id: row.id, title: row.title, date: formatDate(row.openedAt), finished, total, closed: Boolean(row.closedAt) });
  }
  return out;
}

/** One task per part that nobody in the class has done (the "same paper" suggestion). Read only. */
export async function suggestPaper(teacherId: string, classId: string, random: () => number = Math.random): Promise<{ part: ExamPartId; taskId: string; title: string }[]> {
  await ownOpenClass(teacherId, classId);
  const members = await openMembers(classId);
  const histories = await Promise.all(members.map((m) => repo.listAttemptsForUser(m.studentUserId)));
  const history = histories.flat().map((r) => ({ taskId: r.attempt.taskId, createdAt: r.attempt.createdAt }));
  const suggested = suggestClassPaper((part) => mockTasksForPart(part), history, random);
  // Part 1.1: a frequency-weighted question set (one set for the whole class), not the bank's entry.
  const paper = suggested["1.1"] ? { ...suggested, "1.1": resolvePart11Pick(suggested["1.1"], history, random) } : suggested;
  return MOCK_PARTS.flatMap((part) => (paper[part] ? [{ part, taskId: paper[part]!, title: getAnySpeakingTask(paper[part]!)?.title ?? paper[part]! }] : []));
}

export interface StartInput {
  mode: unknown;
  /** The tasks to use for "same paper" (the suggestion by default). Each must be a task of its own part. */
  tasks?: unknown;
}

/**
 * "Start exam laptop": opens the class's class mock, or JOINS the one already open (the second laptop). A class has at
 * most one open class mock. `joined`: it was already open (the mode and tasks asked for are ignored then).
 */
export async function startClassMock(teacherId: string, classId: string, input: StartInput, random: () => number = Math.random): Promise<{ classMock: ClassMockRow; joined: boolean }> {
  await ownOpenClass(teacherId, classId);
  const existing = await openClassMockOf(classId);
  if (existing) return { classMock: existing, joined: true };
  if (!isPaperMode(input.mode)) throw new HttpError(400, "invalid_paper", "Choose the same paper for everyone, or a different paper for each student.");
  const tasks = input.mode === "same" ? await chosenPaper(teacherId, classId, input.tasks, random) : null;
  const db = await getDb();
  const earlier = (await db.select({ id: classMocks.id }).from(classMocks).where(eq(classMocks.classId, classId)).all()).length;
  const row = {
    id: newId(),
    classId,
    teacherUserId: teacherId,
    title: classMockTitle(earlier),
    task11: tasks?.["1.1"] ?? null,
    task12: tasks?.["1.2"] ?? null,
    task2: tasks?.["2"] ?? null,
    task3: tasks?.["3"] ?? null,
    openedAt: nowIso(),
  };
  await db.insert(classMocks).values(row).run();
  // Two laptops pressing Start at the same moment both insert: the oldest open row wins (ties by id) and the other laptop's row is
  // dropped, so a class never ends up with two open class mocks and both laptops share one.
  const open = await db.select().from(classMocks).where(and(eq(classMocks.classId, classId), isNull(classMocks.closedAt))).orderBy(asc(classMocks.openedAt), asc(classMocks.id)).all();
  const winner = open[0]!;
  if (winner.id !== row.id) {
    await db.delete(classMocks).where(eq(classMocks.id, row.id)).run();
    return { classMock: winner, joined: true };
  }
  return { classMock: winner, joined: false };
}

async function chosenPaper(teacherId: string, classId: string, tasks: unknown, random: () => number): Promise<Partial<Record<ExamPartId, string>>> {
  if (tasks == null) {
    const suggested = await suggestPaper(teacherId, classId, random);
    return Object.fromEntries(suggested.map((s) => [s.part, s.taskId]));
  }
  if (typeof tasks !== "object" || Array.isArray(tasks)) throw new HttpError(400, "invalid_paper", "That paper could not be read.");
  const out: Partial<Record<ExamPartId, string>> = {};
  for (const part of MOCK_PARTS) {
    const id = (tasks as Record<string, unknown>)[part];
    // Any task of the part by id: a listed one, or a Part 1.1 question set (made from its id), or a retired one.
    const task = typeof id === "string" ? getAnySpeakingTask(id) : undefined;
    if (typeof id !== "string" || !task || examPartOf(task) !== part) {
      throw new HttpError(400, "invalid_paper", "Choose one task for every part.");
    }
    out[part] = resolvePart11Pick(id, [], random);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------ roster */

export interface RosterEntry {
  memberId: string;
  /** The name the student chose for this class (never an email). */
  name: string;
  state: RosterState;
  /** "Room 2" while in progress on another laptop (or this one). */
  room: string | null;
  /** The student has no PIN yet: can't be picked (they set it on their phone). */
  hasPin: boolean;
  /** Locked on this laptop: can't type a PIN here until the teacher unlocks. */
  lockedHere: boolean;
  /** Locked on some laptop: the teacher's list offers Unlock. */
  locked: boolean;
  /** May be tapped on this laptop. */
  pickable: boolean;
}

export interface Roster {
  classMock: ClassMockView;
  className: string;
  students: RosterEntry[];
}

const passIsActive = (pass: Pick<PassRecord, "usedUpAt" | "expiresAt">, now: number) => !pass.usedUpAt && Date.parse(pass.expiresAt) > now;

/** Not started / In progress (Room 2) / Done for every student who shared with the class. For this teacher's laptop (`laptopId`) only. */
export async function roster(teacherId: string, classId: string, classMockId: string, laptopId: string, now = Date.now()): Promise<Roster> {
  if (!isLaptopId(laptopId)) throw new HttpError(400, "invalid_laptop", "This laptop could not be identified.");
  const cls = await ownOpenClass(teacherId, classId);
  const cm = await ownClassMock(teacherId, classId, classMockId, { allowClosed: true });
  const db = await getDb();
  const members = await openMembers(classId);
  const passes = await db.select().from(examPasses).where(eq(examPasses.classMockId, classMockId)).all();
  const finished = new Set(
    (await db.select({ userId: practiceSessions.userId }).from(practiceSessions).where(and(eq(practiceSessions.classMockId, classMockId), eq(practiceSessions.status, "finished"))).all()).map((r) => r.userId),
  );
  const students: RosterEntry[] = [];
  for (const member of members) {
    const email = (await db.select({ email: users.email }).from(users).where(eq(users.id, member.studentUserId)).get())?.email ?? null;
    const active = passes.filter((p) => p.studentUserId === member.studentUserId && passIsActive(p, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const failures = parsePinFailures(member.pinFailures);
    const lockedHere = isLockedOn(failures, laptopId);
    const facts = { finished: finished.has(member.studentUserId), activeRoom: active?.deviceLabel ?? null };
    const state = rosterState(facts);
    students.push({
      memberId: member.id,
      name: teacherSafeShownName(member.shownName, email),
      state,
      room: state === "in_progress" ? facts.activeRoom : null,
      hasPin: Boolean(member.pinHash),
      lockedHere,
      locked: isLockedAnywhere(failures),
      pickable: pickable({ ...facts, hasPin: Boolean(member.pinHash), laptopId, activeLaptopId: active?.laptopId ?? null, lockedHere }),
    });
  }
  return { classMock: toClassMockView(cm), className: cls.name, students };
}

/* ------------------------------------------------------------------------------------------------------- PIN */

export interface PinSuccess {
  passId: string;
  expiresAt: string;
  /** "Hi Aziza": the name this student chose for this class. */
  name: string;
  /** The four parts, public tasks only, for the mock this student sits (a continued mock: the parts still to do). */
  plans: MockPartPlan[];
  finished: ExamPartId[];
}

async function currentPassOf(classMockId: string, studentUserId: string, now: number): Promise<PassRecord | undefined> {
  const rows = await (await getDb()).select().from(examPasses).where(and(eq(examPasses.classMockId, classMockId), eq(examPasses.studentUserId, studentUserId))).all();
  return rows.filter((p) => passIsActive(p, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Save a failure count only if nobody changed it meanwhile (so parallel guesses can't all count as the first one). */
async function bumpFailures(memberId: string, laptopId: string): Promise<{ count: number; locked: boolean }> {
  const db = await getDb();
  for (let i = 0; i < 8; i++) {
    const row = await db.select({ pinFailures: classMembers.pinFailures }).from(classMembers).where(eq(classMembers.id, memberId)).get();
    const before = row?.pinFailures ?? null;
    const after = addFailure(parsePinFailures(before), laptopId);
    const update = db.update(classMembers).set({ pinFailures: serialisePinFailures(after) }).where(and(eq(classMembers.id, memberId), before === null ? isNull(classMembers.pinFailures) : eq(classMembers.pinFailures, before)));
    if ((await update.run()).rowsAffected === 1) return { count: failuresOn(after, laptopId), locked: isLockedOn(after, laptopId) };
  }
  throw new HttpError(503, "busy", "Please try again.");
}

/**
 * A student taps their name and types their PIN. Correct: this laptop gets a pass for this student only (ends at the end
 * screen, or after about 30 minutes). Wrong: counted per laptop; 5 lock the student on this laptop until the teacher
 * unlocks. Refused before anything is checked when the class mock is closed, the student is done, in progress on the
 * other laptop, has no PIN, or cannot record yet (their own consent check).
 */
export async function enterPin(
  teacherId: string,
  classId: string,
  classMockId: string,
  input: { memberId: unknown; pin: unknown; laptopId: unknown; room: unknown },
  now = Date.now(),
): Promise<PinSuccess> {
  if (!isLaptopId(input.laptopId)) throw new HttpError(400, "invalid_laptop", "This laptop could not be identified.");
  const room = normaliseRoomLabel(input.room);
  if (!room) throw new HttpError(400, "invalid_room", "Give this laptop a name, like Room 2.");
  if (typeof input.memberId !== "string") throw notFound();
  const cm = await ownClassMock(teacherId, classId, classMockId);
  const db = await getDb();
  const member = (await openMembers(classId)).find((m) => m.id === input.memberId);
  if (!member) throw notFound();
  if (!member.pinHash) throw new HttpError(409, "no_pin", EXAM_MESSAGES.noPin);
  const failures = parsePinFailures(member.pinFailures);
  if (isLockedOn(failures, input.laptopId)) throw new HttpError(403, "pin_locked", EXAM_MESSAGES.locked);

  const done = await db.select({ id: practiceSessions.id }).from(practiceSessions).where(and(eq(practiceSessions.classMockId, cm.id), eq(practiceSessions.userId, member.studentUserId), eq(practiceSessions.status, "finished"))).get();
  if (done) throw new HttpError(409, "already_done", EXAM_MESSAGES.alreadyDone);
  const active = await currentPassOf(cm.id, member.studentUserId, now);
  if (active && active.laptopId !== input.laptopId) throw new HttpError(409, "in_progress_elsewhere", EXAM_MESSAGES.inProgressElsewhere);

  // The student's own consent check (the same one the upload makes), before a PIN is even tried.
  await assertCanRecord(member.studentUserId);

  if (typeof input.pin !== "string" || !isPin(input.pin)) throw new HttpError(400, "invalid_pin", "Use exactly 4 digits.");
  if (!(await verifyPin(input.pin, member.pinHash))) {
    const { count, locked } = await bumpFailures(member.id, input.laptopId);
    if (locked) throw new HttpError(403, "pin_locked", EXAM_MESSAGES.locked);
    const left = MAX_PIN_FAILURES - count;
    throw new HttpError(403, "wrong_pin", `${EXAM_MESSAGES.wrongPin} ${left} ${left === 1 ? "try" : "tries"} left.`);
  }

  // Correct. This laptop's count is cleared; an older pass of this student on this laptop (a reload) is replaced.
  await db.update(classMembers).set({ pinFailures: serialisePinFailures(clearFailuresOn(failures, input.laptopId)) }).where(eq(classMembers.id, member.id)).run();
  if (active) await db.update(examPasses).set({ usedUpAt: new Date(now).toISOString() }).where(eq(examPasses.id, active.id)).run();
  const passId = newId();
  const expiresAt = passExpiry(now);
  await db.insert(examPasses).values({ id: passId, classMockId: cm.id, studentUserId: member.studentUserId, deviceLabel: room, laptopId: input.laptopId, createdAt: new Date(now).toISOString(), expiresAt }).run();

  const email = (await db.select({ email: users.email }).from(users).where(eq(users.id, member.studentUserId)).get())?.email ?? null;
  const resumable = await findClassSession(cm.id, member.studentUserId);
  const finished = resumable ? (await getMock(member.studentUserId, resumable.id, now)).parts.filter((p) => p.attemptId).map((p) => p.part) : [];
  const todo = remainingParts(finished.map((part) => ({ part })));
  return { passId, expiresAt, name: teacherSafeShownName(member.shownName, email), plans: buildMockPlan(todo, await paperFor(cm, member.studentUserId, todo)), finished };
}

/** The teacher unlocks a student (every laptop's count is cleared). No password: it opens nothing but a PIN try. */
export async function unlockStudent(teacherId: string, classId: string, classMockId: string, memberId: string): Promise<void> {
  await ownClassMock(teacherId, classId, classMockId, { allowClosed: true });
  const member = (await openMembers(classId)).find((m) => m.id === memberId);
  if (!member) throw notFound();
  await (await getDb()).update(classMembers).set({ pinFailures: null }).where(eq(classMembers.id, member.id)).run();
}

/** The tasks this student sits: the class's one paper, or a paper of tasks they have not done recently. */
async function paperFor(cm: ClassMockRow, studentUserId: string, parts: readonly ExamPartId[]): Promise<Partial<Record<ExamPartId, string>>> {
  const same: Partial<Record<ExamPartId, string | null>> = { "1.1": cm.task11, "1.2": cm.task12, "2": cm.task2, "3": cm.task3 };
  if (MOCK_PARTS.some((part) => same[part])) return Object.fromEntries(parts.flatMap((part) => (same[part] ? [[part, same[part]]] : [])));
  return planMockTasks(studentUserId, parts);
}

async function findClassSession(classMockId: string, studentUserId: string) {
  return (
    (await (await getDb())
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.classMockId, classMockId), eq(practiceSessions.userId, studentUserId), eq(practiceSessions.status, "in_progress")))
      .orderBy(desc(practiceSessions.createdAt))
      .get()) ?? undefined
  );
}

/* ------------------------------------------------------------------------------------------------------ the pass */

export interface ResolvedPass {
  pass: PassRecord;
  classMock: ClassMockRow;
  /** The student's account: where everything made with the pass is saved. */
  studentUserId: string;
}

/**
 * The pass this laptop may use right now, or 403. `teacherId` is the signed-in caller: only the class mock's own teacher can
 * use a pass of it. A closed class mock does not end a pass: a student already under way finishes.
 */
export async function resolvePass(teacherId: string, passId: unknown, laptopId: unknown, now = Date.now()): Promise<ResolvedPass> {
  const denied = (code: string, message: string) => new HttpError(403, code, message);
  if (typeof passId !== "string" || !isLaptopId(laptopId)) throw denied("exam_pass_invalid", "This pass is not valid.");
  const db = await getDb();
  const pass = await db.select().from(examPasses).where(eq(examPasses.id, passId)).get();
  const cm = pass ? await db.select().from(classMocks).where(eq(classMocks.id, pass.classMockId)).get() : undefined;
  // Someone else's pass looks exactly like one that does not exist.
  if (!pass || !cm || cm.teacherUserId !== teacherId) throw denied("exam_pass_invalid", "This pass is not valid.");
  const member = await db.select().from(classMembers).where(and(eq(classMembers.classId, cm.classId), eq(classMembers.studentUserId, pass.studentUserId), isNull(classMembers.endedAt))).get();
  // The student left or was removed, or shares no more: the pass is dead.
  if (!member || !(await teacherSharingAllowed(pass.studentUserId))) throw denied("exam_pass_invalid", "This pass is not valid.");
  const row: PassRow = { classMockId: pass.classMockId, studentUserId: pass.studentUserId, laptopId: pass.laptopId, sessionId: pass.sessionId, expiresAt: pass.expiresAt, usedUpAt: pass.usedUpAt };
  const refusal = passRefusal(row, {
    classMockId: cm.id,
    laptopId,
    now,
    locked: isLockedOn(parsePinFailures(member.pinFailures), laptopId),
    // A closed class mock refuses new starts (`enterPin`, `startPassMock`), never a mock already under way.
    classMockClosed: false,
  });
  if (refusal) throw denied(`exam_pass_${refusal}`, PASS_REFUSAL_MESSAGE[refusal]);
  return { pass, classMock: cm, studentUserId: pass.studentUserId };
}

/**
 * "Start mock" with a pass: the student's mock for this class mock (resumed if the pass already started one, or an earlier
 * pass left one in progress). It carries `class_mock_id`, which is what makes it "In class".
 */
export async function startPassMock(resolved: ResolvedPass, now = Date.now()): Promise<{ mock: MockView; resumed: boolean }> {
  const { pass, classMock, studentUserId } = resolved;
  if (classMock.closedAt && !pass.sessionId && !(await findClassSession(classMock.id, studentUserId))) throw closedError();
  const db = await getDb();
  const existing = (pass.sessionId ? await db.select().from(practiceSessions).where(eq(practiceSessions.id, pass.sessionId)).get() : undefined) ?? (await findClassSession(classMock.id, studentUserId));
  let sessionId = existing?.id;
  if (!sessionId) {
    sessionId = newId();
    await db.insert(practiceSessions).values({ id: sessionId, userId: studentUserId, kind: "full_mock", status: "in_progress", classMockId: classMock.id, createdAt: new Date(now).toISOString() }).run();
  }
  if (pass.sessionId !== sessionId) await db.update(examPasses).set({ sessionId }).where(eq(examPasses.id, pass.id)).run();
  return { mock: await getMock(studentUserId, sessionId, now), resumed: Boolean(existing) };
}

/** The pass may only touch the mock it started. A different session id (another student's, a home mock) is refused. */
export function assertPassSession(resolved: ResolvedPass, sessionId: string | null | undefined): string {
  if (!resolved.pass.sessionId || sessionId !== resolved.pass.sessionId) throw new HttpError(403, "exam_pass_wrong_student", PASS_REFUSAL_MESSAGE.wrong_student);
  return resolved.pass.sessionId;
}

/** The end screen: the mock closes (all four parts must be in) and the pass is used up. */
export async function finishPassMock(resolved: ResolvedPass, now = Date.now()): Promise<MockView> {
  const sessionId = assertPassSession(resolved, resolved.pass.sessionId);
  const mock = await finishMock(resolved.studentUserId, sessionId, now);
  await (await getDb()).update(examPasses).set({ usedUpAt: new Date(now).toISOString() }).where(and(eq(examPasses.id, resolved.pass.id), isNull(examPasses.usedUpAt))).run();
  return mock;
}

/* --------------------------------------------------------------------------------------------------- ending */

/**
 * "End exam laptop" (the route has already checked the teacher's password): this laptop's passes end. `close`: the class
 * mock is closed too, so no new PIN or mock starts on any laptop. A student already under way on another laptop finishes.
 */
export async function endLaptop(teacherId: string, classId: string, classMockId: string, laptopId: unknown, close: boolean, now = Date.now()): Promise<void> {
  if (!isLaptopId(laptopId)) throw new HttpError(400, "invalid_laptop", "This laptop could not be identified.");
  const cm = await ownClassMock(teacherId, classId, classMockId, { allowClosed: true });
  const db = await getDb();
  await db.update(examPasses).set({ usedUpAt: new Date(now).toISOString() }).where(and(eq(examPasses.classMockId, cm.id), eq(examPasses.laptopId, laptopId), isNull(examPasses.usedUpAt))).run();
  if (close && !cm.closedAt) await db.update(classMocks).set({ closedAt: new Date(now).toISOString() }).where(eq(classMocks.id, cm.id)).run();
}
