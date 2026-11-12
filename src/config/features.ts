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
  "1.1": false,
  "1.2": false,
  "2": true,
  "3": part3LiveForTests(),
};

/**
 * Part 3 is NOT live: its value is `false` in the product, on Vercel and in production builds, whatever is set. Only a
 * test server (`next dev` on a developer machine or CI, started by playwright.part3.config.ts with
 * CEFRO_TEST_PART3_LIVE=1) can turn it on, so the real Part 3 pages can be driven in a browser. The unit tests mock
 * `PART_LIVE` instead. Turning Part 3 on for real is a decision for the owner, after the live anchor run
 * (docs/part3-plan.md).
 */
function part3LiveForTests(): boolean {
  return process.env.CEFRO_TEST_PART3_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/**
 * The full mock exam (docs/v1-plan.md, section 3.2) plays Parts 1.1, 1.2, 2 and 3 back to back, so its real flow is open
 * only when ALL four parts are live (`PART_LIVE`), or on a test server that sets CEFRO_TEST_FULL_MOCK_LIVE=1 (like Part 3's
 * switch: `next dev` on a developer machine or CI only, ignored when `NODE_ENV=production` or `VERCEL` is set). Anything
 * else: "Coming soon" on the task list, and the mock's routes answer 404. Mock mode (`?mock=1`) works either way.
 * Turning the real mock on is the owner's decision; it needs no switch of its own.
 */
export function fullMockLive(live: Readonly<Record<ExamPartId, boolean>> = PART_LIVE): boolean {
  return Object.values(live).every(Boolean) || fullMockLiveForTests();
}

function fullMockLiveForTests(): boolean {
  return process.env.CEFRO_TEST_FULL_MOCK_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/**
 * Release switch for the Teacher view (docs/teacher-plan.md). Off until parent consent for under-18s exists (plan
 * section 7): every real teacher page and API, and the student's Join / Share / Leave, answer 404. Mock mode
 * (`?mock=1`, the demo teacher and class DEMO42) works either way. Not a preview flag: `?flags=off` leaves it alone.
 */
export const TEACHER_LIVE = teacherLiveForTests();

/**
 * The Teacher view is NOT live: `TEACHER_LIVE` is `false` in the product, on Vercel and in production builds, whatever is set.
 * Only a test server (`next dev` on a developer machine or CI, started by playwright.exam-laptop.config.ts with
 * CEFRO_TEST_TEACHER_LIVE=1, like Part 3's and the full mock's switches) can turn it on, so the real exam-laptop screens can be
 * driven in a browser with a real database. The unit tests use `setTeacherLiveForTesting` instead.
 */
function teacherLiveForTests(): boolean {
  return process.env.CEFRO_TEST_TEACHER_LIVE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}
