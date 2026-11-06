/**
 * The student's exam date: a calendar day ("YYYY-MM-DD") in Uzbekistan, where the exam is taken. "Today" is also
 * Uzbekistan's day, so the countdown is the same for every reader wherever their device is. Pure and browser-safe.
 */
export const EXAM_TIME_ZONE = "Asia/Tashkent";
/** Furthest date accepted (exam sessions are announced months ahead, not years). */
export const MAX_DAYS_AHEAD = 2 * 365;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in "YYYY-MM-DD" form (rejects 2026-02-30 and anything else). */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: EXAM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Uzbekistan, "YYYY-MM-DD". */
export function todayIn(now: Date): string {
  return DAY_FORMAT.format(now);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const utc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export function addDays(day: string, days: number): string {
  const date = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days));
  return date.toISOString().slice(0, 10);
}

/** "28.11.26", as dates are shown on the dashboard. */
export function formatDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(2, 4)}`;
}

/** What the dashboard does with the exam date. */
export type ExamDateState =
  /** A date today or later: "Your exam: in N days", with Edit. */
  | { kind: "countdown"; date: string; days: number; label: string }
  /** No date yet, not skipped: "When is your exam?". */
  | { kind: "ask" }
  /** The saved date has passed: the countdown is hidden and the student is asked for the next one. */
  | { kind: "ask_again"; passed: string }
  /** The student chose Skip: nothing is shown. */
  | { kind: "skipped" };

export function examDateState(stored: { examDate: string | null; examDateSkippedAt: string | null }, now: Date): ExamDateState {
  const today = todayIn(now);
  if (stored.examDate && isCalendarDay(stored.examDate)) {
    const days = daysBetween(today, stored.examDate);
    if (days >= 0) return { kind: "countdown", date: stored.examDate, days, label: countdownLabel(days) };
    return stored.examDateSkippedAt ? { kind: "skipped" } : { kind: "ask_again", passed: stored.examDate };
  }
  return stored.examDateSkippedAt ? { kind: "skipped" } : { kind: "ask" };
}

/** "in 23 days", "in 1 day", "today". */
export function countdownLabel(days: number): string {
  if (days === 0) return "today";
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Why a date can't be saved, or null when it can (today up to MAX_DAYS_AHEAD days ahead). */
export function examDateProblem(value: unknown, now: Date): string | null {
  if (!isCalendarDay(value)) return "Choose a date.";
  const days = daysBetween(todayIn(now), value);
  if (days < 0) return "Choose today or a later date.";
  if (days > MAX_DAYS_AHEAD) return "Choose a date within the next two years.";
  return null;
}
