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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
