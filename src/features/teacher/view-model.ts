/**
 * The Teacher view's screens (docs/teacher-plan.md, section 2), from what a teacher may read: each student's shown
 * name and their SHARED attempts only (made after they tapped Share; the server never passes anything else). Pure and
 * browser-safe; the same functions serve the demo teacher (mock mode) and real classes.
 */
import { FEATURE_LABELS, LEVEL_LABELS, type FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import type { BandedResult, HistoryAttempt, HistoryMock } from "@/domain/speaking/history";
import { LEVEL_WINDOW, overallLevel, scoredAttempts, skillLevels, type ScoredAttempt, type SkillLevels } from "@/features/dashboard/progress";
import { formatDate, mockBands, mockRow, toHistoryRows, type HistoryRow } from "@/features/history/view-model";
import { estimateSpeakingLevel } from "@/domain/speaking/mock-level";
import { lastMockText } from "./mock-view";
import { lessonForResult } from "@/features/lessons/choose";
import { GOAL_LABEL, goalOutcomeOf, type BandLabel } from "@/features/result/view-model";

/** One student as their teacher sees them: the name they chose for this class and their shared attempts, newest first. */
export interface SharedStudent {
  memberId: string;
  shownName: string;
  sharedAt: string;
  /** Shared attempts only (created after `sharedAt`), newest first. A retry of an earlier attempt has no previous. */
  attempts: HistoryAttempt[];
  /** The full mocks the teacher may see (started after the student's full sharing began), newest first. Their parts are `attempts` with `sessionId`. */
  mocks: HistoryMock[];
  /** False for a membership on the first Share wording that was not upgraded: Part 2 attempts only, no mocks, no recordings. */
  partsShared: boolean;
}

/* ---------------------------------------------------------------------------------------------- level and skills */

/** The level from shared attempts only: the dashboard's rule (middle of the last 3 scored answers per skill). */
export function studentSkills(attempts: readonly HistoryAttempt[]): SkillLevels | null {
  const scored = scoredAttempts(attempts);
  return scored.length ? skillLevels(scored.slice(0, LEVEL_WINDOW).map((a) => a.result)) : null; // Part 3 answers are skipped by skillLevels
}

export function studentLevel(attempts: readonly HistoryAttempt[]): FeatureLevel | null {
  const skills = studentSkills(attempts);
  return skills ? overallLevel(skills) : null;
}

export function levelText(level: FeatureLevel | null): string {
  return level ? LEVEL_LABELS[level] : "No level yet";
}

/* --------------------------------------------------------------------------------------------------- biggest fix */

/** A biggest fix that can be counted across students and tasks: a skill, a question number, or "own words". */
export interface FixKey {
  key: string;
  label: string;
}

const QUESTION_VERDICT: Record<string, string> = {
  missing: "Not answered",
  off_topic: "Off topic",
  minimal: "Too short to count",
  partial: "Partly answered",
  on_topic: "Answered",
};

export function fixKeyOf(result: BandedResult): FixKey {
  if (result.kind === "multilevel_q8") {
    // Part 3: counted by what the fix is about (the teacher sees the detail on the attempt page).
    const fix = result.scoring.biggest_fix;
    if (fix.kind === "feature") return { key: `feature:${fix.feature}`, label: FEATURE_LABELS[fix.feature] };
    const labels = { own_words: "Own words", prompt_dependence: "Words from the list", section_coverage: "Both sides not covered", point_development: "Points not developed" } as const;
    return { key: `p3:${fix.kind}`, label: `Part 3 · ${labels[fix.kind]}` };
  }
  const fix = result.scoring.biggest_fix;
  if (fix.kind === "feature") return { key: `feature:${fix.feature}`, label: FEATURE_LABELS[fix.feature] };
  if (fix.kind === "question_coverage") {
    const status = result.assessment.questions.find((q) => q.id === fix.question_id)?.status ?? "missing";
    return { key: `question:${fix.question_id}:${status}`, label: `Question ${fix.question_id} · ${QUESTION_VERDICT[status] ?? "Not answered"}` };
  }
  return { key: "own_words", label: "Own words · Answer the questions" };
}

/** A student's latest shared scored attempt (null when none is scored yet). */
export function latestScored(attempts: readonly HistoryAttempt[]): ScoredAttempt | null {
  return scoredAttempts(attempts)[0] ?? null;
}

/* ---------------------------------------------------------------------------------------------- common problems */

export interface CommonProblem {
  label: string;
  /** How many students have it as their current biggest fix. */
  count: number;
  /** Students with at least one scored shared attempt. */
  of: number;
  /** The approved lesson for it (read-only for the teacher); null when none is approved. */
  lesson: { slug: string; title: string } | null;
}

/**
 * "Most common problems": the top 3 biggest fixes, once per student, each from their latest shared scored attempt.
 * Ties keep the order in which the fix first appears (students in the order they joined). The lesson link appears only
 * for an approved lesson.
 */
export function commonProblems(students: readonly SharedStudent[], top = 3): CommonProblem[] {
  const latest = students.flatMap((s) => {
    const a = latestScored(s.attempts);
    return a ? [a.result] : [];
  });
  const groups = new Map<string, { label: string; results: BandedResult[] }>();
  for (const result of latest) {
    const { key, label } = fixKeyOf(result);
    const group = groups.get(key) ?? { label, results: [] };
    group.results.push(result);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g, order) => ({ g, order }))
    .sort((a, b) => b.g.results.length - a.g.results.length || a.order - b.order)
    .slice(0, top)
    .map(({ g }) => {
      const first = g.results[0];
      const lesson = first.kind === "multilevel" ? lessonForResult(first) : null; // no approved Part 3 lessons
      return { label: g.label, count: g.results.length, of: latest.length, lesson: lesson ? { slug: lesson.slug, title: lesson.title } : null };
    });
}

export function countText(problem: Pick<CommonProblem, "count" | "of">): string {
  return `${problem.count} of ${problem.of} ${problem.of === 1 ? "student" : "students"}`;
}

/* ---------------------------------------------------------------------------------------------- students (T3) */

export interface StudentRow {
  memberId: string;
  name: string;
  level: string;
  attempts: number;
  /** dd.mm.yy, or "—" with no shared attempt yet. */
  lastPractice: string;
  /** The current biggest fix's short label, or "—". */
  biggestFix: string;
  /** The latest scored attempt is a retry of a shared attempt: whether it met its goal. Else "—". */
  retryGoal: "Goal met" | "Not yet" | "—";
  /** The newest mock the teacher may see: "B2 · 10.11.26" (level, date), "Not finished · 10.11.26", or "—". */
  lastMock: string;
  /** A quiet note when only Part 2 is shared (a membership on the first Share wording, not upgraded); else null. */
  scopeNote: string | null;
}

/** Shown on T3 and T4 for a membership that shares Part 2 attempts only. */
export const PART2_ONLY_NOTE = "Shares Part 2 only";

/** The newest shared mock as "B2 · 10.11.26" (level, date), read from its own shared attempts. */
export function lastMockOf(student: Pick<SharedStudent, "mocks" | "attempts">): string {
  const mock = student.mocks[0];
  if (!mock) return "—";
  const estimate = estimateSpeakingLevel(mockBands(student.attempts.filter((a) => a.sessionId === mock.id)));
  return lastMockText({ status: mock.status, createdAt: mock.createdAt, level: estimate.kind === "ready" ? estimate.level : null });
}

export function retryGoalOf(attempts: readonly HistoryAttempt[]): StudentRow["retryGoal"] {
  const latest = latestScored(attempts);
  const previous = latest?.previousAttemptId ? attempts.find((a) => a.id === latest.previousAttemptId) : undefined;
  if (!latest || !previous?.result) return "—";
  const goal = goalOutcomeOf(previous.result, latest.result);
  return goal ? GOAL_LABEL[goal] : "—";
}

export function studentRow(student: SharedStudent): StudentRow {
  const latest = latestScored(student.attempts);
  return {
    memberId: student.memberId,
    name: student.shownName,
    level: levelText(studentLevel(student.attempts)),
    attempts: student.attempts.length,
    lastPractice: student.attempts[0] ? formatDate(student.attempts[0].createdAt) : "—",
    biggestFix: latest ? fixKeyOf(latest.result).label : "—",
    retryGoal: retryGoalOf(student.attempts),
    lastMock: lastMockOf(student),
    scopeNote: student.partsShared ? null : PART2_ONLY_NOTE,
  };
}

/* ---------------------------------------------------------------------------------------------- classes (T1) */

export interface ClassSummary {
  id: string;
  name: string;
  students: number;
  /** dd.mm.yy of the latest shared attempt, else "No activity yet". */
  lastActivity: string;
}

export function classSummary(cls: { id: string; name: string }, students: readonly SharedStudent[]): ClassSummary {
  const latest = students.flatMap((s) => s.attempts.slice(0, 1).map((a) => a.createdAt)).sort().pop();
  return { id: cls.id, name: cls.name, students: students.length, lastActivity: latest ? formatDate(latest) : "No activity yet" };
}

export function studentCountText(n: number): string {
  return `${n} ${n === 1 ? "student" : "students"}`;
}

/* --------------------------------------------------------------------------------------------- one student (T4) */

export interface StudentDetail {
  name: string;
  level: string;
  skills: { name: string; level: string }[];
  /** Full mocks first (one row each: "Mock exam · B2 · 10.11.26"), newest first; each opens T6. */
  mockRows: HistoryRow[];
  /** Single attempts (mock parts are inside their mock), newest first. */
  rows: HistoryRow[];
  latestId: string | null;
  /** The newest mock; "Open latest mock" is T4's black button, else "Open latest attempt". */
  latestMockId: string | null;
  scopeNote: string | null;
}

export function studentDetail(student: SharedStudent): StudentDetail {
  const skills = studentSkills(student.attempts);
  const mockIds = new Set(student.mocks.map((m) => m.id));
  const loose = student.attempts.filter((a) => !(a.sessionId != null && mockIds.has(a.sessionId)));
  return {
    name: student.shownName,
    level: levelText(skills ? overallLevel(skills) : null),
    skills: skills
      ? (Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map((f) => ({ name: FEATURE_LABELS[f], level: skills[f] ? LEVEL_LABELS[skills[f]!] : "Not assessed" }))
      : [],
    mockRows: student.mocks.map((m) => mockRow(m, student.attempts.filter((a) => a.sessionId === m.id))),
    rows: toHistoryRows(loose, student.attempts),
    latestId: loose[0]?.id ?? student.attempts[0]?.id ?? null,
    latestMockId: student.mocks[0]?.id ?? null,
    scopeNote: student.partsShared ? null : PART2_ONLY_NOTE,
  };
}

/* ---------------------------------------------------------------------------------------------- ratings (T5) */

/** "Band 4 · Higher B2": a band with the part's own label. */
export function bandOptionLabel(band: BandLabel): string {
  return `Band ${band.band} · ${band.label}`;
}

/** "CEFRO: Part 2 · Band 3 · Lower B2" */
export function appVerdictText(part: number | string, band: number, label: string): string {
  return `CEFRO: Part ${part} · Band ${band} · ${label}`;
}

/** The teacher's saved view, as stored: Agree, or their own band. */
export type TeacherRating = { agrees: true } | { agrees: false; band: number };

/** "You: Agree" or "You: Higher B2 (Band 4)". */
export function ratingText(rating: TeacherRating, bands: readonly BandLabel[]): string {
  if (rating.agrees) return "You: Agree";
  const label = bands.find((b) => b.band === rating.band)?.label;
  return label ? `You: ${label} (Band ${rating.band})` : `You: Band ${rating.band}`;
}
