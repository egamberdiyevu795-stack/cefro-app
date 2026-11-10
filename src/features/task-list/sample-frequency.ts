/**
 * SAMPLE "how often asked" labels, for the owner to judge the idea on a Preview. **Made up: not exam data.** We have no
 * data on how often a topic comes up in the real exam, so these never reach the real site: the task list shows them only
 * in mock mode with `?freq=1` (`showSampleFrequency`), each card saying they are samples. Remove this file, or replace it
 * with real data from student reports, before the feature is used for real.
 */
export type SampleFrequency = "Often asked" | "Sometimes asked" | "Rarely asked";

const ORDER: readonly SampleFrequency[] = ["Often asked", "Sometimes asked", "Rarely asked"];

const SAMPLE: Record<string, SampleFrequency> = {
  "a2-part1-1-daily-life": "Often asked",
  "b1-part1-2-shopping": "Sometimes asked",
  "b2-part2-advice-from-someone": "Often asked",
  "b2-part2-important-decision": "Often asked",
  "b2-part2-goal-you-set": "Sometimes asked",
  "b2-part2-working-in-a-team": "Sometimes asked",
  "b2-part2-trying-and-failing": "Rarely asked",
  "b2-part2-a-tradition": "Often asked",
  "b2-part2-happy-day": "Sometimes asked",
  "c1-part3-cars-in-city-centres": "Sometimes asked",
  "c1-part3-smartphones-under-14": "Often asked",
  "c1-part3-sugar-tax": "Rarely asked",
};

/** Only mock mode with `?freq=1`: never the real site, never the plain demo. */
export function showSampleFrequency(mock: boolean, freq: string | string[] | undefined): boolean {
  return mock && (Array.isArray(freq) ? freq[0] : freq) === "1";
}

export function sampleFrequency(taskId: string): SampleFrequency | undefined {
  return SAMPLE[taskId];
}

/** Often → rarely; the list's own order within each label (stable sort). */
export function byFrequency<T extends { id: string }>(rows: readonly T[]): T[] {
  const rank = (id: string) => {
    const f = SAMPLE[id];
    return f ? ORDER.indexOf(f) : ORDER.length;
  };
  return [...rows].sort((a, b) => rank(a.id) - rank(b.id));
}
