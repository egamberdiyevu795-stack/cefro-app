/**
 * The mock result page's view model (docs/v1-plan.md, step 4): turns a mock's four parts (`MockResultSource`) into what the
 * page shows. Pure and browser-safe. The page renders only this.
 *
 * Top: the speaking-only estimate ("CEFRO: B2"), and "Your teacher: B2" beside it when a teacher has rated the parts the
 * rule needs. Then one row per part, then the biggest fix across the mock. Never a 0–75 or 0–30 score, never Passed / Failed,
 * never "certificate level" (docs/official-scale.md, section 5). The level still comes from the official 0-75 table when all four
 * parts have a mark (`estimateMockSpeaking`), but the student never sees the number: owner decision 15 Nov 2026, the level leads
 * and a precise "49 / 75" from practice bands reads more official than it is. Teachers still see it (features/teacher/mock-view.ts).
 */
import { placeLabel } from "@/domain/teacher/exam-laptop";
import { examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";
import type { MockStatus } from "@/domain/speaking/full-mock";
import {
  ESTIMATE_NOT_READY,
  SPEAKING_ONLY_LINE,
  type EstimatedLevel,
  type PartBands,
} from "@/domain/speaking/mock-level";
import { estimateMockSpeaking } from "@/domain/speaking/mock-score";
import { PART_NAMES } from "@/features/dashboard/progress";
import { formatDate, levelOfBand } from "@/features/history/view-model";
import type { MockPartSource, MockResultSource, NotScoredReason, PartFix } from "./part-source";

/** A level shown next to a name: "CEFRO: B2", "Your teacher: B2". `value` is null while it cannot be given. */
export interface LevelTile {
  /** "CEFRO" or "Your teacher". */
  name: string;
  value: EstimatedLevel | null;
}

export type Headline =
  | { kind: "level"; level: EstimatedLevel }
  /** The estimate cannot be given yet: the title says so, `reason` says which parts are the reason. */
  | { kind: "not_ready"; title: string; reason: string };

export interface MockRowView {
  part: ExamPartId;
  partLabel: string;
  name: string;
  taskTitle: string | null;
  state: MockPartSource["state"];
  /** The app's level for the part ("B1") with its band ("Band 2 · Higher B1"); null unless scored. */
  cefro: { level: string; bandText: string } | null;
  /** "Your teacher: B2" for this part; null when no teacher has rated it. */
  teacherLevel: string | null;
  /** What stands in place of a band: "Scoring Part 2…", "AI score not ready yet", "Not done" … Null when scored. */
  status: string | null;
  detailHref: string | null;
}

export interface FixView {
  partLabel: string;
  fix: PartFix;
  retryHref: string | null;
  lesson: { href: string; title: string } | null;
}

export interface MockResultView {
  id: string;
  status: MockStatus;
  /** "Mock exam · 11.11.26" */
  title: string;
  date: string;
  /** "Not finished" for a mock closed after 24 hours; null otherwise. */
  notFinishedNote: string | null;
  /** "In class" (on a teacher's exam laptop) or "At home"; null when the source does not say (the demo mock). */
  placeText: string | null;
  headline: Headline;
  /** The CEFRO level, and the teacher's when there is one: side by side, never instead of each other. */
  levels: LevelTile[];
  /** The line under the level: exactly docs/official-scale.md section 5. */
  line: typeof SPEAKING_ONLY_LINE;
  rows: MockRowView[];
  /** The weakest part's fix; null while any part is still scoring, or when no part was scored. */
  fix: FixView | null;
  /** The fix cannot be shown yet because a part is still being scored. */
  fixWaiting: boolean;
  /** True while any part is still being scored: the page keeps checking. */
  scoring: boolean;
}

/** The band a part gives the rule: its band when scored, else null (not done, still scoring, failed, too short to rate). */
export function bandsOf(parts: readonly MockPartSource[]): PartBands {
  const bands: PartBands = {};
  for (const p of parts) bands[p.part] = p.state === "scored" && p.band ? p.band.band : null;
  return bands;
}

const REASON_TEXT: Record<NotScoredReason, string> = {
  too_short: "Too short to rate",
  no_speech: "No speech found",
  ai_pending: "AI score not ready yet",
  failed: "Not scored",
};

function statusOf(p: MockPartSource): string | null {
  switch (p.state) {
    case "scored":
      return null;
    case "scoring":
      return `Scoring ${examPartLabel(p.part)}…`;
    case "not_done":
      return "Not done";
    case "not_scored":
      return REASON_TEXT[p.reason ?? "failed"];
  }
}

const MISSING_TEXT: Record<NotScoredReason, string> = {
  too_short: "was too short to rate",
  no_speech: "had no speech to rate",
  ai_pending: "has no AI score yet",
  failed: "could not be scored",
};

/** "Part 2 is still being scored · Part 3 has no AI score yet." Names every part the estimate is waiting for, and why. */
function missingReason(parts: readonly MockPartSource[], missing: readonly ExamPartId[]): string {
  const bits = missing.map((id) => {
    const p = parts.find((x) => x.part === id);
    const why = !p || p.state === "not_done" ? "was not done" : p.state === "scoring" ? "is still being scored" : MISSING_TEXT[p.reason ?? "failed"];
    return `${examPartLabel(id)} ${why}`;
  });
  return `${bits.join(" · ")}.`;
}

/** The weakest scored part: the one furthest below its own target band. A tie goes to the earlier part. */
export function weakestPart(parts: readonly MockPartSource[]): MockPartSource | null {
  let best: MockPartSource | null = null;
  for (const p of parts) {
    if (!p.fix) continue;
    if (!best || p.fix.gap > best.fix!.gap) best = p;
  }
  return best;
}

/**
 * The teacher's level for the mock: the level they gave the whole mock when they did (docs/v1-plan.md, step 6), else the same
 * rule applied to the teacher's own part bands, and only when the teacher rated every part the rule needs; otherwise null
 * (nothing shown).
 */
export function teacherEstimate(parts: readonly MockPartSource[], whole: EstimatedLevel | null = null): { level: EstimatedLevel; score: number | null } | null {
  // A level the teacher gave the whole mock has no 0-75 score: it is their level, not a sum of marks.
  if (whole) return { level: whole, score: null };
  const bands: PartBands = {};
  for (const p of parts) bands[p.part] = p.teacher ? p.teacher.band : null;
  const estimate = estimateMockSpeaking(bands);
  return estimate.kind === "ready" ? { level: estimate.level, score: estimate.score } : null;
}

export function buildMockResultView(source: MockResultSource): MockResultView {
  const { parts } = source;
  const date = formatDate(source.createdAt);
  const estimate = estimateMockSpeaking(bandsOf(parts));
  const scoring = parts.some((p) => p.state === "scoring");
  const teacher = teacherEstimate(parts, source.teacherLevel ?? null);

  const headline: Headline =
    estimate.kind === "ready"
      ? { kind: "level", level: estimate.level }
      : { kind: "not_ready", title: ESTIMATE_NOT_READY, reason: missingReason(parts, estimate.missing) };

  const weakest = scoring ? null : weakestPart(parts);

  return {
    id: source.id,
    status: source.status,
    title: `Mock exam · ${date}`,
    date,
    placeText: source.place ? placeLabel(source.place) : null,
    notFinishedNote: source.status === "not_finished" ? "Not finished. This mock took longer than 24 hours, so it is closed. The parts you finished keep their results." : null,
    headline,
    levels: [
      { name: "CEFRO", value: estimate.kind === "ready" ? estimate.level : null },
      ...(teacher ? [{ name: "Your teacher", value: teacher.level }] : []),
    ],
    line: SPEAKING_ONLY_LINE,
    rows: parts.map((p) => ({
      part: p.part,
      partLabel: examPartLabel(p.part),
      name: PART_NAMES[p.part],
      taskTitle: p.taskTitle,
      state: p.state,
      cefro: p.band ? { level: levelOfBand(p.band.label), bandText: `Band ${p.band.band} · ${p.band.label}` } : null,
      teacherLevel: p.teacher?.level ?? null,
      status: statusOf(p),
      detailHref: p.detailHref,
    })),
    fix: weakest?.fix ? { partLabel: examPartLabel(weakest.part), fix: weakest.fix.view, retryHref: weakest.fix.retryHref, lesson: weakest.fix.lesson } : null,
    fixWaiting: scoring,
    scoring,
  };
}
