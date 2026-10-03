/**
 * Deterministic metrics computed from a transcript and recording duration.
 *
 * These are objective facts (counts, rates) rather than judgements. They are
 * given to the AI evaluator as evidence and shown to the student, so both
 * sides reason from the same numbers.
 */
export interface SpeechMetrics {
  wordCount: number;
  speakingSeconds: number;
  wordsPerMinute: number | null;
  /** Distinct words / total words (0–1). Rough indicator of lexical variety. */
  lexicalVariety: number | null;
  fillerCount: number;
  /** Phrases of 2–3 words used 3+ times, most frequent first. */
  repeatedPhrases: { phrase: string; count: number }[];
  /**
   * Content words used 4+ times, most frequent first. Gives the evaluator real counts to
   * quote ("good" ×7) instead of counting in its head. Absent on attempts saved before it existed.
   */
  repeatedWords?: { word: string; count: number }[];
  /** Share of the available speaking time that was used (0–1). */
  timeUsedRatio: number | null;
}

const FILLERS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "ah", "eh"]);

/** Common two-word phrases that are not meaningful as "repetition" feedback. */
const IGNORED_PHRASES = new Set([
  "of the",
  "in the",
  "to the",
  "it is",
  "and the",
  "on the",
  "for the",
  "is a",
  "a lot",
  "lot of",
  "a lot of",
]);

export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []).filter(Boolean);
}

export function computeSpeechMetrics(
  transcript: string,
  speakingMs: number,
  availableSpeakingSeconds: number,
): SpeechMetrics {
  const words = tokenizeWords(transcript);
  const speakingSeconds = Math.max(0, Math.round(speakingMs / 1000));
  const contentWords = words.filter((word) => !FILLERS.has(word));

  return {
    wordCount: contentWords.length,
    speakingSeconds,
    wordsPerMinute:
      speakingSeconds >= 5 ? Math.round((contentWords.length / speakingSeconds) * 60) : null,
    lexicalVariety:
      contentWords.length > 0
        ? round2(new Set(contentWords).size / contentWords.length)
        : null,
    fillerCount: words.length - contentWords.length,
    repeatedPhrases: findRepeatedPhrases(contentWords),
    repeatedWords: findRepeatedWords(contentWords),
    timeUsedRatio:
      availableSpeakingSeconds > 0
        ? round2(Math.min(1, speakingSeconds / availableSpeakingSeconds))
        : null,
  };
}

function findRepeatedPhrases(words: string[]): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const size of [3, 2]) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(" ");
      if (IGNORED_PHRASES.has(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    // Stable sort: ties keep first-occurrence order, with 3-word phrases before 2-word ones.
    .sort((a, b) => b[1] - a[1]);

  // Drop 2-word phrases already covered by a 3-word phrase with the same count.
  const result: { phrase: string; count: number }[] = [];
  for (const [phrase, count] of repeated) {
    const covered = result.some((kept) => kept.phrase.includes(phrase) && kept.count >= count);
    if (!covered) result.push({ phrase, count });
    if (result.length === 5) break;
  }
  return result;
}

/** Function words that are expected to repeat; counting them says nothing about vocabulary range. */
const COMMON_WORDS = new Set(
  (
    "a an the and or but so because if when while then than that this these those it its i me my we our you your he him his she her they them their " +
    "is am are was were be been being have has had do does did will would can could should may might must to of in on at for with by from about as " +
    "into over after before very really just also too not no yes there here what which who how all some any more most much many one is it's i'm don't can't"
  ).split(" "),
);

function findRepeatedWords(words: string[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3 || COMMON_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
