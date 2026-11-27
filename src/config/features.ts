import type { ExamPartId } from "@/domain/speaking/exam-part";

/**
 * Feature flags for built features that can be switched off. On: shown. Off: not rendered at all.
 *
 * No page shows a control that does nothing: the designed-but-unbuilt "Coming soon" controls (Search, Mock exam,
 * notifications, "Last 30 days", the attempt row menu, "Play recording" without audio) were removed before launch.
 * The only honest "Coming soon" left is an exam part that is not live (`PART_LIVE`, below), shown as text, not a control.
 */
export const FEATURE_FLAGS = {
  /** History: the real page (`/history`) and its links (sidebar, "See all"). Off: no link, and the page is a 404. */
  history: true,
  /** "Your exam: in N days" card. */
  examCountdown: true,
} as const satisfies Record<string, boolean>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export type FeatureFlags = Record<FeatureFlag, boolean>;

/** Every flag set to `on`. Used by the prototype's `?flags=off` switch to preview the page without future elements. */
export function allFlags(on: boolean): FeatureFlags {
  return Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, on])) as FeatureFlags;
}

/**
 * One switch per exam part: is it live? On: its dashboard tile says "Start" ("Practise" once tried) and links to the
 * part's tasks on the task list. Off: the tile says "Coming soon", with no link. The tile is always shown.
 * Turn a part on only once it has tasks (checked by progress.test.ts). These are release switches, not preview flags,
 * so `?flags=off` does not change them.
 */
export const PART_LIVE: Record<ExamPartId, boolean> = {
  "1.1": envSwitch(process.env.PART_1_1_LIVE, true),
  "1.2": envSwitch(process.env.PART_1_2_LIVE, true),
  "2": envSwitch(process.env.PART_2_LIVE, true),
  "3": envSwitch(process.env.PART_3_LIVE, true) || part3LiveForTests(),
};

/**
 * Release switches the owner can flip in Vercel (Settings > Environment Variables) without a new commit: `PART_1_1_LIVE`,
 * `PART_1_2_LIVE`, `PART_2_LIVE`, `PART_3_LIVE`, `FULL_MOCK_LIVE` and `TEACHER_LIVE`. Only the exact words `true` / `1`
 * (on) and `false` / `0` (off), in any letter case, count; unset, empty or anything else (a typo, "yes") keeps the
 * default: ON for every part, 1.1, 1.2, 2 and 3 (owner decisions 2026-11-15 and, for Part 1.2, 2026-11-24: no manual Vercel
 * step; Part 3 passed its live anchor run, Part 1.2 its anchors 3 of 3), so the full mock is open too; OFF for teacher marking. Set a switch to `false` in Vercel to close a part again. A switch is read when the server starts, so a
 * change needs a Redeploy in Vercel (no commit). They are server-only on purpose (no NEXT_PUBLIC_ prefix): no client
 * component reads them. docs/pilot-runbook.md says when to turn each on.
 */
export function envSwitch(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

/**
 * The test-only Part 3 switch: a test server (`next dev` on a developer machine or CI, started by playwright.part3.config.ts
 * with CEFRO_TEST_PART3_LIVE=1) turns Part 3 on so the real Part 3 pages can be driven in a browser. Ignored in production
 * builds and on Vercel. The owner's switch for the real thing is `PART_3_LIVE` (above), after the live anchor run
 * (docs/part3-plan.md).
 */
function part3LiveForTests(): boolean {
  return process.env.CEFRO_TEST_PART3_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/**
 * The full mock exam (docs/v1-plan.md, section 3.2) plays Parts 1.1, 1.2, 2 and 3 back to back, so its real flow is open
 * when ALL four parts are live (`PART_LIVE`), or when the owner sets `FULL_MOCK_LIVE=true` (the mock can then be open while the
 * single parts stay "Coming soon", which is the pilot's setup), or on a test server that sets CEFRO_TEST_FULL_MOCK_LIVE=1
 * (`next dev` on a developer machine or CI only, ignored when `NODE_ENV=production` or `VERCEL` is set). Anything
 * else: "Coming soon" on the task list, and the mock's routes answer 404. Mock mode (`?mock=1`) works either way.
 * `FULL_MOCK_LIVE=false` does not close a mock that all four live parts open: switch a part off for that.
 */
export function fullMockLive(live: Readonly<Record<ExamPartId, boolean>> = PART_LIVE): boolean {
  return Object.values(live).every(Boolean) || FULL_MOCK_SWITCH || fullMockLiveForTests();
}

const FULL_MOCK_SWITCH = envSwitch(process.env.FULL_MOCK_LIVE, false);

function fullMockLiveForTests(): boolean {
  return process.env.CEFRO_TEST_FULL_MOCK_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/**
 * Release switch for the Teacher view (docs/teacher-plan.md). ON: teachers sign themselves up and their students join
 * with a class code, with nothing for the owner to approve. The owner can still turn it off with `TEACHER_LIVE=false`
 * in Vercel, and then every real teacher page and API, and the student's Join / Share / Leave, answer 404. Mock mode
 * (`?mock=1`, the demo teacher and class DEMO42) works either way. Not a preview flag: `?flags=off` leaves it alone.
 */
export const TEACHER_LIVE = envSwitch(process.env.TEACHER_LIVE, true) || teacherLiveForTests();

/**
 * The test-only Teacher switch: a test server (`next dev` on a developer machine or CI, started by
 * playwright.exam-laptop.config.ts with CEFRO_TEST_TEACHER_LIVE=1, like Part 3's and the full mock's switches) turns it on so the
 * real exam-laptop screens can be driven in a browser with a real database. Ignored in production builds and on Vercel. The unit
 * tests use `setTeacherLiveForTesting` instead.
 */
function teacherLiveForTests(): boolean {
  return process.env.CEFRO_TEST_TEACHER_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}
