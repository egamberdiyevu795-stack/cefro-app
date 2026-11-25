/**
 * What the Profile page shows, from the student's own attempts and account. Pure: the page only loads data.
 */
import type { HistoryAttempt } from "@/domain/speaking/history";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { progress } from "@/features/dashboard/progress";
import { formatDate } from "@/features/history/view-model";

/** Where "No level yet" and the level card's button go: the Part 2 tasks on the task list. */
export const PART2_HREF = "/practice#part-2";

export type ProfileLevel =
  | { kind: "none" }
  | {
      kind: "level";
      /** "B2": the same level as Home's Speaking progress. */
      level: string;
      /** "B2": the same target as Home. */
      target: string;
      /** "Based on your last 3 answers": the same basis as Home. */
      basis: string;
    };

/**
 * The current level: exactly the level Home shows (`progress`, from the last scored answers of any part), so the two
 * pages never disagree. Scored = completed, rated, not old-method, not failed or still scoring (`scoredAttempts`).
 * Nothing scored: "none". Never a level from anything else.
 */
export function currentLevel(attempts: readonly HistoryAttempt[], options: { target: FeatureLevel; now: Date }): ProfileLevel {
  const summary = progress(attempts, options);
  if (!summary) return { kind: "none" };
  return { kind: "level", level: summary.levelLabel, target: summary.targetLabel, basis: summary.basis };
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
