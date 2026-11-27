/**
 * Teacher view rules (docs/teacher-plan.md), shared by the server, the pages and their tests. Pure and browser-safe.
 */
import { EMAIL_AS_NAME, NAME_MAX_LENGTH, emailLocalPart, nameProblem, normaliseName } from "@/domain/account";

/** Join codes: 6 characters from this alphabet (no 0/O, 1/I/L: easy to read aloud and to type). */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const JOIN_CODE_LENGTH = 6;

/** A new join code from `random` (values in [0, 1)); the server passes a cryptographic source. */
export function makeJoinCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[Math.floor(random() * JOIN_CODE_ALPHABET.length)];
  return code;
}

/** What the student typed, as a code: spaces and dashes dropped, upper case. Not case-sensitive. */
export function normaliseJoinCode(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\s-]+/g, "").toUpperCase() : "";
}

/** Is this (normalised) a well-formed join code? */
export function isJoinCode(code: string): boolean {
  return code.length === JOIN_CODE_LENGTH && [...code].every((c) => JOIN_CODE_ALPHABET.includes(c));
}

/** The one message for a code that matches no open class (also for a malformed one, so nothing is revealed). */
export const UNKNOWN_CODE_MESSAGE = "We can't find a class with this code.";

/** Wrong codes allowed per account per hour, so codes can't be guessed. */
export const JOIN_CODE_FAILURES_PER_HOUR = 10;

export const CLASS_NAME_MAX_LENGTH = 40;

/** Why a class name can't be used, or null. */
export function classNameProblem(value: unknown): string | null {
  if (typeof value !== "string" || normaliseName(value).length === 0) return "Enter a name for the class.";
  if (normaliseName(value).length > CLASS_NAME_MAX_LENGTH) return `Use at most ${CLASS_NAME_MAX_LENGTH} characters.`;
  return nameProblem(value) ? "Use letters, numbers and spaces." : null;
}

/** "Name your teacher sees": at most this long (one class only). */
export const SHOWN_NAME_MAX_LENGTH = 30;

/** Why a shown name can't be used, or null. No "@": an email address is never shown to a teacher. */
export function shownNameProblem(value: unknown): string | null {
  const problem = nameProblem(value);
  if (problem) return problem === "Enter your name." ? "Enter the name your teacher sees." : problem;
  const name = normaliseName(value as string);
  if (name.length > SHOWN_NAME_MAX_LENGTH) return `Use at most ${SHOWN_NAME_MAX_LENGTH} characters.`;
  if (name.includes("@")) return EMAIL_AS_NAME;
  return null;
}

/**
 * Does this shown name carry part of the student's own email: its local part (the name the old sign-up form made),
 * or its domain? Then it is refused at Share and never shown to a teacher.
 */
export function shownNameUsesEmail(shownName: string, email: string | null | undefined): boolean {
  const name = normaliseName(shownName).toLowerCase();
  const local = emailLocalPart(email);
  const domain = (email ?? "").slice((email ?? "").indexOf("@") + 1).trim().toLowerCase();
  if (!name) return false;
  // The exact local part (what the old form prefilled), or a long handle inside a longer name ("ali.karimov99 A").
  // A short one inside a real name is left alone ("Bobby" for bob@…).
  if (local && (name === local || (local.length >= 6 && name.includes(local)))) return true;
  return Boolean(email?.includes("@") && domain && name.includes(domain));
}

/** The message when the shown name is (part of) the student's email. */
export const SHOWN_NAME_FROM_EMAIL = "Use a name, not part of your email address.";

/** What a teacher sees as the student's name: the shown name, or "Student" if it carries part of the student's email. */
export function teacherSafeShownName(shownName: string, email: string | null | undefined): string {
  return shownNameUsesEmail(shownName, email) ? "Student" : shownName;
}

/** The Share screen's prefilled name: the first word of the account name (never the email). Empty when there is none. */
export function suggestedShownName(accountName: string | null | undefined): string {
  const first = normaliseName(accountName ?? "").split(" ")[0] ?? "";
  return first.includes("@") ? "" : first.slice(0, Math.min(SHOWN_NAME_MAX_LENGTH, NAME_MAX_LENGTH));
}

/**
 * The wording of the Share screen the student agrees to, stored with each share (`share_text_version`). Change the
 * version whenever SHARE_TEXT changes.
 *
 * "v1-all-parts-audio" (docs/v1-plan.md, step 6): every part, every mock made after joining, and the recordings
 * ("Will see" lists them; "Won't see: recordings" is gone).
 * Older memberships keep the version they agreed to ("2026-11-07": Part 2 attempts only, no recordings); see
 * `memberScope`.
 */
export const SHARE_TEXT_VERSION = "v1-all-parts-audio";

/** The first wording (2026-11-07): Part 2 attempts only, "Won't see: recordings". Memberships made then keep it. */
export const LEGACY_SHARE_TEXT_VERSION = "2026-11-07";

export const SHARE_TEXT = {
  /** "Will see": one line each. The last one is the recordings (there is no "Won't see: recordings" any more). */
  willSee: [
    "That name and your level",
    "Every part you practise from now on: 1.1, 1.2, 2 and 3",
    "Every mock you make from now on",
    "Transcripts and feedback",
    "Your recordings (deleted after 30 days)",
  ],
  wontSee: "Earlier attempts, email, exam date.",
  leaveAccess: "Your teacher loses access to everything.",
  leavePairs:
    "If you leave, we keep your teacher's level and ours as an anonymous number pair to improve scoring. It can't be linked to you.",
} as const;

/**
 * What an old membership's owner is asked once (Account page), and what the tap does. Nothing changes until they tap:
 * their teacher keeps seeing Part 2 attempts only, with no recordings.
 */
export const UPGRADE_TEXT = {
  title: "Share recordings too?",
  body: "Your teacher now sees Part 2 attempts only. You can also share Parts 1.1, 1.2 and 3, your mocks and your recordings (deleted after 30 days), from the moment you tap. Nothing from before that is shared.",
  accept: "Share recordings too",
  decline: "Not now",
} as const;

export type EndedBy = "student" | "teacher" | "class_closed";

/** What a student sees on the Account page for a class they are no longer in (Remove or Close; v1 sends no email). */
export const NO_LONGER_IN_CLASS = "You're no longer in this class.";

/** "YYYY-MM" (UTC) of an ISO time: the only time a rating pair keeps. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * The anonymous pair kept from a rating when its membership ends: the teacher's band (the app's band when they
 * agreed), the app's band, the methodology, the part and the month. Nothing else.
 */
export function ratingPair(rating: {
  agrees: boolean;
  teacherBand: number | null;
  appBand: number;
  evaluatorVersion: string;
  rubricVersion: string;
  createdAt: string;
}, part: string) {
  return {
    teacherBand: rating.agrees || rating.teacherBand === null ? rating.appBand : rating.teacherBand,
    appBand: rating.appBand,
    evaluatorVersion: rating.evaluatorVersion,
    rubricVersion: rating.rubricVersion,
    part,
    month: monthOf(rating.createdAt),
  };
}

/* ------------------------------------------------------------------------------------------ who may see and hear what */

/** The part of an attempt an access rule needs: its exam part id ("1.1", "1.2", "2", "3") or null, and when it was made. */
export interface AccessAttempt {
  part: string | null;
  createdAt: string;
}

/** What a membership row says about its scope (all `class_members` columns the rules read). */
export interface AccessMember {
  sharedAt: string;
  shareTextVersion: string;
  /** Set when an old member tapped "Share recordings too": the moment the wider scope starts. */
  allPartsFrom?: string | null;
}

/**
 * The scope a membership agreed to.
 *  - "all_parts_audio": the current wording (every part, every mock, recordings), from `shared_at`.
 *  - "part2_only": an older wording that has not been upgraded: Part 2 attempts only, no recordings.
 *    An old member who tapped "Share recordings too" is "all_parts_audio" from that moment (`allPartsFrom`) and
 *    "part2_only" before it.
 */
export type MemberScope = "all_parts_audio" | "part2_only";

/** The moment from which a membership shares everything (all parts, mocks, recordings); null: never. */
export function fullScopeFrom(member: AccessMember): string | null {
  if (member.shareTextVersion !== LEGACY_SHARE_TEXT_VERSION) return member.sharedAt;
  return member.allPartsFrom ?? null;
}

export function memberScope(member: AccessMember): MemberScope {
  return fullScopeFrom(member) !== null ? "all_parts_audio" : "part2_only";
}

/** Does this membership still wait for the "Share recordings too?" answer: an old wording, not upgraded, not declined. */
export function needsUpgradeAnswer(member: AccessMember & { upgradeDeclinedAt?: string | null; endedAt?: string | null }): boolean {
  return !member.endedAt && member.shareTextVersion === LEGACY_SHARE_TEXT_VERSION && !member.allPartsFrom && !member.upgradeDeclinedAt;
}

/**
 * The pure core of `teacherCanSee` for attempts: made after the student tapped Share (ISO times compare as text), and,
 * for a membership on the old wording, Part 2 only unless it was upgraded and the attempt was made after the upgrade.
 */
export function memberSeesAttempt(member: AccessMember, attempt: AccessAttempt): boolean {
  if (!(attempt.createdAt > member.sharedAt)) return false;
  const from = fullScopeFrom(member);
  if (from !== null && attempt.createdAt > from) return true;
  return member.shareTextVersion === LEGACY_SHARE_TEXT_VERSION && attempt.part === "2";
}

/**
 * The pure core of `teacherCanSee` for a mock: started after the full scope began (so never for an old membership that
 * was not upgraded, and never a mock started before the student joined or upgraded).
 */
export function memberSeesMock(member: AccessMember, mock: { createdAt: string }): boolean {
  const from = fullScopeFrom(member);
  return from !== null && mock.createdAt > from;
}

/**
 * Recordings (docs/v1-plan.md section 4.4): `teacherCanHear` = `teacherCanSee` AND the account still has
 * `consent_teacher_sharing` AND the audio is not deleted. The membership must also cover recordings: an old wording
 * promised "Won't see: recordings", so an attempt made before the upgrade has none to hear.
 */
export function canHearRecording(input: {
  sees: boolean;
  /** `users.consent_teacher_sharing` of the student, with recording consent granted. */
  consentTeacherSharing: boolean;
  /** `recordings.audio_deleted_at`; null: the audio is stored. */
  audioDeletedAt: string | null;
  /** The attempt's recording row exists. */
  hasRecording: boolean;
  member: AccessMember;
  attempt: AccessAttempt;
}): boolean {
  if (!input.sees || !input.consentTeacherSharing || input.audioDeletedAt || !input.hasRecording) return false;
  const from = fullScopeFrom(input.member);
  return from !== null && input.attempt.createdAt > from;
}

/** The levels a teacher can give to a whole mock (the same four the estimate uses). */
export const MOCK_LEVELS = ["Below B1", "B1", "B2", "C1"] as const;
export type MockLevel = (typeof MOCK_LEVELS)[number];

export function isMockLevel(value: unknown): value is MockLevel {
  return typeof value === "string" && (MOCK_LEVELS as readonly string[]).includes(value);
}

/** The address a student opens from a Telegram link: the join code pre-filled (nothing is shared by opening it). */
export function joinLinkPath(code: string): string {
  return `/join/${encodeURIComponent(code)}`;
}

/** "Speaking playback speeds" of the teacher's player. */
export const PLAYBACK_SPEEDS = [1, 1.25, 1.5] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const speedLabel = (speed: PlaybackSpeed) => `${speed}x`;

/**
 * The teacher terms a person agrees to when they take the teacher role, at sign-up or on the Account page. One short
 * promise, stored with the account (`teacher_terms_version`, `teacher_terms_at`) so the owner can see what each
 * teacher agreed to, and when. Raise the version when the wording changes.
 */
export const TEACHER_TERMS_VERSION = "teacher-terms-v1";
export const TEACHER_TERMS_TEXT =
  "I'll use my students' work for teaching only, and won't copy or share it outside my class.";
