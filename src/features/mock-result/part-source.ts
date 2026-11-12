/**
 * One part of a mock, as the mock result page needs it (docs/v1-plan.md, step 4). Built from the part's attempt exactly as
 * the single-part result pages read it (`resultPageState` for Parts 1.1, 1.2 and 2, the same rule for Part 3), so a part
 * shows here what its own result page shows: the same band, the same "too short to rate", the same "AI score not ready yet".
 * Plain data (JSON-safe), so the server can send it to the browser; no database, no provider. Browser-safe.
 */
import { isMultilevel, isMultilevelQ8 } from "@/domain/evaluation/stored";
import type { EstimatedLevel } from "@/domain/speaking/mock-level";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import type { MockStatus } from "@/domain/speaking/full-mock";
import type { PublicArgumentTask } from "@/domain/speaking/argument-task";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { lessonForResult, lessonHref } from "@/features/lessons/choose";
import { part3BiggestFix } from "@/features/part3/view-model";
import { levelOfBand } from "@/features/history/view-model";
import { resultSourceFromAttempt } from "@/features/result/from-attempt";
import { resultPageState, type BandLabel } from "@/features/result/view-model";

export type MockPartState = "not_done" | "scoring" | "scored" | "not_scored";

/** Why a part that was done has no band. */
export type NotScoredReason = "too_short" | "no_speech" | "ai_pending" | "failed";

/** The part's own "Biggest fix" in the words of its result page, without its retry controls. */
export interface PartFix {
  /** "Grammar · B1", "Question 3 · Not answered" … */
  label: string;
  quoteLabel: string;
  quote: string;
  adviceLabel: string;
  tryInstead: string;
  /** The retry goal, when it adds something to `tryInstead`. */
  goal: string | null;
}

export interface MockPartBand {
  band: number;
  /** The rubric's own label: "Higher B1", "Lower B2" … */
  label: string;
  bandMax: number;
  targetBand: number;
}

/** What a teacher rated this part (the band they chose, or the app's band when they agreed). */
export interface PartTeacherRating {
  band: number;
  /** "B2": the band's own label without Lower/Higher. */
  level: string;
}

export interface MockPartSource {
  part: ExamPartId;
  attemptId: string | null;
  taskTitle: string | null;
  state: MockPartState;
  reason: NotScoredReason | null;
  band: MockPartBand | null;
  /** The part's own result page ("See details"); null when the part was not done. */
  detailHref: string | null;
  /** Set only for a scored part: the part's biggest fix with its retry and its lesson, where they exist. */
  fix: { gap: number; view: PartFix; retryHref: string | null; lesson: { href: string; title: string } | null } | null;
  teacher: PartTeacherRating | null;
}

/** The whole mock result's input. The owner's mock only (the route and page ask `getMock` first). */
export interface MockResultSource {
  id: string;
  status: MockStatus;
  createdAt: string;
  finishedAt: string | null;
  /** All four parts in exam order. */
  parts: MockPartSource[];
  /** The level a teacher gave the whole mock (docs/v1-plan.md, step 6); absent or null: not rated. Shown beside CEFRO's, never instead. */
  teacherLevel?: EstimatedLevel | null;
}

export const NOT_DONE_PART = (part: ExamPartId): MockPartSource => ({
  part,
  attemptId: null,
  taskTitle: null,
  state: "not_done",
  reason: null,
  band: null,
  detailHref: null,
  fix: null,
  teacher: null,
});

/** Where a part's links go: real attempts, or the demo results of mock mode. */
export interface PartLinks {
  detail: string;
  retry: string;
  lesson: (lesson: { slug: string }) => string;
}

type FixLike = Pick<PartFix, "label" | "quoteLabel" | "quote" | "adviceLabel" | "tryInstead" | "goal">;
const fixOf = (fix: FixLike): PartFix => ({ label: fix.label, quoteLabel: fix.quoteLabel, quote: fix.quote, adviceLabel: fix.adviceLabel, tryInstead: fix.tryInstead, goal: fix.goal });

/** A teacher's rating as the owner sees it: the band they chose (or the app's, when they agreed) and its level. */
export function teacherRatingOf(
  rating: { agrees: boolean; teacherBand: number | null; appBand: number },
  bandLabels: readonly BandLabel[],
): PartTeacherRating | null {
  const band = rating.agrees ? rating.appBand : rating.teacherBand;
  const label = typeof band === "number" ? bandLabels.find((b) => b.band === band)?.label : undefined;
  return typeof band === "number" && label ? { band, level: levelOfBand(label) } : null;
}

const base = (part: ExamPartId, attempt: AttemptView, taskTitle: string, links: PartLinks, teacher: PartTeacherRating | null) => ({
  part,
  attemptId: attempt.id,
  taskTitle,
  detailHref: links.detail,
  teacher,
});

/** Parts 1.1, 1.2 and 2 (Multilevel results). */
export function speakingPartSource(
  part: ExamPartId,
  attempt: AttemptView,
  ctx: { task: PublicSpeakingTask; bandLabels: readonly BandLabel[]; links: PartLinks; teacher: PartTeacherRating | null },
): MockPartSource {
  const { task, links } = ctx;
  const common = base(part, attempt, task.title, links, ctx.teacher);
  const source = resultSourceFromAttempt(attempt, { task, bandLabels: ctx.bandLabels });
  // Scored with the old method: it has no Part band, so the mock cannot use it (its own page says so).
  if (!source) return { ...common, state: "not_scored", reason: "failed", band: null, fix: null };
  const state = resultPageState(source);
  switch (state.kind) {
    case "scoring":
      return { ...common, state: "scoring", reason: null, band: null, fix: null };
    case "not_scored":
      return { ...common, state: "not_scored", reason: state.reason, band: null, fix: null };
    case "failed":
      return { ...common, state: "not_scored", reason: state.aiPending ? "ai_pending" : "failed", band: null, fix: null };
    case "scored": {
      const { view } = state;
      const result = attempt.evaluation && isMultilevel(attempt.evaluation.result) ? attempt.evaluation.result : null;
      const lesson = result ? lessonForResult(result) : null;
      return {
        ...common,
        state: "scored",
        reason: null,
        band: { band: view.band, label: view.bandLabel, bandMax: view.bandMax, targetBand: view.target.band },
        fix: {
          gap: view.target.band - view.band,
          view: fixOf(view.fix),
          retryHref: links.retry,
          lesson: lesson ? { href: links.lesson(lesson), title: lesson.title } : null,
        },
      };
    }
  }
}

/** Part 3 (balanced argument, `kind: "multilevel_q8"`). The same states as its own result page. */
export function part3Source(
  attempt: AttemptView,
  ctx: { task: PublicArgumentTask; links: PartLinks; teacher: PartTeacherRating | null },
): MockPartSource {
  const { task, links } = ctx;
  const common = base("3", attempt, task.title, links, ctx.teacher);
  const status = attempt.isStalled ? "failed" : attempt.status;
  const failure = attempt.isStalled ? { stage: null, code: "processing_stalled" as const } : attempt.failure;
  const result = attempt.evaluation && isMultilevelQ8(attempt.evaluation.result) ? attempt.evaluation.result : null;
  if (status !== "completed" && status !== "failed") return { ...common, state: "scoring", reason: null, band: null, fix: null };
  if (status === "completed" && result) {
    const s = result.scoring;
    return {
      ...common,
      state: "scored",
      reason: null,
      band: { band: s.band, label: s.label, bandMax: s.band_max, targetBand: s.target_band },
      fix: {
        gap: s.target_band - s.band,
        view: fixOf(part3BiggestFix(result, task, attempt.transcript?.text ?? "")),
        retryHref: links.retry,
        lesson: null,
      },
    };
  }
  const aiPending = Boolean(attempt.transcript?.text.trim()) && failure?.stage === "evaluation";
  const noSpeech = failure?.code === "transcription_empty";
  return { ...common, state: "not_scored", reason: noSpeech ? "no_speech" : aiPending ? "ai_pending" : "failed", band: null, fix: null };
}

/** Real links for an attempt of the signed-in student. */
export function realLinks(attemptId: string, retryHref: string): PartLinks {
  return {
    detail: `/result/${encodeURIComponent(attemptId)}`,
    retry: retryHref,
    lesson: (lesson) => lessonHref(lesson, { attempt: attemptId }),
  };
}
