/**
 * The dashboard's numbers, from the student's own attempts (`HistoryAttempt`, newest first, as `listAttemptHistory`
 * returns them). Pure and browser-safe: no database, no clock (the caller passes `now`), no model call.
 *
 * "Scored" means a completed Multilevel result that is a real rating: not "too short to rate" (band 0 that is not a
 * level, as on the result page), not an old-method result, not one still being scored.
 */
import { bestFitLevel } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES, FEATURE_LABELS, FEATURE_LEVELS, LEVEL_LABELS, ladderOf, levelValue, type Feature, type FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { featureLevels } from "@/domain/evaluation/multilevel/result";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { Q8_LEVELS } from "@/domain/evaluation/q8/levels";
import type { ArgumentPoint } from "@/domain/speaking/argument-task";
import { EXAM_PART_IDS, examPartLabel, examPartListHref, examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import type { BandedResult, HistoryAttempt } from "@/domain/speaking/history";
import type { RadarAxis } from "@/components/ds/RadarChart";
import { PART_LIVE } from "@/config/features";
import { formatDate } from "@/features/history/view-model";
import { part3BiggestFix } from "@/features/part3/view-model";
import { biggestFix, goalOutcomeOf, type BiggestFixView } from "@/features/result/view-model";

/** How many recent scored answers the level and skills are based on. */
export const LEVEL_WINDOW = 3;
/** How many recent scored answers "Still in X of your last N answers" looks at. */
export const STILL_IN_WINDOW = 4;

export type ScoredAttempt = HistoryAttempt & { result: BandedResult };

/** The student's scored attempts, newest first. */
export function scoredAttempts(attempts: readonly HistoryAttempt[]): ScoredAttempt[] {
  return attempts.filter(
    (a): a is ScoredAttempt => a.status === "completed" && a.result !== null && a.result.scoring.zero_reason !== "too_short",
  );
}

/* ── Level and skills ────────────────────────────────────────────────────────────────────────────────────────── */

export type SkillLevels = Record<Feature, FeatureLevel | null>;

/**
 * The middle value of some levels: the middle one of an odd count; of an even count, the mean of the two middle
 * ones rounded as the scorer rounds (an exact .5 goes down). Null when there are none.
 */
export function middleLevel(levels: readonly FeatureLevel[]): FeatureLevel | null {
  if (levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => levelValue(a) - levelValue(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : bestFitLevel([sorted[mid - 1], sorted[mid]]).level;
}

/**
 * Per skill, the middle value of the answers that assessed it (pronunciation is often not assessed: those are
 * skipped). Only answers on Part 2's scale (below B1 … above B2) count: the dashboard's level is a B2-target level,
 * and a Part 1 level (A1, A2 …) or a Part 3 level (C1 ladder) is on another ladder.
 */
export function skillLevels(results: readonly BandedResult[]): SkillLevels {
  const onScale = results
    .filter((r): r is MultilevelResult => r.kind === "multilevel")
    .filter((r) => ladderOf(Object.values(featureLevels(r.assessment))) === FEATURE_LEVELS);
  return Object.fromEntries(
    FEATURES.map((feature) => {
      const assessed = onScale.flatMap((r) => {
        const level = r.assessment.features[feature]?.level;
        return level === undefined || level === "not_assessed" ? [] : [level as FeatureLevel];
      });
      return [feature, middleLevel(assessed)];
    }),
  ) as SkillLevels;
}

/** The overall level from skill levels, exactly as the scorer computes an answer's language level (mean, .5 down). */
export function overallLevel(skills: SkillLevels): FeatureLevel | null {
  const assessed = FEATURES.flatMap((f) => (skills[f] ? [skills[f]!] : []));
  return assessed.length ? bestFitLevel(assessed).level : null;
}

export interface Progress {
  level: FeatureLevel;
  levelLabel: string;
  targetLabel: string;
  /** "Based on your last 3 answers" / "your last 2 answers" / "your last answer". */
  basis: string;
  skills: SkillLevels;
  /** Skills at or above the target, out of the assessed ones (a skill not assessed is not counted). */
  goal: { atTarget: number; assessed: number; label: string };
  /** The level of the 3 scored answers before those, when it is lower ("Up from B1"); null otherwise or with fewer than 3. */
  upFrom: string | null;
  stats: Array<{ label: string; value: string }>;
}

/** Null when nothing is scored yet (the dashboard then shows the first visit). */
export function progress(attempts: readonly HistoryAttempt[], options: { target: FeatureLevel; now: Date }): Progress | null {
  const scored = scoredAttempts(attempts);
  const recent = scored.slice(0, LEVEL_WINDOW);
  const skills = skillLevels(recent.map((a) => a.result));
  const level = overallLevel(skills);
  if (!level) return null;

  const assessed = FEATURES.flatMap((f) => (skills[f] ? [skills[f]!] : []));
  const atTarget = assessed.filter((l) => levelValue(l) >= levelValue(options.target)).length;

  const earlier = scored.slice(LEVEL_WINDOW, LEVEL_WINDOW * 2);
  const earlierLevel = earlier.length === LEVEL_WINDOW ? overallLevel(skillLevels(earlier.map((a) => a.result))) : null;
  const upFrom = earlierLevel && levelValue(level) > levelValue(earlierLevel) ? LEVEL_LABELS[earlierLevel] : null;

  const n = recent.length;
  return {
    level,
    levelLabel: LEVEL_LABELS[level],
    targetLabel: LEVEL_LABELS[options.target],
    basis: n === 1 ? "Based on your last answer" : `Based on your last ${n} answers`,
    skills,
    goal: { atTarget, assessed: assessed.length, label: `${atTarget} of ${assessed.length} skills at ${LEVEL_LABELS[options.target]}` },
    upFrom,
    stats: practiceStats(attempts, options.now),
  };
}

/** Attempts this month, parts practised, practice time this month (recorded speaking time). Months are Uzbekistan's. */
export function practiceStats(attempts: readonly HistoryAttempt[], now: Date): Array<{ label: string; value: string }> {
  const month = formatDate(now.toISOString()).slice(3); // "mm.yy"
  const thisMonth = attempts.filter((a) => formatDate(a.createdAt).slice(3) === month);
  const parts = new Set(attempts.flatMap((a) => (a.part ? [a.part] : [])));
  const minutes = Math.round(thisMonth.reduce((total, a) => total + a.recordingDurationMs, 0) / 60_000);
  return [
    { label: "Attempts this month", value: String(thisMonth.length) },
    { label: "Parts practised", value: `${parts.size} of ${EXAM_PART_IDS.length}` },
    { label: "Practice time this month", value: formatMinutes(minutes) },
  ];
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Radar order as the dashboard shows it (clockwise from the top), and the short names for narrow charts. */
const RADAR_ORDER: readonly Feature[] = ["grammar", "vocabulary", "fluency", "cohesion", "pronunciation"];
const SHORT_LABELS: Record<Feature, string> = { grammar: "Gram", vocabulary: "Vocab", fluency: "Flu", cohesion: "Coh", pronunciation: "Pron" };
export const RADAR_RINGS = FEATURE_LEVELS.map((level) => LEVEL_LABELS[level]);

export function radarAxes(skills: SkillLevels): RadarAxis[] {
  return RADAR_ORDER.map((feature) => ({
    label: FEATURE_LABELS[feature],
    short: SHORT_LABELS[feature],
    value: skills[feature] === null ? null : levelValue(skills[feature]!),
  }));
}

/* ── Biggest fix ─────────────────────────────────────────────────────────────────────────────────────────────── */

export interface DashboardFix {
  fix: BiggestFixView;
  taskTitle: string;
  /** Opens a retry of the latest scored attempt, with its goal. */
  retryHref: string;
  /** How many of the last answers still have the same problem; null with only one answer (nothing to compare). */
  stillIn: { count: number; of: number } | null;
}

/**
 * The latest scored attempt's biggest fix (the same card content as its result page), and in how many of the last 4
 * scored answers the same problem shows (only when the latest answer itself still has it): the same skill below the
 * target level; the same question of the same task
 * not answered on topic; or (own words) an answer that was memorised or off the questions.
 */
export function dashboardFix(
  attempts: readonly HistoryAttempt[],
  context: {
    prompts: (taskId: string) => readonly string[];
    transcript: string;
    target: FeatureLevel;
    /** Part 3: a task's FOR / AGAINST points, for a Part 3 biggest fix. Without it a Part 3 latest answer has no card. */
    argumentPoints?: (taskId: string) => readonly ArgumentPoint[] | undefined;
  },
): DashboardFix | null {
  const scored = scoredAttempts(attempts);
  const latest = scored[0];
  if (!latest) return null;
  const window = scored.slice(0, STILL_IN_WINDOW);

  // Part 3 latest answer: its own fix card and retry link. "Still in" is only defined for a language feature
  // (coverage and dependence are judged per topic): the same Part 3 feature below C1 in the window's Part 3 answers.
  if (latest.result.kind === "multilevel_q8") {
    const points = context.argumentPoints?.(latest.taskId);
    if (!points) return null;
    const fix = latest.result.scoring.biggest_fix;
    const hasProblem = (a: ScoredAttempt): boolean => {
      if (fix.kind !== "feature" || a.result.kind !== "multilevel_q8") return false;
      const level = a.result.assessment.features[fix.feature]?.level;
      return level !== undefined && level !== "not_assessed" && Q8_LEVELS.indexOf(level) < Q8_LEVELS.indexOf("C1");
    };
    const count = window.filter(hasProblem).length;
    const view = part3BiggestFix(latest.result, { points }, context.transcript);
    return {
      fix: { ...view, quoteKind: view.quoteKind === "student" ? "student" : "question" },
      taskTitle: latest.title,
      retryHref: `/practice/part3/${latest.taskId}?retry=${latest.id}`,
      stillIn: fix.kind === "feature" && window.length > 1 && hasProblem(latest) ? { count, of: window.length } : null,
    };
  }

  const latestResult = latest.result;
  const fix = latestResult.scoring.biggest_fix;

  const hasProblem = (a: ScoredAttempt): boolean => {
    const r = a.result;
    if (r.kind !== "multilevel") return false;
    if (fix.kind === "feature") {
      // Levels compare only on one scale: a Part 1 answer and a Part 2 answer never share "the same problem".
      if (r.rubric_id !== latestResult.rubric_id) return false;
      const ladder = ladderOf(Object.values(featureLevels(latestResult.assessment)));
      const target = ladder === FEATURE_LEVELS ? context.target : ladder[2];
      const level = r.assessment.features[fix.feature]?.level;
      return level !== undefined && level !== "not_assessed" && levelValue(level as FeatureLevel, ladder) < levelValue(target, ladder);
    }
    if (fix.kind === "question_coverage") {
      if (a.taskId !== latest.taskId) return false;
      const status = r.assessment.questions.find((q) => q.id === fix.question_id)?.status;
      return status !== "on_topic";
    }
    return r.assessment.memorized_or_irrelevant || r.scoring.on_topic_count === 0;
  };
  const count = window.filter(hasProblem).length;

  return {
    fix: biggestFix(latestResult, context.prompts(latest.taskId), context.transcript),
    taskTitle: latest.title,
    retryHref: `/practice/speaking/${latest.taskId}?retry=${latest.id}`,
    // Shown only when the latest answer still has the problem (else "still" would be untrue), and there is history.
    stillIn: window.length > 1 && hasProblem(latest) ? { count, of: window.length } : null,
  };
}

/* ── Practise next ───────────────────────────────────────────────────────────────────────────────────────────── */

export interface TaskInfo {
  id: string;
  title: string;
  part: number;
  level: string;
  preparationSeconds: number;
  speakingSeconds: number;
}

export interface PractiseNext {
  /** The task to practise (the task list tags its row "Try next"). */
  taskId: string;
  title: string;
  partLabel: string;
  minutes: number;
  /** Why this one: "Your goal isn't met yet", "Finish your goal", "Not practised yet", "Last practised 04.11.26". */
  reason: string;
  /** A retry: its goal, shown on the card. */
  goal: string | null;
  href: string;
}

/**
 * What to practise next.
 * 1. An unfinished goal: the latest attempt is a retry that was not scored (it failed, or was too short) → that
 *    retry again, with the same goal.
 * 2. The latest scored attempt is a retry whose goal is "Not yet" → that retry again, with the same goal.
 * 3. Otherwise the task practised least recently (a task never practised first; ties in the task list's order).
 */
export function practiseNext(attempts: readonly HistoryAttempt[], tasks: readonly TaskInfo[]): PractiseNext | null {
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const latest = attempts[0];
  const retryOf = (retry: HistoryAttempt, reason: string): PractiseNext | null => {
    const original = retry.previousAttemptId ? byId.get(retry.previousAttemptId) : undefined;
    const task = tasks.find((t) => t.id === retry.taskId);
    const goal = original?.result?.retry_focus[0]?.objective;
    if (!original || !task || !goal) return null;
    return { ...describe(task), reason, goal, href: `/practice/speaking/${task.id}?retry=${original.id}` };
  };

  if (latest?.previousAttemptId && !isInProgress(latest) && !scoredAttempts([latest]).length) {
    const next = retryOf(latest, "Finish your goal");
    if (next) return next;
  }
  const latestScored = scoredAttempts(attempts)[0];
  if (latestScored?.previousAttemptId) {
    const original = byId.get(latestScored.previousAttemptId);
    const goal = original?.result ? goalOutcomeOf(original.result, latestScored.result) : null;
    if (goal === "partly" || goal === "not_met") {
      const next = retryOf(latestScored, "Your goal isn't met yet");
      if (next) return next;
    }
  }

  const lastPractised = (taskId: string) => attempts.find((a) => a.taskId === taskId)?.createdAt ?? null;
  const ranked = tasks
    .map((task, order) => ({ task, order, last: lastPractised(task.id) }))
    .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? "") || a.order - b.order);
  const pick = ranked[0];
  if (!pick) return null;
  return {
    ...describe(pick.task),
    reason: pick.last ? `Last practised ${formatDate(pick.last)}` : "Not practised yet",
    goal: null,
    href: `/practice/speaking/${pick.task.id}`,
  };
}

function isInProgress(a: HistoryAttempt): boolean {
  return a.status !== "completed" && a.status !== "failed" && !a.isStalled;
}

function describe(task: TaskInfo) {
  const part = examPartOf(task);
  return {
    taskId: task.id,
    title: task.title,
    partLabel: part ? examPartLabel(part) : `Part ${task.part}`,
    minutes: Math.round((task.preparationSeconds + task.speakingSeconds) / 60),
  };
}

/* ── Exam parts ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const PART_NAMES: Record<ExamPartId, string> = {
  "1.1": "Personal questions",
  "1.2": "Compare pictures",
  "2": "Long turn",
  "3": "Argument",
};

export interface PartTile {
  part: ExamPartId;
  partLabel: string;
  name: string;
  /** The latest scored band of this part; null when none is scored yet ("Start"). */
  band: number | null;
  bandLabel: string | null;
  /** That part's tasks on the task list; null when the part is not live yet (the tile says "Coming soon"). */
  href: string | null;
}

/**
 * One tile per exam part, always all four: its latest scored band, and, when the part is live (`PART_LIVE`), a link
 * to its tasks on the task list (`/practice#part-2`), where the student picks one. Not live: no link (`href: null`).
 */
export function partTiles(
  attempts: readonly HistoryAttempt[],
  live: Readonly<Record<ExamPartId, boolean>> = PART_LIVE,
): PartTile[] {
  const scored = scoredAttempts(attempts);
  return EXAM_PART_IDS.map((part) => {
    const latest = scored.find((a) => a.part === part);
    return {
      part,
      partLabel: examPartLabel(part),
      name: PART_NAMES[part],
      band: latest ? latest.result.scoring.band : null,
      bandLabel: latest ? latest.result.scoring.label : null,
      href: live[part] ? examPartListHref(part) : null,
    };
  });
}

/* ── Which dashboard ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * - "returning": at least one scored answer (level, skills, biggest fix, Practise next).
 * - "not_scored_yet": attempts, none scored (still scoring, failed, too short): no level yet, but Recent attempts and
 *   "Start practice" (never the first visit's "Start your first practice").
 * - "first_visit": no attempts at all.
 */
export type DashboardView = "returning" | "not_scored_yet" | "first_visit";

export function dashboardView(attempts: readonly HistoryAttempt[]): DashboardView {
  if (scoredAttempts(attempts).length > 0) return "returning";
  return attempts.length > 0 ? "not_scored_yet" : "first_visit";
}
