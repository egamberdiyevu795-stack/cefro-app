/** Class strings shared by server and client components so a control looks the same whichever renders it. */

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Round icon-only button (bell, row menu). Size is set separately (size-7 / size-8). */
export const ICON_BUTTON = `inline-flex shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-well hover:text-fg ${FOCUS_RING}`;

/** Sidebar / bottom-bar item. */
export const NAV_ITEM = `flex size-11 items-center justify-center rounded-icon transition-colors ${FOCUS_RING}`;
/** The current item: a grey square with a dark glyph, never black, so the page's own black button is the only one. */
export const NAV_ITEM_ACTIVE = "bg-well text-fg";
export const NAV_ITEM_IDLE = "text-fg-subtle hover:text-fg";

/** Quiet text action with a small grey glyph (top bar). */
export const TEXT_ACTION = `items-center gap-2 text-body font-medium text-fg hover:text-fg-muted ${FOCUS_RING}`;

/** Small muted text action (card header: "See all", "Last 30 days", "Edit"). */
export const SMALL_ACTION = `inline-flex items-center gap-1 text-label text-fg-muted hover:text-fg ${FOCUS_RING}`;

/** Small destructive text action (Close class, Leave class, Reset code): red, so the risk is visible before the confirm card. */
export const SMALL_DANGER_ACTION = `inline-flex items-center gap-1 text-label font-medium text-danger hover:opacity-80 ${FOCUS_RING}`;

/** The quiet pill (PillButton `quiet`, size md), as a class string for a control that is not a PillButton. */
export const PILL_QUIET = `inline-flex h-9 items-center justify-center gap-2 rounded-full bg-well px-5 text-body font-medium text-fg transition-colors hover:bg-line ${FOCUS_RING}`;

/** The danger pill (PillButton `danger`, size md) as a class string: destructive submit buttons (Delete everything). */
export const PILL_DANGER = `inline-flex h-9 items-center justify-center gap-2 rounded-full bg-danger-soft px-5 text-body font-medium text-danger transition-colors hover:bg-danger-soft/70 ${FOCUS_RING}`;
