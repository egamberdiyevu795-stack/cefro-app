/**
 * Teacher view rules (docs/teacher-plan.md), shared by the server, the pages and their tests. Pure and browser-safe.
 */
import { NAME_MAX_LENGTH, nameProblem, normaliseName } from "@/domain/account";

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
  if (name.includes("@")) return "Use a name, not an email address.";
  return null;
}

/** The Share screen's prefilled name: the first word of the account name (never the email). Empty when there is none. */
export function suggestedShownName(accountName: string | null | undefined): string {
  const first = normaliseName(accountName ?? "").split(" ")[0] ?? "";
  return first.includes("@") ? "" : first.slice(0, Math.min(SHOWN_NAME_MAX_LENGTH, NAME_MAX_LENGTH));
}

/**
 * The wording of the Share screen the student agrees to, stored with each share (`share_text_version`). Change the
 * version whenever SHARE_TEXT changes.
 */
export const SHARE_TEXT_VERSION = "2026-11-07";

export const SHARE_TEXT = {
  willSee: "That name, your level, and every Part 2 attempt you make from now on, with transcript, quotes and feedback.",
  wontSee: "Earlier attempts, email, recordings, exam date.",
  leaveAccess: "Your teacher loses access to everything.",
  leavePairs:
    "If you leave, we keep your teacher's level and ours as an anonymous number pair to improve scoring. It can't be linked to you.",
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
