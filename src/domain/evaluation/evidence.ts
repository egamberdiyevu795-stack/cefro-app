/**
 * Lightweight evidence matching: is a quote attributed to the student
 * actually present in their transcript?
 *
 * Matching is done on normalised word tokens, so it ignores case,
 * punctuation, curly vs straight quotes and hesitation fillers ("um",
 * "uh"), which evaluators often drop when quoting. Quotes may skip text with
 * an ellipsis ("I think ... phones"): each segment must appear, in order.
 * Long segments (8+ words) tolerate one differing word to absorb tiny
 * copying differences — but not a paraphrase.
 */

const FILLERS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "ah", "eh", "mm"]);
const LONG_SEGMENT_WORDS = 8;

export function evidenceTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[‘’ʼ`]/g, "'")
      .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? []
  ).filter((token) => !FILLERS.has(token));
}

/** Split a quote on ellipses into the parts that must each be found. */
function quoteSegments(quote: string): string[][] {
  return quote
    .split(/\.{3,}|…|\[\.\.\.\]/)
    .map(evidenceTokens)
    .filter((segment) => segment.length > 0);
}

function findSegment(haystack: string[], segment: string[], from: number): number {
  const allowedMismatches = segment.length >= LONG_SEGMENT_WORDS ? 1 : 0;
  for (let start = from; start + segment.length <= haystack.length; start++) {
    let mismatches = 0;
    for (let i = 0; i < segment.length && mismatches <= allowedMismatches; i++) {
      if (haystack[start + i] !== segment[i]) mismatches++;
    }
    if (mismatches <= allowedMismatches) return start + segment.length;
  }
  return -1;
}

/** True when the quote can be found in the transcript (see module doc for tolerance rules). */
export function isQuoteInTranscript(quote: string, transcript: string): boolean {
  const segments = quoteSegments(quote);
  if (segments.length === 0) return false;
  const haystack = evidenceTokens(transcript);
  let position = 0;
  for (const segment of segments) {
    position = findSegment(haystack, segment, position);
    if (position === -1) return false;
  }
  return true;
}
