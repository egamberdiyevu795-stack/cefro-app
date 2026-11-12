import { betterParts, type BetterPart, type SentenceFix } from "@/domain/evaluation/sentence-fixes";
import { locateQuote } from "@/domain/evaluation/evidence";

/**
 * The "Your answer" transcript with the student's mistakes marked (docs/v1-plan.md §3.3). Pure: from the transcript and
 * the checked `sentence_fixes` list of a result it builds what the page draws, so the same code serves the result page,
 * Part 3's result page and the teacher's read-only attempt page.
 *
 *  - The transcript is cut into sentences. A sentence that holds a mistake is one tap target; the mistake itself is
 *    underlined (amber, never red), the rest of the sentence is plain.
 *  - Tapping it opens, under it, You said / Better / Why for each mistake in that sentence.
 *  - The count is the number of sentences with a mistake ("6 sentences to improve").
 *  - "You said" is shown exactly as the transcript has it (the located words, not the model's copy).
 *
 * `null` = the result has no list (scored before evaluator 3.6.0): the page shows the plain transcript, as before.
 */

export interface FixItem {
  /** Index in the checked list (most important first). */
  id: number;
  youSaid: string;
  better: BetterPart[];
  why: string;
}

export interface TranscriptPiece {
  text: string;
  /** The mistake this piece is (underlined), or null. */
  fixId: number | null;
  /** Part 3 only: words read from the lists (dotted underline). */
  copied: boolean;
}

/** One or more sentences. A unit with `fixIds` is one tap target; the others are plain text. */
export interface TranscriptUnit {
  pieces: TranscriptPiece[];
  fixIds: number[];
}

export interface TranscriptFixesView {
  /** Sentences with at least one mistake. */
  count: number;
  items: FixItem[];
  units: TranscriptUnit[];
}

interface Range {
  start: number;
  end: number;
}

/** Sentence ranges that tile the whole transcript (trailing spaces stay with the sentence before). */
function sentenceRanges(transcript: string): Range[] {
  const ranges: Range[] = [];
  for (const match of transcript.matchAll(/[^.!?]*[.!?]+["')\]]*\s*|[^.!?]+$/g)) {
    if (match[0].length > 0) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges.length > 0 ? ranges : [{ start: 0, end: transcript.length }];
}

export function buildTranscriptFixes(
  transcript: string,
  fixes: readonly SentenceFix[] | undefined,
  /** Character ranges to mark as copied from the lists (Part 3). */
  copied: readonly Range[] = [],
): TranscriptFixesView | null {
  if (!fixes) return null;

  const located = fixes.flatMap((fix, id) => {
    const range = locateQuote(fix.you_said, transcript);
    return range ? [{ id, fix, ...range }] : [];
  });

  // Sentences, merged where one mistake runs across a full stop, so every mistake sits inside one unit.
  const units: { start: number; end: number; ids: number[] }[] = [];
  for (const sentence of sentenceRanges(transcript)) {
    const last = units.at(-1);
    const crossing = last && located.some((l) => l.start < last.end && l.end > last.end && l.start >= last.start);
    if (last && crossing) last.end = sentence.end;
    else units.push({ ...sentence, ids: [] });
  }
  for (const l of located) {
    const unit = units.find((u) => l.start >= u.start && l.start < u.end);
    if (unit) unit.ids.push(l.id);
  }

  const items: FixItem[] = located.map((l) => ({
    id: l.id,
    youSaid: transcript.slice(l.start, l.end),
    better: betterParts(transcript.slice(l.start, l.end), l.fix.better),
    why: l.fix.why,
  }));

  const built: TranscriptUnit[] = units.map((unit) => {
    const marks = located.filter((l) => l.start >= unit.start && l.start < unit.end);
    const cuts = new Set<number>([unit.start, unit.end]);
    for (const m of marks) [m.start, Math.min(m.end, unit.end)].forEach((c) => cuts.add(c));
    for (const c of copied) [c.start, c.end].forEach((p) => p > unit.start && p < unit.end && cuts.add(p));
    const points = [...cuts].sort((a, b) => a - b);
    const pieces: TranscriptPiece[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const [start, end] = [points[i], points[i + 1]];
      const mark = marks.find((m) => start >= m.start && end <= m.end);
      pieces.push({
        text: transcript.slice(start, end),
        fixId: mark ? mark.id : null,
        copied: copied.some((c) => start >= c.start && end <= c.end),
      });
    }
    return { pieces, fixIds: unit.ids.sort((a, b) => a - b) };
  });

  return { count: built.filter((u) => u.fixIds.length > 0).length, items, units: built };
}

/** "6 sentences to improve" / "1 sentence to improve" / "No sentences marked". */
export function fixCountText(count: number): string {
  if (count === 0) return "No sentences marked in this answer";
  return `${count} ${count === 1 ? "sentence" : "sentences"} to improve`;
}
