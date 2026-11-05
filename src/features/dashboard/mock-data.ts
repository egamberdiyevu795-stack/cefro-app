/**
 * Mocked dashboard content for the design prototype. Nothing here is read from the database or produced by a model.
 * Feature and level names come from the evaluator's own vocabulary so the labels match the real feedback screens.
 */
import { FEATURE_LABELS, FEATURE_LEVELS, LEVEL_LABELS, type Feature, type FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import type { NavItem, Status } from "@/components/ds";

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/", label: "Practice", icon: "mic" },
  { href: "/dashboard#lessons", label: "Lessons", icon: "book" },
  { href: "/dashboard#tests", label: "Tests", icon: "tests" },
  { href: "/dashboard#profile", label: "Profile", icon: "user" },
  { href: "/dashboard#settings", label: "Settings", icon: "settings" },
];

export const PROGRESS = {
  band: "Band 3",
  target: "B2",
  changeLabel: "+1 band",
  changeDescription: "Up one band since last month",
  stats: [
    { label: "Attempts this month", value: "14" },
    { label: "Average band", value: "2.8" },
    { label: "Practice time", value: "3 h 20 min" },
  ],
  goal: { value: 0.75, text: "1 band to your target" },
};

/** Radar order as the dashboard shows it (clockwise from the top). */
const RADAR_ORDER: readonly Feature[] = ["grammar", "vocabulary", "fluency", "cohesion", "pronunciation"];
const SKILL_LEVELS: Record<Feature, FeatureLevel> = {
  grammar: "B1",
  vocabulary: "B2",
  fluency: "B2",
  cohesion: "B1",
  pronunciation: "above_B2",
};

export const RADAR_RINGS = FEATURE_LEVELS.map((level) => LEVEL_LABELS[level]);
export const RADAR_AXES = RADAR_ORDER.map((feature) => ({
  label: FEATURE_LABELS[feature],
  value: FEATURE_LEVELS.indexOf(SKILL_LEVELS[feature]),
}));

export const EXAM_PARTS: ReadonlyArray<{ part: string; name: string; band: string; tone: 1 | 2 | 3 | 4 }> = [
  { part: "Part 1.1", name: "Personal questions", band: "Band 3", tone: 2 },
  { part: "Part 1.2", name: "Compare pictures", band: "Band 2", tone: 3 },
  { part: "Part 2", name: "Long turn", band: "Band 3", tone: 1 },
  { part: "Part 3", name: "Argument", band: "Not tried", tone: 4 },
];

export const RECENT_ATTEMPTS: ReadonlyArray<{ task: string; status: Status; band: string; time: string; date: string; tone: 1 | 2 | 3 | 4 }> = [
  { task: "Advice from someone", status: "passed", band: "Band 3", time: "1 min 48 s", date: "04.11.26", tone: 1 },
  { task: "Compare two pictures", status: "pending", band: "—", time: "52 s", date: "03.11.26", tone: 3 },
  { task: "Your hometown", status: "failed", band: "Band 2", time: "41 s", date: "01.11.26", tone: 2 },
  { task: "Working from home", status: "passed", band: "Band 3", time: "2 min 05 s", date: "29.10.26", tone: 4 },
];

export const BIGGEST_FIX = {
  feature: "Grammar",
  task: "Advice from someone",
  quote: "If I would have more time, I will practise speaking every day.",
  fix: "If I had more time, I would practise speaking every day.",
  note: "Second conditional: past simple after “if”, “would” in the result.",
  fixedIn: 1,
  seenIn: 4,
  retryHref: "/practice/speaking/b2-part2-advice-from-someone",
};
