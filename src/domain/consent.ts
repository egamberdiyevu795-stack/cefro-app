/**
 * Pilot consent (docs/consent-design.md, "Pilot route"). Pure and browser-safe: which screen a student sees and
 * whether a stored consent unlocks recording or teacher sharing. The owner records consent by hand with
 * scripts/set-consent.mjs; nothing in the app can set it.
 */
import { AUDIO_RETENTION_DAYS, shortDate } from "./audio-retention";

export type ConsentStatus = "granted" | "withdrawn";

/** What the server knows about the caller, for the consent check. */
export interface ConsentSubject {
  kind: "anonymous" | "registered";
  consentStatus: ConsentStatus | null;
  consentTeacherSharing: boolean;
}

/**
 * Why recording is locked: `guest` (no account: a guest never records), `waiting` (an account with no consent yet),
 * `withdrawn` (consent was taken back).
 */
export type RecordingLock = "guest" | "waiting" | "withdrawn";

/** Null when the caller may record. `required` is the CONSENT_REQUIRED switch: off, nobody is locked. */
export function recordingLock(required: boolean, subject: ConsentSubject | null): RecordingLock | null {
  if (!required) return null;
  if (!subject || subject.kind !== "registered") return "guest";
  if (subject.consentStatus === "granted") return null;
  return subject.consentStatus === "withdrawn" ? "withdrawn" : "waiting";
}

/** Teacher sharing needs recording consent and the teacher-sharing flag (when the switch is on). */
export function canShareWithTeacher(required: boolean, subject: ConsentSubject | null): boolean {
  if (!required) return true;
  return recordingLock(true, subject) === null && subject!.consentTeacherSharing;
}

export const RECORDING_LOCKED_MESSAGE: Record<RecordingLock, string> = {
  guest: "Recording needs an account. Create one or sign in, then ask your parent or guardian to confirm, and we will unlock recording.",
  waiting: "Ask your parent or guardian to confirm, then we will unlock recording.",
  withdrawn: "Consent for recording was withdrawn. Ask your parent or guardian to confirm again, then we will unlock recording.",
};

/** The `?consent=` preview switch of the practice page's mock mode (shows a locked screen; nothing is read). */
export function parseLockPreview(value: string | undefined): RecordingLock | null {
  return value === "guest" || value === "waiting" || value === "withdrawn" ? value : null;
}

/** What the Account page shows about an account's own consent (pilot: set by the owner's script). */
export interface ConsentRecord {
  status: ConsentStatus | null;
  /** When the owner last set it (ISO time). */
  at: string | null;
  teacherSharing: boolean;
}

/** The `?consent=` preview of the Account page's mock mode (a made-up record; nothing is read). */
export function parseConsentPreview(value: string | undefined, now: Date): ConsentRecord | null {
  const at = now.toISOString();
  if (value === "waiting") return { status: null, at: null, teacherSharing: false };
  if (value === "granted") return { status: "granted", at, teacherSharing: false };
  if (value === "withdrawn") return { status: "withdrawn", at, teacherSharing: false };
  return null;
}

/** The Account page's "Recording consent" lines: a heading, what it means, and the audio rule. Plain, no blame. */
export function consentLines(record: ConsentRecord): { title: string; body: string; retention: string } {
  const retention = `Recordings are deleted ${AUDIO_RETENTION_DAYS} days after scoring. Transcripts and feedback are kept until you delete your account.`;
  if (record.status === "granted") {
    return {
      title: record.at ? `Consent recorded on ${shortDate(record.at)}` : "Consent recorded",
      body: `Recording is unlocked. Sharing with a teacher: ${record.teacherSharing ? "agreed" : "not agreed"}.`,
      retention,
    };
  }
  if (record.status === "withdrawn") {
    return {
      title: record.at ? `Consent withdrawn on ${shortDate(record.at)}` : "Consent withdrawn",
      body: "Recording is locked. Your past answers stay until you delete your account below.",
      retention,
    };
  }
  return {
    title: "Waiting for consent",
    body:
      "Recording unlocks once a parent or guardian has agreed (or you, if you are 18 or older) and the person who invited you has recorded it.",
    retention,
  };
}
