/**
 * Audio retention (docs/consent-design.md, decision 2026-11-08): a stored recording is deleted 30 days after it was
 * scored; the transcript, result and feedback stay until the account is deleted. Pure and browser-safe.
 */
export const AUDIO_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * When an attempt's audio is (or was) due for deletion: 30 days after it was scored (`completedAt`), or, for an
 * attempt that could not be scored, 30 days after it failed (`updatedAt`), so no recording is kept for ever. Null while
 * the attempt is still being processed (the daily job also deletes one stuck that way for 30 days; nothing is shown).
 */
export function audioDeleteDueAt(attempt: { status: string; completedAt: string | null; updatedAt: string }): string | null {
  const from = attempt.status === "completed" ? attempt.completedAt : attempt.status === "failed" ? attempt.updatedAt : null;
  if (!from) return null;
  const at = Date.parse(from);
  return Number.isFinite(at) ? new Date(at + AUDIO_RETENTION_DAYS * DAY_MS).toISOString() : null;
}

/** Attempts that ended (scored or failed) at or before this time have audio due for deletion at `now`. */
export function retentionCutoff(now: Date): string {
  return new Date(now.getTime() - AUDIO_RETENTION_DAYS * DAY_MS).toISOString();
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "2-digit" });

/** "08.12.26" in Uzbekistan time, as dates are shown everywhere else. */
export function shortDate(iso: string): string {
  const parts = Object.fromEntries(DATE_FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}.${parts.month}.${parts.year}`;
}

/**
 * The line the result page shows where the recording is played: when it will be (or was) deleted, read from the
 * stored dates. Null when there is nothing to say yet (still being scored, or no recording).
 */
export function audioRetentionNote(audio: { deletedAt: string | null; deletesAt: string | null } | null | undefined): string | null {
  if (!audio) return null;
  if (audio.deletedAt) return `Recording deleted on ${shortDate(audio.deletedAt)}, ${AUDIO_RETENTION_DAYS} days after scoring. The transcript and feedback are kept.`;
  if (audio.deletesAt) return `Your recording will be deleted on ${shortDate(audio.deletesAt)}, ${AUDIO_RETENTION_DAYS} days after scoring. The transcript and feedback are kept.`;
  return null;
}
