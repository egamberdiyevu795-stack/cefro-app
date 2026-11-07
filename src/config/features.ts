import type { ExamPartId } from "@/domain/speaking/exam-part";

/**
 * Feature flags for elements that are designed but not built yet.
 *
 * On: the element is shown and tapping it says "Coming soon" (the prototype default, so the design stays visible).
 * Off: the element is not rendered at all. Turn a flag off before shipping a page that would show an unbuilt feature,
 * and delete it once the feature is real.
 */
export const FEATURE_FLAGS = {
  /** Bell in the top bar. */
  notifications: true,
  /** Search field in the top bar. */
  search: true,
  /** "Mock exam" link in the top bar. */
  mockExam: true,
  /** "Last 30 days" filter on the progress card. */
  periodFilter: true,
  /** Sidebar / bottom-bar items. */
  lessons: true,
  /** History: the real page (`/history`) and its links (sidebar, "See all"). Off: no link, and the page is a 404. */
  history: true,
  /** Row menu on attempts (Delete, Report a wrong score). */
  attemptMenu: true,
  /** "Your exam: in N days" card. */
  examCountdown: true,
  /** Result page: "Play recording" above the transcript. */
  recordingPlayback: true,
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
  "3": false,
};

/**
 * Release switch for the Teacher view (docs/teacher-plan.md). Off until parent consent for under-18s exists (plan
 * section 7): every real teacher page and API, and the student's Join / Share / Leave, answer 404. Mock mode
 * (`?mock=1`, the demo teacher and class DEMO42) works either way. Not a preview flag: `?flags=off` leaves it alone.
 */
export const TEACHER_LIVE = false;
