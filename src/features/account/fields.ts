import { cx, styles } from "@/components/ds";

/** A text field on Profile and Settings: the exam date's pill field (border `fg-subtle`, 3.64:1 on the card). */
export const FIELD = cx(
  "h-9 w-full min-w-0 max-w-sm rounded-full border border-fg-subtle bg-card px-4 text-body text-fg disabled:cursor-wait",
  styles.FOCUS_RING,
);
export const FIELD_LABEL = "block text-label text-fg-muted";
/** The quiet pill as a submit / plain button, dimmed while disabled. */
export const QUIET_BUTTON = cx(styles.PILL_QUIET, "disabled:cursor-not-allowed disabled:opacity-60");
/** The danger pill as a submit / plain button (Delete my account), dimmed while disabled. */
export const DANGER_BUTTON = cx(styles.PILL_DANGER, "disabled:cursor-not-allowed disabled:opacity-60");
/** A small text action with a 36 px tap area (Edit, Cancel), as on the exam date. */
export const TEXT_BUTTON = cx(styles.SMALL_ACTION, "min-h-9 px-1 disabled:cursor-wait");

/** The `{ error: { message } }` body of a failed API call, or a fallback. */
export async function errorMessage(response: Response, fallback = "That didn't work. Please try again."): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}
