import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getAnySpeakingTask } from "@/content/speaking";
import { examPartOf } from "@/domain/speaking/exam-part";
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  LEGACY_SHARE_TEXT_VERSION,
  SHARE_TEXT_VERSION,
  canHearRecording,
  isMockLevel,
  memberSeesAttempt,
  memberSeesMock,
  needsUpgradeAnswer,
  type MockLevel,
  classNameProblem,
  isJoinCode,
  normaliseJoinCode,
  ratingPair,
  SHOWN_NAME_FROM_EMAIL,
  shownNameProblem,
  shownNameUsesEmail,
  type EndedBy,
} from "@/domain/teacher/rules";
import { accountDisplayName, normaliseName } from "@/domain/account";
import { getDb, type Db } from "@/server/db/client";
import { classMembers, classMocks, classes, examPasses, practiceSessions, ratingPairs, recordings, speakingAttempts, speakingTasks, teacherMockRatings, teacherRatings, users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { TEACHER_SHARING_LOCKED_MESSAGE, teacherSharingAllowed, teacherSharingConsentRecorded } from "@/server/consent/consent";
import { newId, nowIso } from "@/server/ids";
import { isPin, PIN_PROBLEM } from "@/domain/teacher/exam-laptop";
import { hashPin } from "@/server/exam-laptop/pin";

/*
 * The Teacher view's data (docs/teacher-plan.md, sections 3–5). Every function takes the caller's own user id (from
 * `requireAuthenticated`, never from the request) and checks what that caller may touch. Anything a caller may not
 * see is the same 404 as a stranger's result, so ids reveal nothing.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const notFound = () => new HttpError(404, "not_found", "Not found.");

/** The caller's role. Null for an unknown id. Set only by the owner's script, never here. */
export async function userRole(userId: string): Promise<"student" | "teacher" | null> {
  const row = await (await getDb()).select({ role: users.role, kind: users.kind }).from(users).where(eq(users.id, userId)).get();
  if (!row) return null;
  return row.kind === "registered" ? row.role : "student";
}

/** 404 unless the caller is a teacher. */
export async function requireTeacher(userId: string): Promise<void> {
  if ((await userRole(userId)) !== "teacher") throw notFound();
}

/* ------------------------------------------------------------------------------------------------------- classes */

export interface ClassRow {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
}

async function uniqueJoinCode(db: Db): Promise<string> {
  for (let i = 0; i < 20; i++) {
    let code = "";
    for (let j = 0; j < JOIN_CODE_LENGTH; j++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
    const taken = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, code)).get();
    if (!taken) return code;
  }
  throw new Error("Could not find a free join code");
}

export async function createClass(teacherId: string, name: unknown): Promise<ClassRow> {
  await requireTeacher(teacherId);
  const problem = classNameProblem(name);
  if (problem) throw new HttpError(400, "invalid_class_name", problem);
  const db = await getDb();
  const row = { id: newId(), teacherUserId: teacherId, name: normaliseName(name as string), joinCode: await uniqueJoinCode(db), createdAt: nowIso() };
  await db.insert(classes).values(row).run();
  return { id: row.id, name: row.name, joinCode: row.joinCode, createdAt: row.createdAt };
}

/** The caller's own open class, or 404 (another teacher's, a closed one, a missing id, or the caller is not a teacher). */
export async function ownOpenClass(teacherId: string, classId: string): Promise<ClassRow> {
  await requireTeacher(teacherId);
  const row = await (await getDb())
    .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode, createdAt: classes.createdAt })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherUserId, teacherId), isNull(classes.closedAt)))
    .get();
  if (!row) throw notFound();
  return row;
}

/** The caller's open classes, newest first. */
export async function listOwnClasses(teacherId: string): Promise<ClassRow[]> {
  await requireTeacher(teacherId);
  return (await getDb())
    .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode, createdAt: classes.createdAt })
    .from(classes)
    .where(and(eq(classes.teacherUserId, teacherId), isNull(classes.closedAt)))
    .orderBy(desc(classes.createdAt))
    .all();
}

/** A new code; the old one stops working at once. Members stay. */
export async function resetJoinCode(teacherId: string, classId: string): Promise<string> {
  await ownOpenClass(teacherId, classId);
  const db = await getDb();
  const joinCode = await uniqueJoinCode(db);
  await db.update(classes).set({ joinCode }).where(eq(classes.id, classId)).run();
  return joinCode;
}

/** Close: every membership ends (`class_closed`), ratings become anonymous pairs, the class leaves every list. */
export async function closeClass(teacherId: string, classId: string): Promise<void> {
  await ownOpenClass(teacherId, classId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const open = await tx.select().from(classMembers).where(and(eq(classMembers.classId, classId), isNull(classMembers.endedAt))).all();
    for (const member of open) await endMembership(tx, member, "class_closed");
    // Exam laptop: a closed class has no open class mock (no new PIN or mock can start).
    await tx.update(classMocks).set({ closedAt: nowIso() }).where(and(eq(classMocks.classId, classId), isNull(classMocks.closedAt))).run();
    await tx.update(classes).set({ closedAt: nowIso() }).where(eq(classes.id, classId)).run();
  });
}

/* ------------------------------------------------------------------------------------------------------- members */

export type MemberRow = typeof classMembers.$inferSelect;

/** The open members of a class, in the order they shared. Only for its teacher (call `ownOpenClass` first). */
export async function openMembers(classId: string): Promise<MemberRow[]> {
  const rows = await (await getDb()).select().from(classMembers).where(and(eq(classMembers.classId, classId), isNull(classMembers.endedAt))).orderBy(classMembers.sharedAt).all();
  // Pilot consent: a student whose teacher-sharing consent is missing or withdrawn is not shown to the teacher.
  const allowed = await Promise.all(rows.map((row) => teacherSharingAllowed(row.studentUserId)));
  return rows.filter((_, i) => allowed[i]);
}

/** One open member of the caller's own open class, or 404. */
export async function ownOpenMember(teacherId: string, classId: string, memberId: string): Promise<{ cls: ClassRow; member: MemberRow }> {
  const cls = await ownOpenClass(teacherId, classId);
  const member = await (await getDb())
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.id, memberId), eq(classMembers.classId, classId), isNull(classMembers.endedAt)))
    .get();
  if (!member || !(await teacherSharingAllowed(member.studentUserId))) throw notFound();
  return { cls, member };
}

/** Remove a student: their membership ends (`teacher`), the teacher's ratings become anonymous pairs. */
export async function removeStudent(teacherId: string, classId: string, memberId: string): Promise<void> {
  const { member } = await ownOpenMember(teacherId, classId, memberId);
  await (await getDb()).transaction((tx) => endMembership(tx, member, "teacher"));
}

/**
 * Ends one membership, in the caller's transaction: `ended_at` is set; each of the class teacher's ratings on that
 * student's attempts (given in this class) becomes one anonymous `rating_pairs` row, and the rating row is deleted.
 */
async function endMembership(tx: Tx, member: MemberRow, endedBy: EndedBy): Promise<void> {
  const ratings = await tx
    .select({ rating: teacherRatings, part: speakingTasks.part, level: speakingTasks.level })
    .from(teacherRatings)
    .innerJoin(speakingAttempts, eq(speakingAttempts.id, teacherRatings.attemptId))
    .innerJoin(speakingTasks, and(eq(speakingTasks.id, speakingAttempts.taskId), eq(speakingTasks.version, speakingAttempts.taskVersion)))
    .where(and(eq(teacherRatings.classId, member.classId), eq(speakingAttempts.userId, member.studentUserId)))
    .all();
  if (ratings.length) {
    await tx.insert(ratingPairs).values(ratings.map(({ rating, part, level }) => ratingPair(rating, examPartOf({ part, level }) ?? String(part)))).run();
    await tx.delete(teacherRatings).where(inArray(teacherRatings.id, ratings.map(({ rating }) => rating.id))).run();
  }
  // Whole-mock levels (migration 0009) go with the membership. A level is not a band, so no pair is kept for them; the
  // part ratings above already left their pairs.
  const mockSessions = await tx.select({ id: practiceSessions.id }).from(practiceSessions).where(eq(practiceSessions.userId, member.studentUserId)).all();
  if (mockSessions.length) {
    await tx
      .delete(teacherMockRatings)
      .where(and(eq(teacherMockRatings.classId, member.classId), inArray(teacherMockRatings.sessionId, mockSessions.map((s) => s.id))))
      .run();
  }
  // Exam laptop (migration 0010): the class PIN and its failure counts go with the membership, and every pass this student
  // holds for this class's class mocks ends at once (a laptop in the middle of their mock can't record any more).
  const classMockIds = (await tx.select({ id: classMocks.id }).from(classMocks).where(eq(classMocks.classId, member.classId)).all()).map((row) => row.id);
  if (classMockIds.length) {
    await tx
      .update(examPasses)
      .set({ usedUpAt: nowIso() })
      .where(and(eq(examPasses.studentUserId, member.studentUserId), inArray(examPasses.classMockId, classMockIds), isNull(examPasses.usedUpAt)))
      .run();
  }
  await tx.update(classMembers).set({ endedAt: nowIso(), endedBy, pinHash: null, pinFailures: null }).where(eq(classMembers.id, member.id)).run();
}

/* -------------------------------------------------------------------------------------------------------- access */

export interface Visible {
  classId: string;
  memberId: string;
  shownName: string;
  sharedAt: string;
  studentUserId: string;
  /** Which wording this membership agreed to (`share_text_version`): decides what the teacher may see and hear. */
  shareTextVersion: string;
  /** Set when an old member upgraded ("Share recordings too"). */
  allPartsFrom: string | null;
}

/** The caller's open memberships (in their own open classes) of one student, with what each one agreed to. */
async function teacherMembershipsOf(teacherId: string, studentUserId: string) {
  return (await getDb())
    .select({
      classId: classMembers.classId,
      memberId: classMembers.id,
      shownName: classMembers.shownName,
      sharedAt: classMembers.sharedAt,
      shareTextVersion: classMembers.shareTextVersion,
      allPartsFrom: classMembers.allPartsFrom,
    })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.studentUserId, studentUserId), isNull(classMembers.endedAt), eq(classes.teacherUserId, teacherId), isNull(classes.closedAt)))
    .all();
}

/** The exam part of a stored task snapshot id ("1.1", "1.2", "2", "3"), or null. */
function partOfTask(taskId: string): string | null {
  const task = getAnySpeakingTask(taskId);
  return task ? examPartOf(task) : null;
}

/**
 * THE teacher access check for attempts (plan section 4): the caller is a teacher, an open membership joins one of the
 * caller's open classes to the attempt's owner, and the membership's scope covers the attempt: made after the student
 * tapped Share, any part on the current wording ("v1-all-parts-audio"), Part 2 only on the old one unless upgraded
 * (`memberSeesAttempt`). Null otherwise (the caller then gets the same 404 as a stranger). Runs on every teacher page
 * and API request.
 */
export async function teacherCanSee(teacherId: string, attemptId: string): Promise<Visible | null> {
  if ((await userRole(teacherId)) !== "teacher") return null;
  const db = await getDb();
  const attempt = await db.select({ userId: speakingAttempts.userId, createdAt: speakingAttempts.createdAt, taskId: speakingAttempts.taskId }).from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
  if (!attempt) return null;
  const part = partOfTask(attempt.taskId);
  const row = (await teacherMembershipsOf(teacherId, attempt.userId)).find((m) => memberSeesAttempt(m, { part, createdAt: attempt.createdAt }));
  // Pilot consent: no teacher sees the attempts of a student without teacher-sharing consent.
  if (!row || !(await teacherSharingAllowed(attempt.userId))) return null;
  return { ...row, studentUserId: attempt.userId };
}

/** A student's full mock as a teacher may see it: started after their full scope began (never for an old, un-upgraded membership). */
export async function teacherCanSeeMock(teacherId: string, mockId: string): Promise<(Visible & { createdAt: string }) | null> {
  if ((await userRole(teacherId)) !== "teacher") return null;
  const session = await (await getDb()).select().from(practiceSessions).where(eq(practiceSessions.id, mockId)).get();
  if (!session || session.kind !== "full_mock") return null;
  const row = (await teacherMembershipsOf(teacherId, session.userId)).find((m) => memberSeesMock(m, session));
  if (!row || !(await teacherSharingAllowed(session.userId))) return null;
  return { ...row, studentUserId: session.userId, createdAt: session.createdAt };
}

export interface Hearable {
  visible: Visible;
  storageKey: string;
  mimeType: string;
  durationMs: number;
}

/**
 * Recordings (plan section 4.4): `teacherCanHear` = `teacherCanSee` AND the account still has `consent_teacher_sharing`
 * AND the audio is not deleted (and, on the old wording, the attempt was made after an upgrade). Null otherwise: the
 * same 404 as a stranger's recording. No log of who listened (Asadbek, Q4).
 */
export async function teacherCanHear(teacherId: string, attemptId: string): Promise<Hearable | null> {
  const visible = await teacherCanSee(teacherId, attemptId);
  if (!visible) return null;
  const db = await getDb();
  const attempt = await db.select({ createdAt: speakingAttempts.createdAt, taskId: speakingAttempts.taskId }).from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
  const recording = await db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get();
  if (!attempt) return null;
  const hears = canHearRecording({
    sees: true,
    consentTeacherSharing: await teacherSharingConsentRecorded(visible.studentUserId),
    audioDeletedAt: recording?.audioDeletedAt ?? null,
    hasRecording: Boolean(recording),
    member: visible,
    attempt: { part: partOfTask(attempt.taskId), createdAt: attempt.createdAt },
  });
  return hears && recording ? { visible, storageKey: recording.storageKey, mimeType: recording.mimeType, durationMs: recording.durationMs } : null;
}

/* ------------------------------------------------------------------------------------------------------- ratings */

export type RatingRow = typeof teacherRatings.$inferSelect;

/** The caller's rating of an attempt (call `teacherCanSee` first). */
export async function findRating(teacherId: string, attemptId: string): Promise<RatingRow | null> {
  return (await (await getDb()).select().from(teacherRatings).where(and(eq(teacherRatings.attemptId, attemptId), eq(teacherRatings.teacherUserId, teacherId))).get()) ?? null;
}

/** Save (or change) the caller's rating. The app band and methodology come from the stored evaluation. */
export async function saveRating(
  teacherId: string,
  visible: Visible,
  attemptId: string,
  input: { agrees: true } | { agrees: false; band: number },
  app: { band: number; bandMax: number; evaluatorVersion: string; rubricVersion: string },
): Promise<RatingRow> {
  if (!input.agrees && (!Number.isInteger(input.band) || input.band < 0 || input.band > app.bandMax)) {
    throw new HttpError(400, "invalid_band", "Choose a band from the list.");
  }
  const db = await getDb();
  const now = nowIso();
  const values = {
    agrees: input.agrees,
    teacherBand: input.agrees ? null : input.band,
    appBand: app.band,
    evaluatorVersion: app.evaluatorVersion,
    rubricVersion: app.rubricVersion,
    classId: visible.classId,
    updatedAt: now,
  };
  await db
    .insert(teacherRatings)
    .values({ id: newId(), attemptId, teacherUserId: teacherId, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [teacherRatings.attemptId, teacherRatings.teacherUserId], set: values })
    .run();
  return (await findRating(teacherId, attemptId))!;
}

/* ------------------------------------------------------------------------------------------------- student side */

export interface ClassInvite {
  className: string;
  teacherName: string;
}

/** The open class with this code, or the one "can't find" error (wrong, malformed, reset or closed codes alike). */
async function classByCode(code: unknown) {
  const normalised = normaliseJoinCode(code);
  if (!isJoinCode(normalised)) return null;
  return (
    (await (await getDb())
      .select({ id: classes.id, name: classes.name, teacherUserId: classes.teacherUserId, teacherName: users.name, teacherEmail: users.email })
      .from(classes)
      .innerJoin(users, eq(users.id, classes.teacherUserId))
      .where(and(eq(classes.joinCode, normalised), isNull(classes.closedAt), eq(users.role, "teacher")))
      .get()) ?? null
  );
}

/** S1 → S2: who the code belongs to. Nothing is stored. Null for a code that matches no open class. */
export async function lookUpCode(code: unknown): Promise<ClassInvite | null> {
  const found = await classByCode(code);
  return found ? { className: found.name, teacherName: teacherDisplayName(found.teacherName, found.teacherEmail) } : null;
}

/** A teacher's name as students see it: the account's display name (never the email, nor a name made from it). */
export function teacherDisplayName(name: string | null, email: string | null = null): string {
  return accountDisplayName(name, email) ?? "Your teacher";
}

/** The account's email, to keep it out of what a teacher sees (`teacherSafeShownName`). Never sent anywhere. */
export async function accountEmail(userId: string): Promise<string | null> {
  return (await (await getDb()).select({ email: users.email }).from(users).where(eq(users.id, userId)).get())?.email ?? null;
}

/**
 * The S2 tap ("Share with this teacher"): the first time anything is stored. `shared_at` is now; only attempts made
 * after it are shared. Null for a code that matches no open class. Already in the class: 409.
 */
export async function shareWithClass(studentId: string, code: unknown, shownName: unknown, pin?: unknown): Promise<{ memberId: string } | null> {
  // Pilot consent: Share needs teacher-sharing consent (CONSENT_REQUIRED on), checked before anything is looked up.
  if (!(await teacherSharingAllowed(studentId))) throw new HttpError(403, "teacher_sharing_not_allowed", TEACHER_SHARING_LOCKED_MESSAGE);
  const problem = shownNameProblem(shownName);
  if (problem) throw new HttpError(400, "invalid_shown_name", problem);
  // The class PIN for the exam laptop (optional here, asked for on the Share screen). Checked before anything is stored.
  if (pin != null && !isPin(pin)) throw new HttpError(400, "invalid_pin", PIN_PROBLEM);
  const found = await classByCode(code);
  if (!found) return null;
  if (found.teacherUserId === studentId) throw new HttpError(400, "own_class", "This is your own class.");
  if (shownNameUsesEmail(shownName as string, await accountEmail(studentId))) throw new HttpError(400, "invalid_shown_name", SHOWN_NAME_FROM_EMAIL);
  const db = await getDb();
  const open = await db.select({ id: classMembers.id }).from(classMembers).where(and(eq(classMembers.classId, found.id), eq(classMembers.studentUserId, studentId), isNull(classMembers.endedAt))).get();
  if (open) throw new HttpError(409, "already_member", "You're already sharing with this class.");
  const memberId = newId();
  await db
    .insert(classMembers)
    .values({
      id: memberId,
      classId: found.id,
      studentUserId: studentId,
      shownName: normaliseName(shownName as string),
      sharedAt: nowIso(),
      shareTextVersion: SHARE_TEXT_VERSION,
      pinHash: pin == null ? null : await hashPin(pin as string),
    })
    .run();
  return { memberId };
}

/**
 * The student sets (or changes) the class PIN for one of their own open memberships, on their own device. The teacher never
 * sees it and can't reset it; a new PIN also clears any lock. 404 for anyone else's membership or an ended one.
 */
export async function setClassPin(studentId: string, memberId: string, pin: unknown): Promise<void> {
  if (!isPin(pin)) throw new HttpError(400, "invalid_pin", PIN_PROBLEM);
  const db = await getDb();
  const member = await db.select({ id: classMembers.id }).from(classMembers).where(and(eq(classMembers.id, memberId), eq(classMembers.studentUserId, studentId), isNull(classMembers.endedAt))).get();
  if (!member) throw notFound();
  await db.update(classMembers).set({ pinHash: await hashPin(pin), pinFailures: null }).where(eq(classMembers.id, member.id)).run();
}

export interface Membership {
  id: string;
  className: string;
  teacherName: string;
  shownName: string;
  sharedAt: string;
  /** Null while sharing. */
  endedBy: EndedBy | null;
  /** An old wording, not upgraded and not declined: the Account page shows "Share recordings too?" once. */
  needsUpgrade: boolean;
  /** The student has set a class PIN (never the PIN or its hash). Only for a membership that is still open. */
  hasPin: boolean;
}

/**
 * The student's own memberships (S3): open ones, and those the teacher ended (Remove or Close), newest first. Rows the
 * student ended themselves (Leave) are not listed. Never another student.
 */
export async function listMemberships(studentId: string): Promise<Membership[]> {
  const rows = await (await getDb())
    .select({ member: classMembers, className: classes.name, teacherName: users.name, teacherEmail: users.email })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .innerJoin(users, eq(users.id, classes.teacherUserId))
    .where(eq(classMembers.studentUserId, studentId))
    .orderBy(desc(classMembers.sharedAt))
    .all();
  return rows
    .filter(({ member }) => member.endedBy !== "student")
    .map(({ member, className, teacherName, teacherEmail }) => ({
      id: member.id,
      className,
      teacherName: teacherDisplayName(teacherName, teacherEmail),
      shownName: member.shownName,
      sharedAt: member.sharedAt,
      endedBy: member.endedBy ?? null,
      needsUpgrade: needsUpgradeAnswer(member),
      hasPin: !member.endedBy && Boolean(member.pinHash),
    }));
}

/** Leave class: the student's own open membership ends (`student`); the teacher's ratings become anonymous pairs. */
export async function leaveClass(studentId: string, memberId: string): Promise<void> {
  const db = await getDb();
  const member = await db.select().from(classMembers).where(and(eq(classMembers.id, memberId), eq(classMembers.studentUserId, studentId), isNull(classMembers.endedAt))).get();
  if (!member) throw notFound();
  await db.transaction((tx) => endMembership(tx, member, "student"));
}


/* ------------------------------------------------------------------------------------------------ mock ratings */

export type MockRatingRow = typeof teacherMockRatings.$inferSelect;

export async function findMockRating(teacherId: string, sessionId: string): Promise<MockRatingRow | null> {
  return (await (await getDb()).select().from(teacherMockRatings).where(and(eq(teacherMockRatings.sessionId, sessionId), eq(teacherMockRatings.teacherUserId, teacherId))).get()) ?? null;
}

/** Save (or change) the caller's level for a whole mock (call `teacherCanSeeMock` first). */
export async function saveMockRating(
  teacherId: string,
  visible: Visible,
  sessionId: string,
  input: { agrees: true } | { agrees: false; level: string },
  appLevel: MockLevel | null,
): Promise<MockRatingRow> {
  if (input.agrees && !appLevel) throw new HttpError(409, "estimate_not_ready", "There is no estimate to agree with yet. Choose a level instead.");
  if (!input.agrees && !isMockLevel(input.level)) throw new HttpError(400, "invalid_level", "Choose a level from the list.");
  const now = nowIso();
  const values = { agrees: input.agrees, teacherLevel: input.agrees ? null : input.level, appLevel, classId: visible.classId, updatedAt: now };
  await (await getDb())
    .insert(teacherMockRatings)
    .values({ id: newId(), sessionId, teacherUserId: teacherId, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [teacherMockRatings.sessionId, teacherMockRatings.teacherUserId], set: values })
    .run();
  return (await findMockRating(teacherId, sessionId))!;
}

/* --------------------------------------------------------------------------------- "Share recordings too?" (old members) */

/**
 * The one-time card on the Account page: an old membership's owner taps "Share recordings too". From that moment every
 * part, every mock and the recordings are shared; nothing from before is. The wording stays what they agreed to
 * (`share_text_version` is not rewritten): `all_parts_from` records the upgrade. Needs teacher-sharing consent like Share.
 */
export async function upgradeMembership(studentId: string, memberId: string): Promise<void> {
  if (!(await teacherSharingAllowed(studentId))) throw new HttpError(403, "teacher_sharing_not_allowed", TEACHER_SHARING_LOCKED_MESSAGE);
  const member = await ownCardMember(studentId, memberId);
  await (await getDb()).update(classMembers).set({ allPartsFrom: nowIso() }).where(eq(classMembers.id, member.id)).run();
}

/** "Not now": nothing changes, the card is not shown again. */
export async function declineUpgrade(studentId: string, memberId: string): Promise<void> {
  const member = await ownCardMember(studentId, memberId);
  await (await getDb()).update(classMembers).set({ upgradeDeclinedAt: nowIso() }).where(eq(classMembers.id, member.id)).run();
}

async function ownCardMember(studentId: string, memberId: string): Promise<MemberRow> {
  const member = await (await getDb())
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.id, memberId), eq(classMembers.studentUserId, studentId), isNull(classMembers.endedAt)))
    .get();
  if (!member || !needsUpgradeAnswer(member) || member.shareTextVersion !== LEGACY_SHARE_TEXT_VERSION) throw notFound();
  return member;
}
