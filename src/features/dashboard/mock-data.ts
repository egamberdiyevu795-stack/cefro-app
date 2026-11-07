/**
 * The dashboard's fixed content: navigation, the first visit's wording, the row menu's future actions, and the
 * mocked account the design prototypes show. Everything about the student (level, skills, bands, biggest fix,
 * practise next, attempts, exam date) is real now: see progress.ts.
 */
import type { NavItem } from "@/components/ds";
import type { FeatureFlag, FeatureFlags } from "@/config/features";
import { mockLink } from "@/features/demo/demo-mode";

/**
 * Navigation. Items with a `flag` are shown only when the flag is on: as "Coming soon" while the feature is not built,
 * as a real link once it is (`built: true`, e.g. History).
 */
export const NAV_ITEMS: ReadonlyArray<NavItem & { flag?: FeatureFlag; built?: boolean }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/", label: "Practice", icon: "mic" },
  { href: "/lessons", label: "Lessons", icon: "book", flag: "lessons" },
  { href: "/history", label: "History", icon: "clock", flag: "history", built: true },
  { href: "/settings", label: "Settings", icon: "settings", flag: "settings", built: true },
];

export function navItemsFor(flags: FeatureFlags, mock = false): NavItem[] {
  return NAV_ITEMS.flatMap(({ flag, built, ...item }) => {
    // Mock mode: the real links keep ?mock=1 ("Coming soon" items link nowhere).
    const shown = { ...item, href: mockLink(item.href, mock && (flag === undefined || Boolean(built))) };
    return flag === undefined ? [shown] : flags[flag] ? [built ? shown : { ...shown, soon: true }] : [];
  });
}

/** The demo account of the Account menu, Profile and Settings in mock mode (no Log out: mock mode calls no API). */
export const ACCOUNT = { name: "Student", email: "student@example.com" };

/** First visit: what the welcome card says. "Start your first practice" goes to the recommended part (Part 2). */
export const FIRST_VISIT = {
  welcome: "Welcome to CEFRO",
  title: "Find your level",
  text: "Answer one short speaking task. You will see your level for each skill and the one thing to fix first.",
  minutes: 3,
  href: "/practice/speaking/b2-part2-advice-from-someone",
};

/** The same card for a student who has attempts but none scored yet (still scoring, failed, too short). */
export const NOT_SCORED_YET = {
  welcome: "Welcome back",
  title: "Find your level",
  text: "Your level and skills appear here once an answer is scored. Your attempts so far are in Recent attempts.",
};

/** Future actions in each attempt's row menu (flag `attemptMenu`). */
export const ATTEMPT_MENU_ITEMS = ["Delete", "Report a wrong score"] as const;
