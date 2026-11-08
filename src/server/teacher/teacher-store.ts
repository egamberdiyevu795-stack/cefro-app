import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { examPartOf } from "@/domain/speaking/exam-part";
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  SHARE_TEXT_VERSION,
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
import { classMembers, classes, ratingPairs, speakingAttempts, speakingTasks, teacherRatings, users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { newId, nowIso } from "@/server/ids";

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
    await tx.update(classes).set({ closedAt: nowIso() }).where(eq(classes.id, classId)).run();
  });
}

/* ------------------------------------------------------------------------------------------------------- members */

export type MemberRow = typeof classMembers.$inferSelect;

/** The open members of a class, in the order they shared. Only for its teacher (call `ownOpenClass` first). */
export async function openMembers(classId: string): Promise<MemberRow[]> {
  return (await getDb()).select().from(classMembers).where(and(eq(classMembers.classId, classId), isNull(classMembers.endedAt))).orderBy(classMembers.sharedAt).all();
}

/** One open member of the caller's own open class, or 404. */
export async function ownOpenMember(teacherId: string, classId: string, memberId: string): Promise<{ cls: ClassRow; member: MemberRow }> {
  const cls = await ownOpenClass(teacherId, classId);
  const member = await (await getDb())
    .select()
    .from(classMembers)
    .where(and(eq(classMembers.id, memberId), eq(classMembers.classId, classId), isNull(classMembers.endedAt)))
    .get();
  if (!member) throw notFound();
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
  await tx.update(classMembers).set({ endedAt: nowIso(), endedBy }).where(eq(classMembers.id, member.id)).run();
}

/* -------------------------------------------------------------------------------------------------------- access */

export interface Visible {
  classId: string;
  memberId: string;
  shownName: string;
  sharedAt: string;
  studentUserId: string;
}

/**
 * THE teacher access check (plan section 4): the caller is a teacher, an open membership joins one of the caller's
 * open classes to the attempt's owner, and the attempt was created after that membership's `shared_at`. Null
 * otherwise (the caller then gets the same 404 as a stranger). Runs on every teacher page and API request.
 */
export async function teacherCanSee(teacherId: string, attemptId: string): Promise<Visible | null> {
  if ((await userRole(teacherId)) !== "teacher") return null;
  const db = await getDb();
  const attempt = await db.select({ userId: speakingAttempts.userId, createdAt: speakingAttempts.createdAt }).from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
  if (!attempt) return null;
  const rows = await db
    .select({ classId: classMembers.classId, memberId: classMembers.id, shownName: classMembers.shownName, sharedAt: classMembers.sharedAt })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(
      and(
        eq(classMembers.studentUserId, attempt.userId),
        isNull(classMembers.endedAt),
        eq(classes.teacherUserId, teacherId),
        isNull(classes.closedAt),
        // Created after the student tapped Share (ISO times compare as text).
        lt(classMembers.sharedAt, attempt.createdAt),
      ),
    )
    .all();
  const row = rows[0];
  return row ? { ...row, studentUserId: attempt.userId } : null;
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
export async function shareWithClass(studentId: string, code: unknown, shownName: unknown): Promise<{ memberId: string } | null> {
  const problem = shownNameProblem(shownName);
  if (problem) throw new HttpError(400, "invalid_shown_name", problem);
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
    .values({ id: memberId, classId: found.id, studentUserId: studentId, shownName: normaliseName(shownName as string), sharedAt: nowIso(), shareTextVersion: SHARE_TEXT_VERSION })
    .run();
  return { memberId };
}

export interface Membership {
  id: string;
  className: string;
  teacherName: string;
  shownName: string;
  sharedAt: string;
  /** Null while sharing. */
  endedBy: EndedBy | null;
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
    }));
}

/** Leave class: the student's own open membership ends (`student`); the teacher's ratings become anonymous pairs. */
export async function leaveClass(studentId: string, memberId: string): Promise<void> {
  const db = await getDb();
  const member = await db.select().from(classMembers).where(and(eq(classMembers.id, memberId), eq(classMembers.studentUserId, studentId), isNull(classMembers.endedAt))).get();
  if (!member) throw notFound();
  await db.transaction((tx) => endMembership(tx, member, "student"));
}
