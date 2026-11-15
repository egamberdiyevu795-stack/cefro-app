/**
 * Weighted random choice, with the random source passed in (0 ≤ r < 1) so every caller is testable: production passes
 * Math.random, tests pass `seededRandom(seed)`.
 */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, random: () => number = Math.random): T | null {
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (items.length === 0 || total <= 0) return null;
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0 && weights[i]! > 0) return items[i]!;
  }
  // Floating point: r can land exactly on the total. Take the last item with a weight.
  for (let i = items.length - 1; i >= 0; i--) if (weights[i]! > 0) return items[i]!;
  return null;
}

/** A small deterministic random source (mulberry32) for tests and reproducible picks. Returns 0 ≤ r < 1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
