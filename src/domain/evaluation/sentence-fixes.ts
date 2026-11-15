import { z } from "zod";
import { evidenceTokens, locateQuote } from "./evidence";

/**
 * "Sentences to improve" (docs/v1-plan.md §3.3): the evaluator lists up to 8 places where the student's own words
 * contain one language mistake. Each item has
 *   you_said  the student's exact words, mistake included,
 *   better    the SAME words with only that mistake fixed (the student's words and idea stay),
 *   why       one short line.
 * Never a rewritten or model answer (V1 decision Q2).
 *
 * The AI proposes; this file's code decides. `checkSentenceFixes` runs after the model (inside both quality gates) and
 * drops any item that is not word for word in the transcript, that changes or adds more than the one mistake, or that is
 * about pauses or pronunciation (which a transcript cannot show: docs/feedback-review.md, issue 2). Pure, browser-safe.
 */

export const MAX_SENTENCE_FIXES = 8;
/** "you_said" is one clause or sentence, not a paragraph. */
export const MAX_YOU_SAID_WORDS = 25;
/** "better" may be a few words longer or shorter than "you_said" (an added "to", "the", "years old"), not more. */
export const MAX_WORD_CHANGE = 3;
/** New content words in "better" (not in "you_said", not a form of one of its words): a fixed word or two, not an idea. */
export const MAX_NEW_CONTENT_WORDS = 2;
/** "why" is one short line. */
export const MAX_WHY_WORDS = 20;

export const sentenceFixSchema = z.object({
  you_said: z
    .string()
    .min(1)
    .describe("The student's own words, copied exactly from the transcript with the mistake in them: one clause or sentence, at most 25 words."),
  better: z
    .string()
    .min(1)
    .describe(
      "The same words with ONLY that one mistake fixed. Keep the student's words, order and idea. Never add an idea, a reason or an example; at most 3 words longer. Never a rewritten answer.",
    ),
  why: z.string().min(1).describe("One short line (at most 20 words) naming the rule, in plain words. About grammar or word choice only."),
});
export type SentenceFix = z.infer<typeof sentenceFixSchema>;

const FIXES_HELP =
  "Up to 8 sentences or phrases of the student's own words with one mistake each, most important first (a mistake that hides the meaning, or one that repeats, before a small slip). Empty list if there is no clear mistake. Without audio, never about pauses, fillers, speed or pronunciation.";

/** What the providers are asked for: at most 8, always present. */
export const sentenceFixesProviderSchema = z.array(sentenceFixSchema).max(MAX_SENTENCE_FIXES).describe(FIXES_HELP);
/** What is read back (stored results, a model draft): a longer list still parses, the check below trims it to 8. */
export const sentenceFixesStoredSchema = z.array(sentenceFixSchema).max(32);

export type SentenceFixDropReason =
  | "incomplete"
  | "not_in_transcript"
  | "too_long"
  | "unchanged"
  | "changes_too_much"
  | "adds_idea"
  | "several_mistakes"
  | "pause_or_pronunciation"
  | "why_too_long"
  | "forbidden_text"
  | "overlaps"
  | "over_limit";

export interface SentenceFixCheckOptions {
  transcript: string;
  /**
   * True when the answer is judged from the written transcript alone (always the case for the transcript evaluator:
   * it never hears the audio). Items about pauses, speed, fluency or pronunciation are then dropped.
   */
  transcriptOnly: boolean;
  /** Student-facing text that must not appear (internal field names), checked in "better" and "why". */
  forbidden?: RegExp;
}

export interface SentenceFixCheck {
  kept: SentenceFix[];
  dropped: { index: number; reason: SentenceFixDropReason }[];
}

// ── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Function words: a fixed answer may add or swap these (to, the, for, a form of "be" or "do") without adding an idea. */
const FUNCTION_WORDS = new Set(
  (
    "a an the to of for in on at by with from about as into over after before between and or but so if than that this these those " +
    "i me my mine you your we us our they them their he him his she her it its am is are was were be been being do does did " +
    "have has had will would can could should must may might not no don't doesn't didn't can't won't isn't aren't wasn't weren't " +
    "very much more most too also just there here who which what when where why how any some one"
  ).split(" "),
);

/** Edit distance, capped: forms of one word ("give"/"gave", "he"/"his", "decision"/"decisions") are within 2. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** A word of "better" that comes from the student's own words: the same word or a close form of it. */
function isFormOf(word: string, source: readonly string[]): boolean {
  return source.some((s) => s === word || (Math.min(s.length, word.length) >= 3 && editDistance(s, word) <= 2));
}

/** Word-level diff on tokens: which tokens of each side are not part of the longest common run, and how many separate changes. */
export function diffTokens(a: readonly string[], b: readonly string[]): { aChanged: boolean[]; bChanged: boolean[]; hunks: number } {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const aChanged = new Array<boolean>(n).fill(true);
  const bChanged = new Array<boolean>(m).fill(true);
  // Walk both sides together; `ops` records equal (=) or changed (x) steps in order, to count the separate changes.
  const ops: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      aChanged[i] = false;
      bChanged[j] = false;
      ops.push("=");
      i++;
      j++;
    } else {
      ops.push("x");
      if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
      else j++;
    }
  }
  while (i < n || j < m) {
    ops.push("x");
    if (i < n) i++;
    else j++;
  }
  let hunks = 0;
  for (let k = 0; k < ops.length; k++) if (ops[k] === "x" && (k === 0 || ops[k - 1] !== "x")) hunks++;
  return { aChanged, bChanged, hunks };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Pauses, fillers, speed, fluency and everything about sounds. A transcript shows none of them (the anchors are written
 * text; silent pauses never reach it), so on a transcript-only run any item whose "why" says one of these is dropped ("better" is the student's own words and may contain any of them).
 */
export const PAUSE_OR_PRONUNCIATION =
  /\b(paus\w*|hesitat\w*|fillers?|silen\w*|breath\w*|smooth\w*|fluen\w*|speed\w*|pace|paced|slow\w*|fast|quick\w*|rhythm\w*|intonation|stress\w*|accents?|accented|(?:mis)?pron(?:ou|u)nc\w*|vowels?|consonants?|phonem\w*|sounds?|sounded|aloud|clearly spoken)\b/i;

/** Two sentences or two rules in one line. */
function isOneLine(why: string): boolean {
  return !/[.!?]\s+\S/.test(why) && !/;/.test(why);
}

// ── The check ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Keeps the items that pass every check, in the model's order (most important first), at most 8. Never repairs or
 * rewrites an item: an item that fails is dropped whole. `dropped` says why, for the quality report (never shown to
 * students).
 */
export function checkSentenceFixes(items: readonly SentenceFix[], options: SentenceFixCheckOptions): SentenceFixCheck {
  const kept: SentenceFix[] = [];
  const dropped: SentenceFixCheck["dropped"] = [];
  const keptRanges: { start: number; end: number }[] = [];

  items.forEach((raw, index) => {
    const reason = firstProblem(raw, options);
    const item = { you_said: normalise(raw.you_said), better: normalise(raw.better), why: normalise(raw.why) };
    if (reason) return void dropped.push({ index, reason });
    const range = locateQuote(item.you_said, options.transcript)!;
    if (keptRanges.some((r) => range.start < r.end && r.start < range.end)) return void dropped.push({ index, reason: "overlaps" });
    if (kept.length >= MAX_SENTENCE_FIXES) return void dropped.push({ index, reason: "over_limit" });
    kept.push(item);
    keptRanges.push(range);
  });
  return { kept, dropped };
}

function firstProblem(raw: SentenceFix, options: SentenceFixCheckOptions): SentenceFixDropReason | null {
  const youSaid = normalise(raw.you_said);
  const better = normalise(raw.better);
  const why = normalise(raw.why);
  if (!youSaid || !better || !why) return "incomplete";

  // 1. The student's words, word for word. An ellipsis means words were skipped; one word alone proves nothing.
  const said = evidenceTokens(youSaid);
  if (/\.{3,}|…/.test(youSaid) || said.length < 2 || !locateQuote(youSaid, options.transcript)) return "not_in_transcript";
  if (said.length > MAX_YOU_SAID_WORDS) return "too_long";

  // 2. Pauses, speed and pronunciation are not in a transcript.
  if (options.transcriptOnly && PAUSE_OR_PRONUNCIATION.test(why)) return "pause_or_pronunciation";
  if (options.forbidden && options.forbidden.test(`${better} ${why}`)) return "forbidden_text";
  if (wordCount(why) > MAX_WHY_WORDS || !isOneLine(why)) return "why_too_long";

  // 3. "better" is the same sentence with the mistake fixed: something changed, but not much, and nothing new.
  const fixed = evidenceTokens(better);
  if (fixed.length === 0) return "incomplete";
  if (fixed.join(" ") === said.join(" ")) return "unchanged";
  if (Math.abs(fixed.length - said.length) > MAX_WORD_CHANGE) return "changes_too_much";
  const kept = said.filter((w) => isFormOf(w, fixed)).length;
  if (kept < said.length / 2) return "changes_too_much";
  const newContent = fixed.filter((w) => !FUNCTION_WORDS.has(w) && !isFormOf(w, said));
  if (newContent.length > MAX_NEW_CONTENT_WORDS) return "adds_idea";

  // 4. One mistake: one change in the sentence (adjacent changed words are one change). A word moved to another place
  // is two changes of the same words, and still one mistake.
  const { hunks } = diffTokens(said, fixed);
  const sameWords = [...said].sort().join(" ") === [...fixed].sort().join(" ");
  if (hunks > 1 && !(hunks === 2 && sameWords)) return "several_mistakes";
  return null;
}

// ── Display helper ──────────────────────────────────────────────────────────────────────────────────────────────

export interface BetterPart {
  text: string;
  /** A word that differs from what the student said: shown in bold. */
  changed: boolean;
}

/**
 * "better" in pieces, the words that differ from "you_said" marked, e.g. "my father" + "gave" (changed) + "me advice".
 * Spaces and punctuation stay with the neighbouring unchanged text.
 */
export function betterParts(youSaid: string, better: string): BetterPart[] {
  const said = evidenceTokens(youSaid);
  const words = [...better.matchAll(/[A-Za-z0-9]+(?:['’‘ʼ`][A-Za-z0-9]+)*/g)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const tokens = words.map((w) => w.text.replace(/[‘’ʼ`]/g, "'").toLowerCase());
  const { bChanged } = diffTokens(said, tokens.filter((t) => evidenceTokens(t).length > 0));
  // bChanged is indexed over the non-filler tokens; map it back to every word of "better".
  let k = 0;
  const changedAt = tokens.map((t) => (evidenceTokens(t).length > 0 ? bChanged[k++] : false));
  const parts: BetterPart[] = [];
  let at = 0;
  const push = (text: string, changed: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  words.forEach((w, i) => {
    const gap = better.slice(at, w.start);
    // A space between two changed words belongs to the change ("years old" in bold, not "years" and "old").
    push(gap, changedAt[i] && changedAt[i - 1] === true && gap.trim() === "");
    push(w.text, changedAt[i]);
    at = w.end;
  });
  push(better.slice(at), false);
  return parts;
}
