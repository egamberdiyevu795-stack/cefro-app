/** Class strings shared by server and client components so a control looks the same whichever renders it. */

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Round icon-only button (bell, row menu). Size is set separately (size-7 / size-8). */
export const ICON_BUTTON = `inline-flex shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-well hover:text-fg ${FOCUS_RING}`;

/** Sidebar / bottom-bar item. */
export const NAV_ITEM = `flex size-11 items-center justify-center rounded-icon transition-colors ${FOCUS_RING}`;
export const NAV_ITEM_ACTIVE = "bg-primary text-on-primary";
/** The current item on a page whose one black button is its own main action (a lesson): grey square, dark glyph. */
export const NAV_ITEM_ACTIVE_QUIET = "bg-well text-fg";
export const NAV_ITEM_IDLE = "text-fg-subtle hover:text-fg";

/** Quiet text action with a small grey glyph (top bar). */
export const TEXT_ACTION = `items-center gap-2 text-body font-medium text-fg hover:text-fg-muted ${FOCUS_RING}`;

/** Small muted text action (card header: "See all", "Last 30 days", "Edit"). */
export const SMALL_ACTION = `inline-flex items-center gap-1 text-label text-fg-muted hover:text-fg ${FOCUS_RING}`;

/** The quiet pill (PillButton `quiet`, size md), for a flagged "Coming soon" button that must look like one. */
export const PILL_QUIET = `inline-flex h-9 items-center justify-center gap-2 rounded-full bg-well px-5 text-body font-medium text-fg transition-colors hover:bg-line ${FOCUS_RING}`;
