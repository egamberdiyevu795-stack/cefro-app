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
  history: true,
  settings: true,
  /** Row menu on attempts (Delete, Report a wrong score). */
  attemptMenu: true,
  /** "Your exam: in N days" card. */
  examCountdown: true,
  /** Result page: "Lesson" link under the biggest fix (the lesson for that fix). */
  fixLesson: true,
  /** Result page: "Play recording" above the transcript. */
  recordingPlayback: true,
} as const satisfies Record<string, boolean>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export type FeatureFlags = Record<FeatureFlag, boolean>;

/** Every flag set to `on`. Used by the prototype's `?flags=off` switch to preview the page without future elements. */
export function allFlags(on: boolean): FeatureFlags {
  return Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, on])) as FeatureFlags;
}
