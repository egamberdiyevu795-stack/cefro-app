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
