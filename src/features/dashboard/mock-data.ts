/**
 * Mocked dashboard content for the design prototype. Nothing here is read from the database or produced by a model.
 *
 * Levels vs bands:
 * - The top of the dashboard shows an overall CEFR LEVEL ("B1 · target B2"). It never shows a band.
 * - Bands (0–5) are per exam part, and each part has its own band table, so they appear only in the Exam parts tiles.
 *
 * The numbers are consistent with the scorer: `mock-data.test.ts` runs the real Part 2 band scoring over SKILL_LEVELS
 * and checks it gives the Part 2 tile's band, label and biggest fix.
 */
import type { BandScoringInput } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES, FEATURE_LABELS, FEATURE_LEVELS, LEVEL_LABELS, levelValue, type Feature } from "@/domain/evaluation/multilevel/levels";
import type { NavItem, RadarAxis } from "@/components/ds";
import type { FeatureFlag, FeatureFlags } from "@/config/features";

/**
 * Prototype toggle: which state the dashboard shows. "first-visit" = no attempts yet (no level, no chart, no list).
 * `/dashboard?state=first-visit` or `?state=returning` overrides it for one page view.
 */
export type DashboardState = "returning" | "first-visit";
export const DASHBOARD_STATE: DashboardState = "returning";

/** Navigation. Items with a `flag` are future features: shown as "Coming soon" when the flag is on, hidden when off. */
export const NAV_ITEMS: ReadonlyArray<NavItem & { flag?: FeatureFlag }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/", label: "Practice", icon: "mic" },
  { href: "/lessons", label: "Lessons", icon: "book", flag: "lessons" },
  { href: "/history", label: "History", icon: "clock", flag: "history" },
  { href: "/settings", label: "Settings", icon: "settings", flag: "settings" },
];

export function navItemsFor(flags: FeatureFlags): NavItem[] {
  return NAV_ITEMS.flatMap(({ flag, ...item }) => (flag === undefined ? [item] : flags[flag] ? [{ ...item, soon: true }] : []));
}

/**
 * The recommended next task: Part 2 is the biggest step towards B2. Part 2 is 1 min preparation + 2 min speaking.
 * Only one Part 2 task exists so far, and the Biggest fix card already retries it, so this one is a mocked new task
 * with its own mock route (src/app/dashboard/task/[taskId]).
 */
export const PRACTISE_NEXT = {
  id: "a-skill-you-learned",
  task: "A skill you learned",
  part: "Part 2",
  preparationMinutes: 1,
  speakingMinutes: 2,
  minutes: 3,
  reason: "Biggest step towards B2",
  href: "/dashboard/task/a-skill-you-learned",
};

/** Mocked signed-in account for the nav's Account menu. Log out is real (the app's sign-out endpoint). */
export const ACCOUNT = { name: "Student", email: "student@example.com" };

/** Exam date (future feature, flag `examCountdown`). Today in the mock is 05.11.26. */
export const EXAM_COUNTDOWN = { days: 23, date: "28.11.26" };

/** First visit: what the welcome card says. "Start your first practice" goes to the recommended part (Part 2). */
export const FIRST_VISIT = {
  welcome: "Welcome to CEFRO",
  title: "Find your level",
  text: "Answer one short speaking task. You will see your level for each skill and the one thing to fix first.",
  minutes: 3,
  href: "/practice/speaking/b2-part2-advice-from-someone",
};

/**
 * Skill levels from the latest scored Part 2 attempt. Pronunciation is "not_assessed" (the audio check did not run), so
 * the best fit is the mean of the other four: (1 + 2 + 2 + 1) / 4 = 1.5, an exact .5 rounds down → B1.
 */
export const SKILL_LEVELS: BandScoringInput["features"] = {
  grammar: "B1",
  vocabulary: "B2",
  fluency: "B2",
  cohesion: "B1",
  pronunciation: "not_assessed",
};

/** Skills at or above the target (B2), out of the skills that were assessed. Not-assessed skills are not counted. */
const assessedSkills = FEATURES.flatMap((f) => (SKILL_LEVELS[f] === "not_assessed" ? [] : [SKILL_LEVELS[f]]));
const skillsAtTarget = assessedSkills.filter((level) => levelValue(level) >= levelValue("B2")).length;

export const PROGRESS = {
  level: "B1",
  target: "B2",
  changeLabel: "Up from A2",
  changeDescription: "Your level went up from A2 since last month",
  stats: [
    { label: "Attempts this month", value: "14" },
    { label: "Parts practised", value: "3 of 4" },
    { label: "Practice time", value: "3 h 20 min" },
  ],
  goal: {
    atTarget: skillsAtTarget,
    assessed: assessedSkills.length,
    label: `${skillsAtTarget} of ${assessedSkills.length} skills at B2`,
  },
};

/** Radar order as the dashboard shows it (clockwise from the top). */
const RADAR_ORDER: readonly Feature[] = ["grammar", "vocabulary", "fluency", "cohesion", "pronunciation"];
const SHORT_LABELS: Record<Feature, string> = { grammar: "Gram", vocabulary: "Vocab", fluency: "Flu", cohesion: "Coh", pronunciation: "Pron" };

export const RADAR_RINGS = FEATURE_LEVELS.map((level) => LEVEL_LABELS[level]);
export const RADAR_AXES: readonly RadarAxis[] = RADAR_ORDER.map((feature) => {
  const level = SKILL_LEVELS[feature];
  return {
    label: FEATURE_LABELS[feature],
    short: SHORT_LABELS[feature],
    value: level === "not_assessed" ? null : FEATURE_LEVELS.indexOf(level),
  };
});

/**
 * Latest band per part, labelled from that part's own band table:
 * - Part 1.1 (Q1–3, target A2) and Part 1.2 (Q4–6, target B1): tables in docs/part1-plan.md (branch claude/part1-plan).
 * - Part 2 (Q7, target B2): src/server/evaluation/rubrics/multilevel_q7.json (checked by mock-data.test.ts).
 * - Part 3: no band table exists yet, so no band is shown.
 */
export type ExamPart = {
  part: string;
  name: string;
  band: number | null;
  bandLabel: string | null;
  href: string;
  /** Set on the one recommended part (first visit): shown on the tile with a "Recommended" label. */
  recommendation?: string;
};

export const EXAM_PARTS: readonly ExamPart[] = [
  { part: "Part 1.1", name: "Personal questions", band: 5, bandLabel: "Above A2", href: "/" },
  { part: "Part 1.2", name: "Compare pictures", band: 4, bandLabel: "Higher B1", href: "/" },
  { part: "Part 2", name: "Long turn", band: 2, bandLabel: "Higher B1", href: "/practice/speaking/b2-part2-advice-from-someone" },
  { part: "Part 3", name: "Argument", band: null, bandLabel: null, href: "/" },
];

/**
 * First visit: the same parts, none tried yet. Part 2 is recommended: one answer covers all five skills against the
 * B2 descriptors, so it shows the level fastest. "Start your first practice" (the black action) goes to it.
 */
export const EXAM_PARTS_FIRST_VISIT: readonly ExamPart[] = EXAM_PARTS.map((p) => ({
  ...p,
  band: null,
  bandLabel: null,
  ...(p.part === "Part 2" ? { recommendation: "Start with Part 2 · shows your level fastest" } : {}),
}));

/** Future actions in each attempt's row menu (flag `attemptMenu`). */
export const ATTEMPT_MENU_ITEMS = ["Delete", "Report a wrong score"] as const;

/**
 * Each attempt shows its CEFR level as the main value (never a band, never Passed/Failed).
 * `level: null` = still being scored ("Scoring…").
 */
export const RECENT_ATTEMPTS: ReadonlyArray<{ task: string; part: string; level: string | null; time: string; date: string; tone: 1 | 2 | 3 | 4 }> = [
  { task: "Advice from someone", part: "Part 2", level: "B1", time: "1 min 48 s", date: "04.11.26", tone: 1 },
  { task: "Holidays: two pictures", part: "Part 1.2", level: null, time: "1 min 45 s", date: "03.11.26", tone: 3 },
  { task: "Your hometown", part: "Part 1.1", level: "Above A2", time: "1 min 30 s", date: "01.11.26", tone: 2 },
  { task: "Free time", part: "Part 1.2", level: "B1", time: "1 min 40 s", date: "29.10.26", tone: 4 },
];

export const BIGGEST_FIX = {
  feature: "Grammar",
  task: "Advice from someone",
  quote: "If I would have more time, I will practise speaking every day.",
  fix: "If I had more time, I would practise speaking every day.",
  /** The mistake is still in this many of the last `lastAnswers` answers. */
  stillIn: 3,
  lastAnswers: 4,
  retryHref: "/practice/speaking/b2-part2-advice-from-someone",
};
