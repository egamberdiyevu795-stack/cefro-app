import "server-only";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { getAnySpeakingTask, listAllSpeakingTasks } from "@/content/speaking";
import { listArgumentTasks, part3TopicWeight } from "@/content/speaking/part3";
import { PART11_BANK_ENTRY_ID, parsePart11SetId, pickPart11SetId } from "@/content/speaking/part1/part1-1-sets";
import { examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import {
  MOCK_EXPIRES_AFTER_MS,
  MOCK_PARTS,
  effectiveMockStatus,
  isMockComplete,
  mockRefusal,
  nextMockPart,
  pickTaskForPart,
  pickWeightedTask,
  type FinishedPart,
  type MockRefusal,
  type MockStatus,
} from "@/domain/speaking/full-mock";
import { getDb } from "@/server/db/client";
import { practiceSessions, speakingAttempts } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { assertOwnedOrNotFound } from "@/server/identity/authorization";
import { newId } from "@/server/ids";
import * as repo from "@/server/attempts/attempt-repository";

/*
 * The full mock exam on the server (docs/v1-plan.md section 3.2; the rules are pure, in domain/speaking/full-mock.ts).
 * One practice_sessions row of kind "full_mock"; its finished parts are its attempts. Every read is by the caller's own
 * user id, and a session of someone else (or a single-task session) is reported exactly like one that does not exist.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MockPartView {
  part: ExamPartId;
  /** The attempt of this part (null: not done yet). Its own result page is /result/<attemptId>. */
  attemptId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  /** The attempt's processing status ("completed", "failed", "processing" …); null before the part is done. */
  attemptStatus: string | null;
}

export interface MockView {
  id: string;
  status: MockStatus;
  createdAt: string;
  finishedAt: string | null;
  /** All four parts in exam order. */
  parts: MockPartView[];
  /** The next part to play (null: all four are done). */
  nextPart: ExamPartId | null;
  /** When an in-progress mock runs out of time. */
  expiresAt: string;
  /** Set when the mock was taken on a teacher's exam laptop ("In class"); null = at home. */
  classMockId: string | null;
}

type SessionRow = typeof practiceSessions.$inferSelect;

/** An in-progress mock older than 24 hours becomes "not_finished". Its attempts, and so its results, are untouched. */
export async function expireStaleMocks(userId: string, now = Date.now()): Promise<void> {
  const db = await getDb();
  await db
    .update(practiceSessions)
    .set({ status: "not_finished" })
    .where(
      and(
        eq(practiceSessions.userId, userId),
        eq(practiceSessions.kind, "full_mock"),
        eq(practiceSessions.status, "in_progress"),
        lt(practiceSessions.createdAt, new Date(now - MOCK_EXPIRES_AFTER_MS).toISOString()),
      ),
    )
    .run();
}

async function loadMockSession(userId: string, mockId: string): Promise<SessionRow> {
  const db = await getDb();
  const row = UUID_PATTERN.test(mockId) ? await db.select().from(practiceSessions).where(eq(practiceSessions.id, mockId)).get() : undefined;
  const owned = assertOwnedOrNotFound(userId, row, () => new HttpError(404, "mock_not_found", "This mock exam could not be found."));
  if (owned.kind !== "full_mock") throw new HttpError(404, "mock_not_found", "This mock exam could not be found.");
  return owned;
}

/** The session's finished parts: its attempts, one per part (the first if a part somehow has two). */
async function finishedPartsOf(sessionId: string): Promise<(FinishedPart & { status: string })[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: speakingAttempts.id, taskId: speakingAttempts.taskId, status: speakingAttempts.status })
    .from(speakingAttempts)
    .where(eq(speakingAttempts.sessionId, sessionId))
    .orderBy(asc(speakingAttempts.createdAt), asc(speakingAttempts.id))
    .all();
  const parts = new Map<ExamPartId, FinishedPart & { status: string }>();
  for (const row of rows) {
    const task = getAnySpeakingTask(row.taskId);
    const part = task ? examPartOf(task) : null;
    if (part && !parts.has(part)) parts.set(part, { part, attemptId: row.id, taskId: row.taskId, status: row.status });
  }
  return [...parts.values()];
}

function toView(row: SessionRow, finished: readonly (FinishedPart & { status: string })[], now: number): MockView {
  const status = effectiveMockStatus({ status: row.status ?? "in_progress", createdAt: row.createdAt }, now);
  return {
    id: row.id,
    status,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    parts: MOCK_PARTS.map((part) => {
      const done = finished.find((p) => p.part === part);
      return {
        part,
        attemptId: done?.attemptId ?? null,
        taskId: done?.taskId ?? null,
        taskTitle: done ? (getAnySpeakingTask(done.taskId)?.title ?? null) : null,
        attemptStatus: done?.status ?? null,
      };
    }),
    nextPart: status === "in_progress" ? nextMockPart(finished) : null,
    expiresAt: new Date(Date.parse(row.createdAt) + MOCK_EXPIRES_AFTER_MS).toISOString(),
    classMockId: row.classMockId,
  };
}

/** The caller's own mock, for the dashboard card, the result links and the runner. 404 for anyone else's. */
export async function getMock(userId: string, mockId: string, now = Date.now()): Promise<MockView> {
  await expireStaleMocks(userId, now);
  const row = await loadMockSession(userId, mockId);
  return toView(row, await finishedPartsOf(row.id), now);
}

/**
 * The caller's mock that is still in progress (the newest, after the 24-hour rule ran), or null. Reads only their rows.
 * A mock started on a teacher's exam laptop (`class_mock_id`) is never "continued" at home: it belongs to that class mock.
 */
export async function findInProgressMock(userId: string, now = Date.now()): Promise<MockView | null> {
  await expireStaleMocks(userId, now);
  const db = await getDb();
  const row = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.kind, "full_mock"), eq(practiceSessions.status, "in_progress"), isNull(practiceSessions.classMockId)))
    .orderBy(desc(practiceSessions.createdAt))
    .limit(1)
    .get();
  return row ? toView(row, await finishedPartsOf(row.id), now) : null;
}

/**
 * Start a mock, or return the one already in progress ("Continue your mock"). A student has at most one mock in progress:
 * a second tab or a double tap gets the same session, never a second one.
 */
export async function startOrResumeMock(userId: string, now = Date.now()): Promise<{ mock: MockView; resumed: boolean }> {
  const existing = await findInProgressMock(userId, now);
  if (existing) return { mock: existing, resumed: true };
  const id = newId();
  const db = await getDb();
  await db
    .insert(practiceSessions)
    .values({ id, userId, kind: "full_mock", status: "in_progress", createdAt: new Date(now).toISOString() })
    .run();
  return { mock: await getMock(userId, id, now), resumed: false };
}

/** Mark a mock "finished" once all four parts are in. Safe to repeat; refuses an incomplete or ended mock. */
export async function finishMock(userId: string, mockId: string, now = Date.now()): Promise<MockView> {
  const view = await getMock(userId, mockId, now);
  if (view.status === "finished") return view;
  if (view.status !== "in_progress") throw new HttpError(409, "mock_not_in_progress", "This mock exam has ended.");
  if (!isMockComplete(view.parts.filter((p) => p.attemptId).map((p) => ({ part: p.part })))) {
    throw new HttpError(409, "mock_incomplete", "Not every part of this mock exam has been sent yet.");
  }
  const db = await getDb();
  await db
    .update(practiceSessions)
    .set({ status: "finished", finishedAt: new Date(now).toISOString() })
    .where(and(eq(practiceSessions.id, view.id), eq(practiceSessions.userId, userId), eq(practiceSessions.status, "in_progress")))
    .run();
  return getMock(userId, mockId, now);
}

const REFUSALS: Record<MockRefusal, HttpError> = {
  not_in_progress: new HttpError(409, "mock_not_in_progress", "This mock exam has ended."),
  expired: new HttpError(
    409,
    "mock_expired",
    "This mock exam took more than 24 hours, so it is closed. The parts you finished keep their results. Start a new mock when you are ready.",
  ),
  part_done: new HttpError(409, "mock_part_done", "This part of the mock exam was already sent."),
  not_a_mock_part: new HttpError(400, "invalid_fields", "The upload was missing information."),
};

/** The session as a mock the caller owns, or null when it is no session, someone else's, or a single-task session. */
export async function findOwnedMockSession(userId: string, sessionId: string | null | undefined): Promise<SessionRow | null> {
  if (!sessionId || !UUID_PATTERN.test(sessionId)) return null;
  const db = await getDb();
  const row = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId), eq(practiceSessions.kind, "full_mock")))
    .get();
  return row ?? null;
}

/**
 * Called before a recording is stored: may this task's recording join this mock now? Throws 409 when the mock ended or ran
 * out of time, or the part was already sent (a resend of the same recording is answered before this is reached).
 */
export async function assertMockAcceptsPart(session: SessionRow, taskId: string, now = Date.now()): Promise<void> {
  const task = getAnySpeakingTask(taskId);
  const part = task ? examPartOf(task) : null;
  const refusal = mockRefusal({ status: session.status ?? "in_progress", createdAt: session.createdAt }, await finishedPartsOf(session.id), part, now);
  if (refusal) {
    // The stored status catches up with the clock, so History and the dashboard agree with this answer.
    if (refusal === "expired") await expireStaleMocks(session.userId, now);
    throw REFUSALS[refusal];
  }
}

/* ------------------------------------------------------------------------------------------------- task picker */

/** The tasks a part can use (all of them: the part being live is decided by the mock's switch, not per task). */
export function mockTasksForPart(part: ExamPartId): { id: string; title: string }[] {
  return part === "3"
    ? listArgumentTasks().map(({ id, title }) => ({ id, title }))
    : listAllSpeakingTasks().filter((t) => examPartOf(t) === part).map(({ id, title }) => ({ id, title }));
}

/**
 * One task per part still to do, each one the student hasn't done recently (domain/speaking/full-mock.ts), from their own
 * attempts. Read only: the page that shows "Before you start" asks for it, nothing is stored.
 */
export async function planMockTasks(
  userId: string | null,
  parts: readonly ExamPartId[] = MOCK_PARTS,
  random: () => number = Math.random,
): Promise<Partial<Record<ExamPartId, string>>> {
  // A browser with no identity yet has done nothing: every task is new to it.
  const history = userId ? (await repo.listAttemptsForUser(userId)).map((r) => ({ taskId: r.attempt.taskId, createdAt: r.attempt.createdAt })) : [];
  const plan: Partial<Record<ExamPartId, string>> = {};
  for (const part of parts) {
    const id = pickForPart(part, history, random);
    if (id) plan[part] = id;
  }
  return plan;
}

/**
 * The task for one part: Part 1.1 a frequency-weighted question set, Part 3 a frequency-weighted topic (not one of the
 * latest three done), the other parts the task not done for longest (pickTaskForPart).
 */
export function pickForPart(part: ExamPartId, history: readonly { taskId: string; createdAt: string }[], random: () => number = Math.random): string | null {
  if (part === "3") return pickWeightedTask(mockTasksForPart(part), (t) => part3TopicWeight(t.id), history, random)?.id ?? null;
  const pick = pickTaskForPart(mockTasksForPart(part), history, random);
  return pick ? resolvePart11Pick(pick.id, history, random) : null;
}

/**
 * Part 1.1 is a question bank, not a list of fixed tasks: its one entry becomes a set of three questions picked by
 * frequency (content/speaking/part1/part1-1-sets.ts), leaving out the questions of the latest set in `history` so two
 * mocks in a row ask different questions. Any other id is returned as it is.
 */
export function resolvePart11Pick(taskId: string, history: readonly { taskId: string; createdAt: string }[], random: () => number = Math.random): string {
  if (taskId !== PART11_BANK_ENTRY_ID) return taskId;
  const latest = [...history]
    .filter((h) => parsePart11SetId(h.taskId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return pickPart11SetId(random, { avoid: latest ? parsePart11SetId(latest.taskId)! : [] });
}

/** A Part 1.1 set for one student's practice (the task list's Part 1.1 card), avoiding their latest set's questions. */
export async function pickPart11SetForUser(userId: string | null, random: () => number = Math.random): Promise<string> {
  const history = userId ? (await repo.listAttemptsForUser(userId)).map((r) => ({ taskId: r.attempt.taskId, createdAt: r.attempt.createdAt })) : [];
  return resolvePart11Pick(PART11_BANK_ENTRY_ID, history, random);
}

/** Count of the session's attempts, for tests and the runner's sanity checks. */
export async function countMockAttempts(sessionId: string): Promise<number> {
  const db = await getDb();
  const row = await db.select({ n: sql<number>`count(*)` }).from(speakingAttempts).where(eq(speakingAttempts.sessionId, sessionId)).get();
  return Number(row?.n ?? 0);
}
