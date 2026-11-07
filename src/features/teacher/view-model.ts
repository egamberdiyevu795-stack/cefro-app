/**
 * The Teacher view's screens (docs/teacher-plan.md, section 2), from what a teacher may read: each student's shown
 * name and their SHARED attempts only (made after they tapped Share; the server never passes anything else). Pure and
 * browser-safe; the same functions serve the demo teacher (mock mode) and real classes.
 */
import { FEATURE_LABELS, LEVEL_LABELS, type FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { LEVEL_WINDOW, overallLevel, scoredAttempts, skillLevels, type ScoredAttempt, type SkillLevels } from "@/features/dashboard/progress";
import { formatDate, toHistoryRows, type HistoryRow } from "@/features/history/view-model";
import { lessonForResult } from "@/features/lessons/choose";
import { GOAL_LABEL, compareWithPrevious, type BandLabel } from "@/features/result/view-model";

/** One student as their teacher sees them: the name they chose for this class and their shared attempts, newest first. */
export interface SharedStudent {
  memberId: string;
  shownName: string;
  sharedAt: string;
  /** Shared attempts only (created after `sharedAt`), newest first. A retry of an earlier attempt has no previous. */
  attempts: HistoryAttempt[];
}

/* ---------------------------------------------------------------------------------------------- level and skills */

/** The level from shared attempts only: the dashboard's rule (middle of the last 3 scored answers per skill). */
export function studentSkills(attempts: readonly HistoryAttempt[]): SkillLevels | null {
  const scored = scoredAttempts(attempts);
  return scored.length ? skillLevels(scored.slice(0, LEVEL_WINDOW).map((a) => a.result)) : null;
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

export function fixKeyOf(result: MultilevelResult): FixKey {
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
  const groups = new Map<string, { label: string; results: MultilevelResult[] }>();
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
      const lesson = lessonForResult(g.results[0]);
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
}

export function retryGoalOf(attempts: readonly HistoryAttempt[]): StudentRow["retryGoal"] {
  const latest = latestScored(attempts);
  const previous = latest?.previousAttemptId ? attempts.find((a) => a.id === latest.previousAttemptId) : undefined;
  if (!latest || !previous?.result) return "—";
  const goal = compareWithPrevious(previous.result, latest.result).goal;
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
  rows: HistoryRow[];
  latestId: string | null;
}

export function studentDetail(student: SharedStudent): StudentDetail {
  const skills = studentSkills(student.attempts);
  return {
    name: student.shownName,
    level: levelText(skills ? overallLevel(skills) : null),
    skills: skills
      ? (Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map((f) => ({ name: FEATURE_LABELS[f], level: skills[f] ? LEVEL_LABELS[skills[f]!] : "Not assessed" }))
      : [],
    rows: toHistoryRows(student.attempts),
    latestId: student.attempts[0]?.id ?? null,
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
