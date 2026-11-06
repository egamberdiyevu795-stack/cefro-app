/**
 * The dashboard's fixed content: navigation, the first visit's wording, the row menu's future actions, and the
 * mocked account the design prototypes show. Everything about the student (level, skills, bands, biggest fix,
 * practise next, attempts, exam date) is real now: see progress.ts.
 */
import type { NavItem } from "@/components/ds";
import type { FeatureFlag, FeatureFlags } from "@/config/features";

/**
 * Navigation. Items with a `flag` are shown only when the flag is on: as "Coming soon" while the feature is not built,
 * as a real link once it is (`built: true`, e.g. History).
 */
export const NAV_ITEMS: ReadonlyArray<NavItem & { flag?: FeatureFlag; built?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/", label: "Practice", icon: "mic" },
  { href: "/lessons", label: "Lessons", icon: "book", flag: "lessons" },
  { href: "/history", label: "History", icon: "clock", flag: "history", built: true },
  { href: "/settings", label: "Settings", icon: "settings", flag: "settings" },
];

export function navItemsFor(flags: FeatureFlags): NavItem[] {
  return NAV_ITEMS.flatMap(({ flag, built, ...item }) =>
    flag === undefined ? [item] : flags[flag] ? [built ? item : { ...item, soon: true }] : [],
  );
}

/** Mocked signed-in account for the nav's Account menu. Log out is real (the app's sign-out endpoint). */
export const ACCOUNT = { name: "Student", email: "student@example.com" };

/** First visit: what the welcome card says. "Start your first practice" goes to the recommended part (Part 2). */
export const FIRST_VISIT = {
  welcome: "Welcome to CEFRO",
  title: "Find your level",
  text: "Answer one short speaking task. You will see your level for each skill and the one thing to fix first.",
  minutes: 3,
  href: "/practice/speaking/b2-part2-advice-from-someone",
};

/** Future actions in each attempt's row menu (flag `attemptMenu`). */
export const ATTEMPT_MENU_ITEMS = ["Delete", "Report a wrong score"] as const;
