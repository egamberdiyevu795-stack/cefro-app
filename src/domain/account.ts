/**
 * Account rules shared by the Profile and Settings pages and their API routes. Pure and browser-safe.
 */

export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The word typed to confirm "Delete my account". Exactly this, in capitals. */
export const DELETE_CONFIRMATION = "DELETE";

/** What "Delete my account" deletes, in the words the Settings page lists (each item is tested to be deleted). */
export const DELETED_ITEMS = [
  "Your practice attempts and their results",
  "Your recordings and transcripts",
  "Your exam date",
  "Your account: name, email and password",
] as const;

/** Added to the list once the Teacher view is on (`TEACHER_LIVE`): class links and teachers' ratings are deleted too. */
export const DELETED_TEACHER_ITEM = "Your classes and teacher ratings";

/** The list "Delete my account" shows: with the Teacher view on, also the classes and teacher ratings. */
export function deletedItems(teacherViewLive: boolean): readonly string[] {
  return teacherViewLive ? [...DELETED_ITEMS.slice(0, 3), DELETED_TEACHER_ITEM, DELETED_ITEMS[3]] : DELETED_ITEMS;
}

/** The name as it is saved: trimmed, inner runs of spaces made one. */
export function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Why a name can't be saved, in words for the student, or null when it can. */
export function nameProblem(value: unknown): string | null {
  if (typeof value !== "string") return "Enter your name.";
  const name = normaliseName(value);
  if (name.length === 0) return "Enter your name.";
  if (name.length > NAME_MAX_LENGTH) return `Use at most ${NAME_MAX_LENGTH} characters.`;
  // Control characters (and the invisible direction marks that can disguise a name) are refused.
  if (/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/.test(name)) return "Use letters, numbers and spaces.";
  return null;
}

/** Why a new password can't be used, or null. The same limits as sign-up. */
export function newPasswordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (value.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return null;
}

/** True only for exactly "DELETE" (surrounding spaces from a phone keyboard are forgiven, case is not). */
export function isDeleteConfirmed(value: unknown): boolean {
  return typeof value === "string" && value.trim() === DELETE_CONFIRMATION;
}
