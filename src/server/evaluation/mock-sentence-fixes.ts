import "server-only";
import type { SentenceFix } from "@/domain/evaluation/sentence-fixes";

/**
 * Development-only "sentences to improve" for the mock evaluators (no model is called). A few rules for mistakes that
 * are wrong whatever the context (never a guess about tense), matched in the student's own words; each gives the same
 * words with only that mistake fixed. The demo answers (`features/demo`) contain some of these mistakes on purpose, so
 * the mock result pages have a list to show. The list goes through the same quality gate as a real model's, which checks
 * it again (`checkSentenceFixes`), so nothing here can reach a page that the real checks would drop.
 */

const PAST_TO_BASE: Record<string, string> = {
  went: "go", came: "come", saw: "see", gave: "give", took: "take", made: "make", wanted: "want", liked: "like", played: "play",
  said: "say", knew: "know", got: "get", had: "have", found: "find", told: "tell", ate: "eat", spoke: "speak",
};
const COMPARATIVES = "better|easier|bigger|cheaper|faster|harder|stronger|healthier|happier|safer|cleaner|quieter|larger|smaller";
const TO_VERBS = "go|stop|leave|study|work|help|learn|play|move|start|try|buy|find|take|get|make|become|be|give|do|see";

interface MockRule {
  pattern: RegExp;
  fix: (m: RegExpMatchArray) => string;
  why: string;
}

const RULES: readonly MockRule[] = [
  { pattern: /\b(we|they|you) was\b/gi, fix: (m) => `${m[1]} were`, why: "After we, they and you, the past of 'be' is 'were'." },
  { pattern: /\b(he|she|it) don't\b/gi, fix: (m) => `${m[1]} doesn't`, why: "After he, she and it, use 'doesn't', not 'don't'." },
  { pattern: /\b(people|children|friends|parents|drivers) is\b/gi, fix: (m) => `${m[1]} are`, why: "A plural noun takes 'are', not 'is'." },
  { pattern: new RegExp(`\\b(?:more|most) (${COMPARATIVES})\\b`, "gi"), fix: (m) => m[1], why: "Do not add 'more' to a word that already ends in -er." },
  { pattern: /\bI am (\d{1,2}) years?\b(?! old)/gi, fix: (m) => `I am ${m[1]} years old`, why: "Say your age with 'years old'." },
  {
    pattern: new RegExp(`\\b(want|wants|wanted|need|needs|needed|decide|decided|hope|hoped) (${TO_VERBS})\\b`, "gi"),
    fix: (m) => `${m[1]} to ${m[2]}`,
    why: "After 'want', 'need' and 'decide', put 'to' before the next verb.",
  },
  {
    pattern: new RegExp(`\\b(didn't|did not|don't|doesn't|can't|couldn't|won't|wouldn't) (${Object.keys(PAST_TO_BASE).join("|")})\\b`, "gi"),
    fix: (m) => `${m[1]} ${PAST_TO_BASE[m[2].toLowerCase()]}`,
    why: "After 'didn't', 'don't' or 'can't', use the base form of the verb.",
  },
  { pattern: /\b(depends?|depended) of\b/gi, fix: (m) => `${m[1]} on`, why: "We say 'depend on', not 'depend of'." },
  { pattern: /\binterested (?:on|about)\b/gi, fix: () => "interested in", why: "We say 'interested in'." },
  { pattern: /\bmarried with\b/gi, fix: () => "married to", why: "We say 'married to'." },
  { pattern: /\bdiscuss(es|ed)? about\b/gi, fix: (m) => `discuss${m[1] ?? ""}`, why: "'Discuss' has no 'about' after it." },
  { pattern: /\bI am agree\b/gi, fix: () => "I agree", why: "Say 'I agree', without 'am'." },
];

/** Up to two words of the same clause on each side of the mistake, so the quote reads like part of a sentence. */
function withContext(transcript: string, start: number, end: number): { before: string; after: string } {
  const left = transcript.slice(0, start).split(/[.!?,;:]/).at(-1) ?? "";
  const right = transcript.slice(end).split(/[.!?,;:]/)[0] ?? "";
  const before = left.match(/(?:\S+\s+){0,2}$/)?.[0] ?? "";
  const after = right.match(/^(?:\s+\S+){0,2}/)?.[0] ?? "";
  return { before, after };
}

/** Up to 8 mistakes found in the transcript, in the order of the rules and then of the text. */
export function mockSentenceFixes(transcript: string): SentenceFix[] {
  const fixes: SentenceFix[] = [];
  for (const rule of RULES) {
    for (const match of transcript.matchAll(rule.pattern)) {
      const { before, after } = withContext(transcript, match.index, match.index + match[0].length);
      fixes.push({ you_said: `${before}${match[0]}${after}`, better: `${before}${rule.fix(match)}${after}`, why: rule.why });
    }
  }
  return fixes.slice(0, 8);
}
