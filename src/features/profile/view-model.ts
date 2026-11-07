/**
 * What the Profile page shows, from the student's own attempts and account. Pure: the page only loads data.
 */
import type { HistoryAttempt } from "@/domain/speaking/history";
import { scoredAttempts } from "@/features/dashboard/progress";
import { formatDate, levelOfBand } from "@/features/history/view-model";

/** Where "No level yet" and the level card's button go: the Part 2 tasks on the task list. */
export const PART2_HREF = "/practice#part-2";

export type ProfileLevel =
  | { kind: "none" }
  | {
      kind: "level";
      /** "B1": the level of the band, as History shows an attempt's level. */
      level: string;
      /** "Part 2 · Band 2 · Higher B1" */
      band: string;
      /** "04.11.26": when that answer was given. */
      date: string;
      attemptId: string;
    };

/**
 * The current level: the latest scored Part 2 attempt's level, read exactly as History reads it (the band's own
 * label without Lower/Higher). Scored = completed, rated (not "too short to rate"), not old-method, not failed or
 * still scoring (`scoredAttempts`, the dashboard's rule). No such attempt: "none". Never a level from anything else.
 */
export function currentLevel(attempts: readonly HistoryAttempt[]): ProfileLevel {
  const latest = scoredAttempts(attempts)
    .filter((a) => a.part === "2")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return { kind: "none" };
  const { band, label } = latest.result.scoring;
  return { kind: "level", level: levelOfBand(label), band: `Part 2 · Band ${band} · ${label}`, date: formatDate(latest.createdAt), attemptId: latest.id };
}

/** "6 practice attempts" / "1 practice attempt" / "No practice attempts yet": every attempt, scored or not. */
export function attemptCountText(count: number): string {
  if (count === 0) return "No practice attempts yet";
  return `${count} practice attempt${count === 1 ? "" : "s"}`;
}

/** "Member since 08.10.26" (the day in Uzbekistan, as everywhere in the app). */
export function memberSinceText(iso: string): string {
  return `Member since ${formatDate(iso)}`;
}
