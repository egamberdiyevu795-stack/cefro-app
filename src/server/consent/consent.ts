import "server-only";
import { eq } from "drizzle-orm";
import { canShareWithTeacher, recordingLock, RECORDING_LOCKED_MESSAGE, type ConsentSubject, type RecordingLock } from "@/domain/consent";
import { getEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";

/*
 * Pilot consent, server side (docs/consent-design.md, "Pilot route"). One switch, CONSENT_REQUIRED: off, every caller
 * may record as before; on, only a registered account whose consent the owner recorded as "granted"
 * (scripts/set-consent.mjs) may record or have an answer scored, and teacher sharing also needs the teacher-sharing
 * flag. Guests never pass. Nothing here writes consent: no API or page can set it.
 */

let override: boolean | undefined;

/** Is consent required? CONSENT_REQUIRED ("true" / "false", default false). Tests may override it. */
export function consentRequired(): boolean {
  return override ?? getEnv().CONSENT_REQUIRED;
}

/** Test seam: force the switch (undefined: back to the environment). Never called by app code. */
export function setConsentRequiredForTesting(value: boolean | undefined): void {
  override = value;
}

async function loadSubject(userId: string | null): Promise<ConsentSubject | null> {
  if (!userId) return null;
  const row = await (await getDb())
    .select({ kind: users.kind, mergedInto: users.mergedIntoUserId, status: users.consentStatus, sharing: users.consentTeacherSharing })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row || row.mergedInto) return null;
  return { kind: row.kind, consentStatus: row.status ?? null, consentTeacherSharing: row.sharing };
}

/** Why this caller can't record, or null when they can. Reads nothing while the switch is off. */
export async function recordingLockFor(userId: string | null): Promise<RecordingLock | null> {
  if (!consentRequired()) return null;
  return recordingLock(true, await loadSubject(userId));
}

/** For the recording and scoring routes: 403 `consent_required` unless this caller may record. */
export async function assertCanRecord(userId: string): Promise<void> {
  const lock = await recordingLockFor(userId);
  if (lock) throw new HttpError(403, "consent_required", RECORDING_LOCKED_MESSAGE[lock]);
}

/** Teacher sharing (Share, and every teacher read of a student's attempts). Always true while the switch is off. */
export async function teacherSharingAllowed(studentUserId: string): Promise<boolean> {
  if (!consentRequired()) return true;
  return canShareWithTeacher(true, await loadSubject(studentUserId));
}

export const TEACHER_SHARING_LOCKED_MESSAGE = "A parent or guardian needs to agree to sharing with a teacher first.";
