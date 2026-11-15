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

/**
 * The same tokens as `evidenceTokens`, with where each one starts and ends in `text` (character offsets), so a quote
 * found by tokens can be marked in the original transcript. Only the case and apostrophe variants are folded, one
 * character for one character, so the offsets stay valid.
 */
export function evidenceTokenSpans(text: string): { token: string; start: number; end: number }[] {
  const folded = text.replace(/[‘’ʼ`]/g, "'").toLowerCase();
  const spans: { token: string; start: number; end: number }[] = [];
  for (const match of folded.matchAll(/[a-z0-9]+(?:'[a-z0-9]+)*/g)) {
    if (!FILLERS.has(match[0])) spans.push({ token: match[0], start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/**
 * Where the first word-for-word run of `quote` sits in `transcript` (character range, from its first word to its last,
 * hesitation sounds inside included), or null when it is not there. Same strict matching as `isQuoteInTranscript`.
 */
export function locateQuote(quote: string, transcript: string): { start: number; end: number } | null {
  const words = evidenceTokens(quote);
  if (words.length === 0) return null;
  const spans = evidenceTokenSpans(transcript);
  for (let from = 0; from + words.length <= spans.length; from++) {
    if (words.every((word, i) => spans[from + i].token === word)) return { start: spans[from].start, end: spans[from + words.length - 1].end };
  }
  return null;
}

/** Split a quote on ellipses into the parts that must each be found. */
function quoteSegments(quote: string): string[][] {
  return quote
    .split(/\.{3,}|…|\[\.\.\.\]/)
    .map(evidenceTokens)
    .filter((segment) => segment.length > 0);
}

function findSegment(haystack: string[], segment: string[], from: number, strict = false): number {
  const allowedMismatches = !strict && segment.length >= LONG_SEGMENT_WORDS ? 1 : 0;
  for (let start = from; start + segment.length <= haystack.length; start++) {
    let mismatches = 0;
    for (let i = 0; i < segment.length && mismatches <= allowedMismatches; i++) {
      if (haystack[start + i] !== segment[i]) mismatches++;
    }
    if (mismatches <= allowedMismatches) return start + segment.length;
  }
  return -1;
}

/**
 * True when the quote can be found in the transcript (see module doc for tolerance rules).
 *
 * `strict`: the quote must be one contiguous run of the transcript's words, word for word: no ellipsis gaps and no
 * tolerated differing word. Only case, punctuation and hesitation fillers are ignored. Used where a quote is evidence
 * of the student's language (a "corrected" quote such as "nobody helps" for "nobody will helps" must not pass).
 */
export function isQuoteInTranscript(quote: string, transcript: string, options: { strict?: boolean } = {}): boolean {
  if (options.strict) {
    const words = evidenceTokens(quote);
    return words.length > 0 && findSegment(evidenceTokens(transcript), words, 0, true) !== -1;
  }
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
