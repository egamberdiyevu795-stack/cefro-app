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
import { FEATURE_LABELS, FEATURE_LEVELS, LEVEL_LABELS, type Feature } from "@/domain/evaluation/multilevel/levels";
import type { NavItem, RadarAxis, Status } from "@/components/ds";

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/", label: "Practice", icon: "mic" },
  { href: "/dashboard#lessons", label: "Lessons", icon: "book" },
  { href: "/dashboard#tests", label: "Tests", icon: "tests" },
  { href: "/dashboard#profile", label: "Profile", icon: "user" },
  { href: "/dashboard#settings", label: "Settings", icon: "settings" },
];

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

export const PROGRESS = {
  level: "B1",
  target: "B2",
  next: "B2",
  changeLabel: "Up from A2",
  changeDescription: "Your level went up from A2 since last month",
  stats: [
    { label: "Attempts this month", value: "14" },
    { label: "Parts practised", value: "3 of 4" },
    { label: "Practice time", value: "3 h 20 min" },
  ],
  /** Mean skill value 1.5 of the 2 needed for B2. */
  goal: { value: 0.75 },
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
export const EXAM_PARTS: ReadonlyArray<{
  part: string;
  name: string;
  band: number | null;
  bandLabel: string | null;
  tone: 1 | 2 | 3 | 4;
}> = [
  { part: "Part 1.1", name: "Personal questions", band: 5, bandLabel: "Above A2", tone: 2 },
  { part: "Part 1.2", name: "Compare pictures", band: 4, bandLabel: "Higher B1", tone: 3 },
  { part: "Part 2", name: "Long turn", band: 2, bandLabel: "Higher B1", tone: 1 },
  { part: "Part 3", name: "Argument", band: null, bandLabel: null, tone: 4 },
];

/**
 * Status: Passed = reached the part's target band, Failed = below it, Pending = still being scored.
 * The list shows the CEFR level of each attempt, never a band.
 */
export const RECENT_ATTEMPTS: ReadonlyArray<{ task: string; part: string; status: Status; level: string; time: string; date: string; tone: 1 | 2 | 3 | 4 }> = [
  { task: "Advice from someone", part: "Part 2", status: "failed", level: "B1", time: "1 min 48 s", date: "04.11.26", tone: 1 },
  { task: "Holidays: two pictures", part: "Part 1.2", status: "pending", level: "—", time: "1 min 45 s", date: "03.11.26", tone: 3 },
  { task: "Your hometown", part: "Part 1.1", status: "passed", level: "Above A2", time: "1 min 30 s", date: "01.11.26", tone: 2 },
  { task: "Free time", part: "Part 1.2", status: "passed", level: "B1", time: "1 min 40 s", date: "29.10.26", tone: 4 },
];

export const BIGGEST_FIX = {
  feature: "Grammar",
  task: "Advice from someone",
  quote: "If I would have more time, I will practise speaking every day.",
  fix: "If I had more time, I would practise speaking every day.",
  fixedIn: 1,
  seenIn: 4,
  retryHref: "/practice/speaking/b2-part2-advice-from-someone",
};
