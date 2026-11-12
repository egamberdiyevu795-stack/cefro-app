import "server-only";
import { eq, inArray, or } from "drizzle-orm";
import { getEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import {
  analyticsEvents,
  authAccounts,
  authSessions,
  authVerifications,
  classMembers,
  classes,
  evaluations,
  practiceSessions,
  recordingBlobs,
  recordings,
  speakingAttempts,
  teacherMockRatings,
  teacherRatings,
  transcripts,
  users,
} from "@/server/db/schema";
import { getAudioStorage, type AudioStorage } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";

export interface DeletionSummary {
  attempts: number;
  recordings: number;
  transcripts: number;
  evaluations: number;
  /** Recording files removed from disk (`local` audio storage). */
  audioFiles: number;
  /** Recording bytes removed from the database (`database` audio storage, table `recording_blobs`). */
  audioBlobs: number;
  /** Class links removed (`class_members`): the student's own, and those of a teacher's classes. */
  classMemberships: number;
  /** Teacher ratings removed (`teacher_ratings`): on the student's attempts, or given by the teacher. No pair is kept. */
  teacherRatings: number;
  /** A teacher's classes removed (`classes`). */
  classes: number;
}

/**
 * "Delete my account": removes everything CEFRO holds for this user, for good.
 *
 * - The account: the `users` row (name, email, exam date and its Skip), its password (`auth_accounts`), every login
 *   session (`auth_sessions`, so every device is signed out) and any verification token for its email.
 * - Every attempt (`speaking_attempts`) with its result (`evaluations`), transcript (`transcripts`) and recording
 *   reference (`recordings`), the practice sessions, and the analytics events recorded for the user or their attempts.
 * - The recorded audio itself, wherever it is stored (see `server/storage`): files under AUDIO_STORAGE_DIR for the
 *   `local` provider, rows of `recording_blobs` for the `database` provider (the hosted setup).
 * - The anonymous identities that were merged into the account when the student signed up (their tombstones).
 * - Teacher view (docs/teacher-plan.md, section 5): a student's class links (`class_members`) and every teacher rating
 *   on their attempts (`teacher_ratings`), with no anonymous pair made; a teacher's classes, the memberships in them
 *   and every rating they gave. Anonymous `rating_pairs` made at an earlier Leave / Remove / Close can't be linked to
 *   anyone and stay.
 *
 * Order: audio files on disk first (deleting a missing file is not an error), then one database transaction for the
 * rest, `recording_blobs` included. If anything fails, the account still exists and the student can try again; the
 * other order could leave audio behind with nothing pointing to it. Shared task snapshots (`speaking_tasks`) hold no
 * student data and stay. An unknown audio provider stops the deletion rather than leave audio behind.
 */
export async function deleteAccount(userId: string): Promise<DeletionSummary> {
  const db = await getDb();

  // The account and every identity that was merged into it (directly or through another).
  const userIds = [userId];
  for (let i = 0; i < userIds.length; i++) {
    const merged = await db.select({ id: users.id }).from(users).where(eq(users.mergedIntoUserId, userIds[i])).all();
    for (const { id } of merged) if (!userIds.includes(id)) userIds.push(id);
  }
  const account = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get();

  const attemptIds = (await db.select({ id: speakingAttempts.id }).from(speakingAttempts).where(inArray(speakingAttempts.userId, userIds)).all()).map(
    (row) => row.id,
  );
  const stored = attemptIds.length
    ? await db.select({ provider: recordings.storageProvider, key: recordings.storageKey }).from(recordings).where(inArray(recordings.attemptId, attemptIds)).all()
    : [];

  const unknown = stored.find((r) => r.provider !== "local" && r.provider !== "database");
  if (unknown) throw new Error(`Cannot delete audio stored with provider "${unknown.provider}"`);

  // 1. Audio files on disk.
  const localKeys = stored.filter((r) => r.provider === "local").map((r) => r.key);
  if (localKeys.length) {
    const files = localAudioStorage();
    for (const key of localKeys) await files.delete!(key);
  }

  // 2. Everything else, in one transaction (children before parents: foreign keys are enforced).
  return db.transaction(async (tx) => {
    const blobKeys = stored.filter((r) => r.provider === "database").map((r) => r.key);
    const audioBlobs = blobKeys.length ? (await tx.delete(recordingBlobs).where(inArray(recordingBlobs.storageKey, blobKeys)).run()).rowsAffected : 0;
    let evaluationCount = 0;
    let transcriptCount = 0;
    let recordingCount = 0;
    let attemptCount = 0;

    // Teacher view first (its rows point at attempts, users and classes). As a teacher: their classes, the
    // memberships in them and every rating given in them or by them. As a student: their memberships and every
    // rating on their attempts. No anonymous pair is made on deletion.
    const ownClassIds = (await tx.select({ id: classes.id }).from(classes).where(inArray(classes.teacherUserId, userIds)).all()).map((row) => row.id);
    let ratingCount = (await tx.delete(teacherRatings).where(inArray(teacherRatings.teacherUserId, userIds)).run()).rowsAffected;
    if (ownClassIds.length) ratingCount += (await tx.delete(teacherRatings).where(inArray(teacherRatings.classId, ownClassIds)).run()).rowsAffected;
    if (attemptIds.length) ratingCount += (await tx.delete(teacherRatings).where(inArray(teacherRatings.attemptId, attemptIds)).run()).rowsAffected;
    // Whole-mock levels (migration 0009): by the teacher, in their classes, and on the student's own mocks.
    const sessionIds = (await tx.select({ id: practiceSessions.id }).from(practiceSessions).where(inArray(practiceSessions.userId, userIds)).all()).map((row) => row.id);
    ratingCount += (await tx.delete(teacherMockRatings).where(inArray(teacherMockRatings.teacherUserId, userIds)).run()).rowsAffected;
    if (ownClassIds.length) ratingCount += (await tx.delete(teacherMockRatings).where(inArray(teacherMockRatings.classId, ownClassIds)).run()).rowsAffected;
    if (sessionIds.length) ratingCount += (await tx.delete(teacherMockRatings).where(inArray(teacherMockRatings.sessionId, sessionIds)).run()).rowsAffected;
    let memberCount = (await tx.delete(classMembers).where(inArray(classMembers.studentUserId, userIds)).run()).rowsAffected;
    if (ownClassIds.length) memberCount += (await tx.delete(classMembers).where(inArray(classMembers.classId, ownClassIds)).run()).rowsAffected;
    const classCount = ownClassIds.length ? (await tx.delete(classes).where(inArray(classes.id, ownClassIds)).run()).rowsAffected : 0;

    if (attemptIds.length) {
      evaluationCount = (await tx.delete(evaluations).where(inArray(evaluations.attemptId, attemptIds)).run()).rowsAffected;
      transcriptCount = (await tx.delete(transcripts).where(inArray(transcripts.attemptId, attemptIds)).run()).rowsAffected;
      recordingCount = (await tx.delete(recordings).where(inArray(recordings.attemptId, attemptIds)).run()).rowsAffected;
      await tx.delete(analyticsEvents).where(inArray(analyticsEvents.attemptId, attemptIds)).run();
      attemptCount = (await tx.delete(speakingAttempts).where(inArray(speakingAttempts.id, attemptIds)).run()).rowsAffected;
    }
    await tx.delete(practiceSessions).where(inArray(practiceSessions.userId, userIds)).run();
    await tx.delete(analyticsEvents).where(inArray(analyticsEvents.userId, userIds)).run();
    await tx.delete(authSessions).where(inArray(authSessions.userId, userIds)).run();
    await tx.delete(authAccounts).where(inArray(authAccounts.userId, userIds)).run();
    if (account?.email) await tx.delete(authVerifications).where(eq(authVerifications.identifier, account.email)).run();
    // Unlink the merged identities from each other first, then remove every row.
    await tx.update(users).set({ mergedIntoUserId: null }).where(or(inArray(users.id, userIds), inArray(users.mergedIntoUserId, userIds))).run();
    await tx.delete(users).where(inArray(users.id, userIds)).run();
    return {
      attempts: attemptCount,
      recordings: recordingCount,
      transcripts: transcriptCount,
      evaluations: evaluationCount,
      audioFiles: localKeys.length,
      audioBlobs,
      classMemberships: memberCount,
      teacherRatings: ratingCount,
      classes: classCount,
    };
  });
}

/** The storage that holds `local` recordings: the app's own when it is the local one, else the configured folder. */
function localAudioStorage(): AudioStorage {
  const current = getAudioStorage();
  return current.provider === "local" && current.delete ? current : new LocalAudioStorage(getEnv().AUDIO_STORAGE_DIR);
}
