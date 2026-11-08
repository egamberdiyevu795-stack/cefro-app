/**
 * Pilot consent (docs/consent-design.md, "Pilot route"). Pure and browser-safe: which screen a student sees and
 * whether a stored consent unlocks recording or teacher sharing. The owner records consent by hand with
 * scripts/set-consent.mjs; nothing in the app can set it.
 */
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
