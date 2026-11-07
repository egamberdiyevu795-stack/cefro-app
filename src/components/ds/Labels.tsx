import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * The only attempt status: "Scoring…" (hourglass) while an answer is being processed. A scored attempt shows its
 * level instead; there is no Passed/Failed. Grey glyph + dark word, never colour.
 */
export function ScoringLabel({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-label text-fg", className)}>
      <Icon name="scoring" size={14} className="text-fg-subtle" />
      Scoring…
    </span>
  );
}

/** Small lime pill for a positive change ("Up from A2"). Only for improvements. */
export function DeltaLabel({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <span aria-label={label} className="inline-flex h-6 items-center rounded-full bg-lime px-2.5 text-caption font-medium text-on-lime">
      {children}
    </span>
  );
}

/** The demo label's words, shared with the tests: on a result built from mock data, and on a page in mock mode. */
export const DEMO_RESULT_TEXT = "Demo result. Your answer was not scored.";
export const DEMO_MODE_TEXT = "Demo mode. Your answer won't be scored.";

/**
 * Marks a screen that shows mock data, so a tester never mistakes a saved demo score for their own. `result` (default)
 * on the result prototype's screens; `mode` on the practice page in mock mode, where nothing has been scored yet.
 * A grey `well` pill with an info glyph and dark words: not a button, no colour. Off a card (on the page background)
 * pass `className="bg-card"` so the pill still shows. Never shown on a real result.
 */
export function DemoLabel({ variant = "result", className }: { variant?: "result" | "mode"; className?: string }) {
  return (
    <p
      role="note"
      data-testid="demo-label"
      className={cx("inline-flex items-center gap-1.5 rounded-full bg-well px-2.5 py-1 text-label font-medium text-fg", className)}
    >
      <Icon name="info" size={14} className="shrink-0 text-fg-subtle" />
      {variant === "mode" ? DEMO_MODE_TEXT : DEMO_RESULT_TEXT}
    </p>
  );
}
