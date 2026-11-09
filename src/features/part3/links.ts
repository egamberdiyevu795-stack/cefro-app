import { POINT_IDS, type PointId } from "@/domain/speaking/argument-task";

/**
 * Part 3 addresses and demo keys. Pure and browser-safe.
 *
 * Part 3 is not live (`PART_LIVE["3"]`), so every Part 3 page exists only in mock mode (`?mock=1`):
 *   /practice/part3?mock=1                     the three topics
 *   /practice/part3/<task id>?mock=1           brief → preparation (choose 2 + 2 points) → recording
 *   /practice/part3/<task id>?mock=1&retry=<key>   a retry of a demo result, with its goal
 *   /result/part3?demo=<key>&mock=1            a demo result (&state=scoring&next=1: "Scoring…" first)
 *
 * A demo key names the answers given so far: `p3.<task id>.<points>[.<points>…]`, one point list per attempt
 * (e.g. `p3.c1-part3-cars-in-city-centres.F1F2A1A2`). The first list is a first answer; each later list is a retry of
 * the key without its last list.
 */

export const PART3_LIST_HREF = "/practice/part3";
const MAX_ATTEMPTS = 4;

/** "F1F2A1A2" for a set of points (in list order, no repeats). */
export function encodePoints(points: readonly PointId[]): string {
  return POINT_IDS.filter((id) => points.includes(id)).join("");
}

/** The points of "F1F2A1A2"; null for anything else (unknown ids, repeats, wrong order). */
export function decodePoints(text: string): PointId[] | null {
  if (!/^(?:[FA][123]){0,6}$/.test(text)) return null;
  const points = (text.match(/[FA][123]/g) ?? []) as PointId[];
  return encodePoints(points) === text ? points : null;
}

export interface Part3DemoKey {
  taskId: string;
  /** One point list per attempt, oldest first. The last one is this attempt's. */
  attempts: PointId[][];
}

export function parsePart3Key(key: string): Part3DemoKey | null {
  const match = /^p3\.([a-z0-9-]+)((?:\.(?:[FA][123]){0,6})+)$/.exec(key);
  if (!match) return null;
  const lists = match[2].slice(1).split(".").map(decodePoints);
  if (lists.length > MAX_ATTEMPTS || lists.some((l) => l === null)) return null;
  return { taskId: match[1], attempts: lists as PointId[][] };
}

export function formatPart3Key(key: Part3DemoKey): string {
  return `p3.${key.taskId}.${key.attempts.map(encodePoints).join(".")}`;
}

/** The key of the attempt this one retries; null for a first answer. */
export function previousPart3Key(key: string): string | null {
  const parsed = parsePart3Key(key);
  if (!parsed || parsed.attempts.length < 2) return null;
  return formatPart3Key({ ...parsed, attempts: parsed.attempts.slice(0, -1) });
}

/** The key of a new answer with `points`, as a first answer or as a retry of `retryOf`. */
export function nextPart3Key(taskId: string, points: readonly PointId[], retryOf: string | null): string {
  const previous = retryOf ? parsePart3Key(retryOf) : null;
  const attempts = previous && previous.taskId === taskId && previous.attempts.length < MAX_ATTEMPTS ? previous.attempts : [];
  return formatPart3Key({ taskId, attempts: [...attempts, POINT_IDS.filter((id) => points.includes(id))] });
}

export function part3PracticeHref(taskId: string, options: { retry?: string } = {}): string {
  const params = new URLSearchParams({ mock: "1" });
  if (options.retry) params.set("retry", options.retry);
  return `${PART3_LIST_HREF}/${encodeURIComponent(taskId)}?${params}`;
}

export function part3ResultHref(key: string, options: { scoring?: boolean } = {}): string {
  const params = new URLSearchParams({ demo: key });
  if (options.scoring) {
    params.set("state", "scoring");
    params.set("next", "1");
  }
  params.set("mock", "1");
  return `/result/part3?${params}`;
}
