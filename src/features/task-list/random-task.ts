/**
 * "Random topic" on the task list: the exam gives the student a topic they did not choose, so practice should too.
 *
 * Pure and browser-safe. The pick is random but never wasteful:
 *   1. a topic the student has never practised, if there is one (they cover the whole part sooner);
 *   2. otherwise one of the topics practised least recently (the older half), so the same few never keep coming back;
 *   3. never the topic practised last, while the part has another (two practices in a row always differ).
 *
 * `random` returns 0 ≤ r < 1 (Math.random by default; tests pass their own).
 */

export interface PractisedTopic {
  taskId: string;
  /** ISO date of the attempt. */
  createdAt: string;
}

export function pickRandomTopic(
  taskIds: readonly string[],
  practised: readonly PractisedTopic[],
  random: () => number = Math.random,
): string | null {
  if (taskIds.length === 0) return null;
  if (taskIds.length === 1) return taskIds[0];

  // The latest attempt of each topic of this part (attempts may come in any order).
  const last = new Map<string, number>();
  for (const a of practised) {
    if (!taskIds.includes(a.taskId)) continue;
    const at = Date.parse(a.createdAt);
    if (!Number.isFinite(at)) continue;
    last.set(a.taskId, Math.max(last.get(a.taskId) ?? -Infinity, at));
  }

  const fresh = taskIds.filter((id) => !last.has(id));
  if (fresh.length > 0) return choose(fresh, random);

  // Every topic practised: oldest first, keep the older half, and never the most recent one.
  const byAge = [...taskIds].sort((a, b) => last.get(a)! - last.get(b)!);
  const older = byAge.slice(0, Math.max(1, Math.ceil((byAge.length - 1) / 2)));
  return choose(older, random);
}

function choose<T>(items: readonly T[], random: () => number): T {
  const i = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[i];
}

/** The parts whose topics the student can choose (Part 1.1 is random by itself: a new question set each time). */
export type TopicPart = "1.2" | "2" | "3";

export function isTopicPart(value: unknown): value is TopicPart {
  return value === "1.2" || value === "2" || value === "3";
}

/** The task list's "Random topic" link for a part: a page that picks, then opens the topic's brief. */
export function randomTopicHref(part: TopicPart, options: { mock?: boolean } = {}): string {
  return `/practice/random/${part}${options.mock ? "?mock=1" : ""}`;
}
